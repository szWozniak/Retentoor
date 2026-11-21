"""Weather beyond today – lets the analysis date lie up to HORIZON_DAYS in the future.

A provider returns daily P / ET0 (same columns as meteo) for the days around today. Today there is one provider:
the Open-Meteo numerical weather forecast (16 days). Statistical models (e.g. SARIMAX on the 10-year series, for
longer horizons or as an ensemble) can be added later as further providers without touching the analysis code:
it only sees a ForecastResult and the `method` label that is reported to the user.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

import pandas as pd

from . import cache, meteo

HORIZON_DAYS = 16  # Open-Meteo forecast range; the API rejects analysis dates beyond today + HORIZON_DAYS


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


# tried in order; the first one that answers wins
PROVIDERS: list[Callable[[float, float], Awaitable[ForecastResult]]] = [openmeteo_nwp]


async def get(lat: float, lon: float) -> ForecastResult | None:
    for provider in PROVIDERS:
        try:
            return await provider(lat, lon)
        except Exception:  # noqa: BLE001 – next provider / no forecast
            continue
    return None


def describe(method: str) -> str:
    return {"nwp": "prognoza pogody (model numeryczny Open-Meteo)"}.get(method, method)


def fetched_at(fr: ForecastResult) -> datetime | None:
    return fr.source.get("fetched_at")
