"""Open-Meteo daily weather (CC-BY 4.0).

- Historical: Archive API (ERA5 / ERA5-Land reanalysis), ~5 days behind real time.
- Last days before the analysis date and future analysis dates (up to 16 days): forecast provider
  (services/forecast.py – Open-Meteo Forecast API with past_days fills the archive lag).
ET0 = FAO-56 Penman-Monteith reference evapotranspiration (Open-Meteo's et0_fao_evapotranspiration)."""

import asyncio
import json
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta

import pandas as pd

from ..config import settings
from . import cache, forecast, nasa_power
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
    forecast: "forecast.ForecastResult | None" = None  # weather forecast used (recent days and/or future days)
    forecast_from: date | None = None  # first day in df that is a forecast, not an observation (future dates only)


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


BLOCK_S = 300  # after Open-Meteo says 429, skip it for this long: every new grid cell would otherwise waste ~5 s on retries
_blocked_until = 0.0


async def _get(url: str, params: dict) -> str:
    """GET with a short backoff on 429 (Open-Meteo free tier limits are per IP – shared at events).

    Circuit breaker: one 429 that survives the retries blocks Open-Meteo for BLOCK_S for all cells, so callers fall back
    (NASA POWER, MET Norway) immediately instead of retrying for each new parcel."""
    global _blocked_until
    if time.monotonic() < _blocked_until:
        raise RateLimited("Open-Meteo: przekroczony limit zapytań (429) – chwilowo używamy źródeł zapasowych.")
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
        _blocked_until = time.monotonic() + BLOCK_S
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

    fr = None
    forecast_from = None
    if analysis_date > archive_end:
        fr = await forecast.get(lat, lon)
        if fr is not None:
            recent = fr.df[(fr.df.index > pd.Timestamp(archive_end)) & (fr.df.index <= pd.Timestamp(analysis_date))]
            if len(recent):
                df = pd.concat([df, recent])
                # today's daily total is partly observed, so "forecast" starts tomorrow
                past = recent[recent.index <= pd.Timestamp(fr.issued)]
                future = recent[recent.index > pd.Timestamp(fr.issued)]
                if len(past):
                    sources.append({**fr.source, "name": f"{fr.source['name']} – ostatnie dni",
                                    "range": f"{past.index.min().date()} – {past.index.max().date()}"})
                if len(future):
                    forecast_from = future.index.min().date()
                    sources.append({**fr.source, "range": f"{forecast_from} – {future.index.max().date()}"})
                    limitations.extend(fr.notes)
        last = df.index.max().date() if len(df) else start
        if last < analysis_date:
            limitations.append(f"Dane pogodowe dostępne do {last.isoformat()} – ostatnie {(analysis_date - last).days} dni przed datą analizy nie są uwzględnione.")

    df = df[~df.index.duplicated(keep="last")].sort_index()
    return MeteoResult(df=df, lat=clat, lon=clon, sources=sources, limitations=limitations, forecast=fr, forecast_from=forecast_from)


def rain_ahead(fr: "forecast.ForecastResult | None", after: date, days: int = 7) -> dict | None:
    """Forecast P / ET0 for the `days` days after `after` (irrigation advice). None if the forecast does not cover them."""
    if fr is None:
        return None
    w = fr.window(after + timedelta(days=1), days)
    w = w[w.index >= pd.Timestamp(fr.issued)]  # only real forecast days
    if len(w) < min(days, 3):
        return None
    return {
        "p_next7_mm": round(float(w["P"].fillna(0).sum()), 1),
        "et0_next7_mm": round(float(w["ET0"].fillna(0).sum()), 1),
        "days": len(w),
        "fetched_at": fr.source["fetched_at"],
    }


def fetched(sources: list[dict]) -> datetime | None:
    ts = [s["fetched_at"] for s in sources if s.get("fetched_at")]
    return min(ts) if ts else None
