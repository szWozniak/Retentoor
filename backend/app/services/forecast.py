"""Weather beyond today – lets the analysis date lie up to HORIZON_DAYS in the future.

A provider returns daily P / ET0 (same columns as meteo) for the days around today. Providers, tried in order:
1. Open-Meteo numerical weather forecast (16 days, ET0 included);
2. MET Norway Locationforecast (~10 days; independent service, used when Open-Meteo is down or rate-limited;
   ET0 computed here with FAO-56 Penman-Monteith, solar radiation estimated from cloud cover).
Statistical models (e.g. SARIMAX on the 10-year series, for longer horizons or as an ensemble) can be added later as further providers without touching the analysis code:
it only sees a ForecastResult and the `method` label that is reported to the user.
"""

import json
import math
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

import httpx
import pandas as pd

from . import cache, meteo, nasa_power

HORIZON_DAYS = 16  # longest provider range (Open-Meteo); the API rejects analysis dates beyond today + HORIZON_DAYS


@dataclass
class ForecastResult:
    df: pd.DataFrame  # index: date; columns as meteo (P, ET0, Tmax, Tmean); includes up to 14 recent past days
    issued: date  # first day that is a forecast (= today); rows before it are model analysis of recent days
    method: str  # "nwp" = numerical weather prediction; later e.g. "sarimax"
    source: dict  # {"name", "url", "license", "fetched_at"}
    notes: list[str] = field(default_factory=list)

    def future(self) -> pd.DataFrame:
        return self.df[self.df.index >= pd.Timestamp(self.issued)]

    def window(self, start: date, days: int) -> pd.DataFrame:
        return self.df.loc[pd.Timestamp(start) : pd.Timestamp(start + timedelta(days=days - 1))]


async def openmeteo_nwp(lat: float, lon: float) -> ForecastResult:
    clat, clon = meteo._cell(lat), meteo._cell(lon)
    today = date.today()
    params = {"latitude": clat, "longitude": clon, "past_days": 14, "forecast_days": HORIZON_DAYS,
              "daily": meteo.DAILY, "timezone": "Europe/Warsaw"}
    text, fetched_at, _ = await cache.cached(
        "openmeteo_nwp", f"{clat},{clon}:{today}", lambda: meteo._get(meteo.FORECAST_URL, params), max_age=timedelta(hours=3)
    )
    return ForecastResult(
        df=meteo._to_df(text).dropna(subset=["P", "ET0"], how="all"),
        issued=today,
        method="nwp",
        source={"name": "Open-Meteo Forecast API (prognoza numeryczna, 16 dni)", "url": meteo.FORECAST_URL,
                "license": "CC BY 4.0", "fetched_at": fetched_at},
    )


METNO_URL = "https://api.met.no/weatherapi/locationforecast/2.0/complete"
# api.met.no terms: identify the application in the User-Agent (no personal data needed)
METNO_HEADERS = {"User-Agent": "Retentoor/0.1 (HackNation 2026 prototype; KOWR water-retention advisor)"}


def _metno_daily(payload: str, lat: float) -> pd.DataFrame:
    """Hourly (first ~2.5 days) and 6-hourly steps -> daily P, Tmax, Tmin, Tmean, RH, U2, Rs, ET0 (Europe/Warsaw days).
    Only complete days (>= 18 h covered) after today are kept."""
    js = json.loads(payload)
    elev = (js.get("geometry", {}).get("coordinates") or [0, 0, 100])[2] or 100
    ts = js["properties"]["timeseries"]
    rows = []
    for i, t in enumerate(ts[:-1]):
        start = pd.Timestamp(t["time"]).tz_convert("Europe/Warsaw")
        step_h = (pd.Timestamp(ts[i + 1]["time"]) - pd.Timestamp(t["time"])).total_seconds() / 3600
        nxt = t["data"].get("next_1_hours" if step_h <= 1 else "next_6_hours")
        if not nxt:
            continue
        inst = t["data"]["instant"]["details"]
        rows.append({
            "day": start.normalize().tz_localize(None), "h": step_h,
            "P": nxt["details"].get("precipitation_amount", 0.0),
            "T": inst.get("air_temperature"), "RH": inst.get("relative_humidity"),
            "U10": inst.get("wind_speed"), "cloud": inst.get("cloud_area_fraction"),
        })
    h = pd.DataFrame(rows)
    g = h.groupby("day")

    def wmean(col: str) -> pd.Series:  # time-weighted daily mean
        return (h[col] * h["h"]).groupby(h["day"]).sum() / g["h"].sum()

    d = pd.DataFrame({
        "P": g["P"].sum(), "Tmax": g["T"].max(), "Tmin": g["T"].min(), "Tmean": wmean("T"), "RH": wmean("RH"),
        "U2": wmean("U10") * 4.87 / math.log(67.8 * 10 - 5.42),  # FAO-56 eq. 47: wind at 10 m -> 2 m
        "cloud": wmean("cloud"), "hours": g["h"].sum(),
    })
    d = d[(d["hours"] >= 18) & (d.index > pd.Timestamp(date.today()))]
    # Angstrom (FAO-56 eq. 35) with sunshine fraction n/N ~ 1 - cloud cover
    d["Rs"] = (0.25 + 0.5 * (1 - d["cloud"] / 100)) * nasa_power.extraterrestrial_radiation(d.index, lat)
    d["ET0"] = nasa_power.et0_fao56(d, lat, float(elev))
    return d[["P", "ET0", "Tmax", "Tmean"]]


async def metno(lat: float, lon: float) -> ForecastResult:
    clat, clon = meteo._cell(lat), meteo._cell(lon)
    today = date.today()

    async def fetch() -> str:
        async with httpx.AsyncClient(timeout=15, headers=METNO_HEADERS, follow_redirects=True) as c:
            r = await c.get(METNO_URL, params={"lat": f"{clat:.4f}", "lon": f"{clon:.4f}"})
            r.raise_for_status()
            return r.text

    text, fetched_at, _ = await cache.cached("metno", f"{clat},{clon}:{today}", fetch, max_age=timedelta(hours=3))
    return ForecastResult(
        df=_metno_daily(text, clat),
        issued=today,
        method="metno",
        source={"name": "MET Norway Locationforecast (prognoza numeryczna, ok. 10 dni; ET₀ wg FAO-56)", "url": METNO_URL,
                "license": "CC BY 4.0 (MET Norway)", "fetched_at": fetched_at},
        notes=["Prognozę pobrano z zapasowego źródła MET Norway: ET₀ policzono metodą FAO-56, a promieniowanie słoneczne oszacowano z zachmurzenia."],
    )


# tried in order; the first one that answers wins
PROVIDERS: list[Callable[[float, float], Awaitable[ForecastResult]]] = [openmeteo_nwp, metno]


def is_rate_limit(e: BaseException) -> bool:
    return isinstance(e, meteo.RateLimited) or (isinstance(e, httpx.HTTPStatusError) and e.response.status_code == 429)


async def get(lat: float, lon: float) -> ForecastResult | None:
    for provider in PROVIDERS:
        try:
            return await provider(lat, lon)
        except Exception:  # noqa: BLE001 – next provider / no forecast
            continue
    return None


def describe(method: str) -> str:
    return {"nwp": "prognoza pogody (model numeryczny Open-Meteo)", "metno": "prognoza pogody (MET Norway)"}.get(method, method)


def fetched_at(fr: ForecastResult) -> datetime | None:
    return fr.source.get("fetched_at")
