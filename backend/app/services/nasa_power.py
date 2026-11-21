"""NASA POWER daily point data (https://power.larc.nasa.gov) – fallback weather source.

Free, no API key, global ~0.5° grid, 1981→present (few days latency). POWER data are public
(NASA Earth Science Data policy; please acknowledge "NASA POWER Project").
Reference evapotranspiration is computed here with the full FAO-56 Penman-Monteith equation
(Allen et al. 1998, eq. 6) from Tmax/Tmin/RH/wind(2 m)/solar radiation."""

import json
import math

import numpy as np
import pandas as pd

from . import cache
from .http import client

URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
PARAMS = "PRECTOTCORR,T2M_MAX,T2M_MIN,T2M,RH2M,WS2M,ALLSKY_SFC_SW_DWN"


def _es(t):
    return 0.6108 * np.exp(17.27 * t / (t + 237.3))


def extraterrestrial_radiation(index: pd.DatetimeIndex, lat: float) -> np.ndarray:
    """Ra [MJ m-2 day-1], FAO-56 eq. 21."""
    j = index.dayofyear.values
    phi = math.radians(lat)
    dr = 1 + 0.033 * np.cos(2 * np.pi * j / 365)
    dec = 0.409 * np.sin(2 * np.pi * j / 365 - 1.39)
    ws = np.arccos(np.clip(-np.tan(phi) * np.tan(dec), -1, 1))
    return 24 * 60 / np.pi * 0.0820 * dr * (ws * np.sin(phi) * np.sin(dec) + np.cos(phi) * np.cos(dec) * np.sin(ws))


def et0_fao56(df: pd.DataFrame, lat: float, elev: float) -> pd.Series:
    """Daily FAO-56 Penman-Monteith ET0 [mm/day]. Rs in MJ m-2 day-1, u2 in m/s, RH in %."""
    tmax, tmin, tmean = df["Tmax"], df["Tmin"], df["Tmean"]
    rh, u2, rs = df["RH"], df["U2"], df["Rs"]
    es = (_es(tmax) + _es(tmin)) / 2
    ea = rh / 100 * es
    delta = 4098 * _es(tmean) / (tmean + 237.3) ** 2
    pressure = 101.3 * ((293 - 0.0065 * elev) / 293) ** 5.26
    gamma = 0.000665 * pressure

    ra = extraterrestrial_radiation(df.index, lat)
    rso = (0.75 + 2e-5 * elev) * ra
    rns = 0.77 * rs
    ratio = np.clip(rs / np.where(rso > 0, rso, np.nan), 0.25, 1.0)
    rnl = 4.903e-9 * (((tmax + 273.16) ** 4 + (tmin + 273.16) ** 4) / 2) * (0.34 - 0.14 * np.sqrt(ea.clip(lower=0))) * (1.35 * ratio - 0.35)
    rn = rns - rnl
    et0 = (0.408 * delta * rn + gamma * 900 / (tmean + 273) * u2 * (es - ea)) / (delta + gamma * (1 + 0.34 * u2))
    return et0.clip(lower=0)


async def daily(lat: float, lon: float, start: str, end: str) -> tuple[pd.DataFrame, object]:
    """Returns (df with P, ET0, Tmax, Tmean; fetched_at). start/end as YYYYMMDD."""
    clat, clon = round(lat * 2) / 2, round(lon * 1.6) / 1.6  # POWER grid ≈ 0.5° × 0.625°
    params = {"parameters": PARAMS, "community": "AG", "latitude": f"{clat:.3f}", "longitude": f"{clon:.3f}",
              "start": start, "end": end, "format": "JSON"}

    async def fetch() -> str:
        async with client() as c:
            r = await c.get(URL, params=params, timeout=40)
            r.raise_for_status()
            return r.text

    text, fetched_at, _ = await cache.cached("nasa_power", f"{clat:.3f},{clon:.3f}:{start}:{end}", fetch)
    js = json.loads(text)
    p = js["properties"]["parameter"]
    elev = (js.get("geometry", {}).get("coordinates") or [0, 0, 150])[2] or 150
    raw = pd.DataFrame(
        {
            "P": p["PRECTOTCORR"], "Tmax": p["T2M_MAX"], "Tmin": p["T2M_MIN"], "Tmean": p["T2M"],
            "RH": p["RH2M"], "U2": p["WS2M"], "Rs": p["ALLSKY_SFC_SW_DWN"],
        }
    )
    raw.index = pd.to_datetime(raw.index, format="%Y%m%d")
    raw = raw.replace(-999.0, np.nan).sort_index()
    raw["ET0"] = et0_fao56(raw, clat, float(elev))
    return raw[["P", "ET0", "Tmax", "Tmean"]], fetched_at
