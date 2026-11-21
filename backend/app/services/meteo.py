"""Open-Meteo daily weather (CC-BY 4.0).

- Historical: Archive API (ERA5 / ERA5-Land reanalysis), ~5 days behind real time.
- Last days before the analysis date: Forecast API with past_days (fills the archive lag).
ET0 = FAO-56 Penman-Monteith reference evapotranspiration (Open-Meteo's et0_fao_evapotranspiration)."""

import asyncio
import json
from dataclasses import dataclass
from datetime import date, datetime, timedelta

import pandas as pd

from ..config import settings
from . import cache, nasa_power
from .http import client

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
DAILY = "precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_mean"
ARCHIVE_LAG_DAYS = 6


@dataclass
class MeteoResult:
    df: pd.DataFrame  # index: date; columns: P, ET0, Tmax, Tmean
    lat: float
    lon: float
    sources: list[dict]
    limitations: list[str]


def _cell(x: float) -> float:
    # ERA5-Land is ~0.1°; round to 0.05° so neighbouring parcels share the cache
    return round(round(x / 0.05) * 0.05, 2)


def _to_df(payload: str) -> pd.DataFrame:
    d = json.loads(payload)["daily"]
    df = pd.DataFrame(
        {
            "P": d["precipitation_sum"],
            "ET0": d["et0_fao_evapotranspiration"],
            "Tmax": d["temperature_2m_max"],
            "Tmean": d["temperature_2m_mean"],
        },
        index=pd.to_datetime(d["time"]),
    )
    return df


class RateLimited(Exception):
    pass


async def _get(url: str, params: dict) -> str:
    """GET with a short backoff on 429 (Open-Meteo free tier limits are per IP – shared at events)."""
    if settings.openmeteo_api_key:
        # paid plan: same API on customer-* hosts, authenticated with apikey
        url = url.replace("https://archive-api.", "https://customer-archive-api.").replace("https://api.", "https://customer-api.")
        params = {**params, "apikey": settings.openmeteo_api_key}
    async with client() as c:
        for wait in (0, 1.5, 4):
            if wait:
                await asyncio.sleep(wait)
            r = await c.get(url, params=params)
            if r.status_code != 429:
                r.raise_for_status()
                return r.text
        raise RateLimited("Open-Meteo: przekroczony limit zapytań (429). Spróbuj za chwilę.")


ARCHIVE_YEARS = 21  # covers any analysis date in the last 10 years + its own 10-year history


async def daily_history(lat: float, lon: float, analysis_date: date, years: int = 10) -> MeteoResult:
    """Daily weather from (start of year − 10 y) to the analysis date.

    Primary: Open-Meteo archive (ERA5-Land, ~9 km) – ONE request per grid cell for a 21-year span, reused by all
    analysis dates. Fallback: NASA POWER (~50 km) with ET0 computed by FAO-56 Penman-Monteith – used when
    Open-Meteo is unavailable or rate-limited. The last days are filled from the Open-Meteo forecast API if possible."""
    clat, clon = _cell(lat), _cell(lon)
    start = date(analysis_date.year - years, 1, 1)
    today = date.today()
    full_start = date(today.year - ARCHIVE_YEARS, 1, 1)
    full_end = today - timedelta(days=ARCHIVE_LAG_DAYS)
    limitations: list[str] = []

    a_params = {
        "latitude": clat, "longitude": clon, "start_date": full_start.isoformat(), "end_date": full_end.isoformat(),
        "daily": DAILY, "timezone": "Europe/Warsaw",
    }
    try:
        text, fetched_at, _ = await cache.cached(
            "openmeteo_archive", f"{clat},{clon}:full{ARCHIVE_YEARS}", lambda: _get(ARCHIVE_URL, a_params), max_age=timedelta(days=1)
        )
        df = _to_df(text)
        provider = {"name": "Open-Meteo Historical Weather API (ERA5/ERA5-Land)", "url": ARCHIVE_URL, "license": "CC BY 4.0"}
        limitations.append("Dane meteorologiczne pochodzą z reanalizy ERA5/ERA5-Land (siatka ok. 9–25 km), a nie z pomiaru na działce.")
    except Exception:
        df, fetched_at = await nasa_power.daily(lat, lon, full_start.strftime("%Y%m%d"), today.strftime("%Y%m%d"))
        provider = {"name": "NASA POWER (MERRA-2) – dane zapasowe; ET₀ liczone metodą FAO-56 Penman-Monteith", "url": nasa_power.URL,
                    "license": "dane publiczne NASA (NASA POWER Project)"}
        limitations.append("Główne źródło pogody (Open-Meteo) było niedostępne – użyto danych zapasowych NASA POWER (siatka ok. 50 km), mniej szczegółowych przestrzennie.")
        limitations.append("Ewapotranspirację ET₀ obliczono metodą FAO-56 Penman-Monteith z temperatury, wilgotności, wiatru i promieniowania (NASA POWER).")

    df = df.dropna(subset=["P", "ET0"], how="all")
    df = df[(df.index >= pd.Timestamp(start)) & (df.index <= pd.Timestamp(analysis_date))]
    archive_end = df.index.max().date() if len(df) else start
    sources = [{**provider, "fetched_at": fetched_at, "range": f"{start} – {archive_end}"}]

    if analysis_date > archive_end:
        f_params = {"latitude": clat, "longitude": clon, "past_days": 14, "forecast_days": 1, "daily": DAILY, "timezone": "Europe/Warsaw"}
        try:
            text, f_at, _ = await cache.cached(
                "openmeteo_recent", f"{clat},{clon}:{today}", lambda: _get(FORECAST_URL, f_params), max_age=timedelta(hours=6)
            )
            recent = _to_df(text)
            recent = recent[(recent.index > pd.Timestamp(archive_end)) & (recent.index <= pd.Timestamp(analysis_date))]
            if len(recent):
                df = pd.concat([df, recent])
                sources.append({"name": "Open-Meteo Forecast API (ostatnie dni)", "url": FORECAST_URL, "fetched_at": f_at,
                                "range": f"{recent.index.min().date()} – {recent.index.max().date()}", "license": "CC BY 4.0"})
        except Exception:
            pass
        last = df.index.max().date() if len(df) else start
        if last < analysis_date:
            limitations.append(f"Dane pogodowe dostępne do {last.isoformat()} – ostatnie {(analysis_date - last).days} dni przed datą analizy nie są uwzględnione.")

    df = df[~df.index.duplicated(keep="last")].sort_index()
    return MeteoResult(df=df, lat=clat, lon=clon, sources=sources, limitations=limitations)


async def forecast_7d(lat: float, lon: float) -> dict:
    """Precipitation and ET0 forecast for the next 7 days (only meaningful when analysing 'today')."""
    clat, clon = _cell(lat), _cell(lon)
    params = {"latitude": clat, "longitude": clon, "forecast_days": 7, "daily": "precipitation_sum,et0_fao_evapotranspiration",
              "timezone": "Europe/Warsaw"}
    text, fetched_at, _ = await cache.cached(
        "openmeteo_forecast", f"{clat},{clon}:{date.today()}", lambda: _get(FORECAST_URL, params), max_age=timedelta(hours=3)
    )
    d = json.loads(text)["daily"]
    return {
        "p_next7_mm": round(sum(v or 0 for v in d["precipitation_sum"]), 1),
        "et0_next7_mm": round(sum(v or 0 for v in d["et0_fao_evapotranspiration"]), 1),
        "fetched_at": fetched_at,
    }


def fetched(sources: list[dict]) -> datetime | None:
    ts = [s["fetched_at"] for s in sources if s.get("fetched_at")]
    return min(ts) if ts else None
