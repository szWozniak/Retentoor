"""Climatic water balance (KBW) drought assessment – IUNG-PIB SMSR method.

KBW = Σ precipitation − Σ potential evapotranspiration over a six-decade (~60-day) period.
Drought (≥20% yield loss) when KBW < critical value for the crop and soil category
(Rozporządzenie MRiRW z 11.04.2019, Dz.U. 2019 poz. 739; table: susza.iung.pulawy.pl/progi).

Note: IUNG uses a modified Penman ETP; we use FAO-56 Penman-Monteith ET0 from Open-Meteo."""

import json
from dataclasses import dataclass
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

DATA = Path(__file__).resolve().parent.parent / "data" / "kbw_thresholds.json"
ROMAN_MONTH = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8, "IX": 9, "X": 10, "XI": 11, "XII": 12}


@dataclass(frozen=True)
class Period:
    index: int
    label: str
    start: tuple[int, int]  # (month, day)
    end: tuple[int, int]

    def dates(self, year: int) -> tuple[date, date]:
        return date(year, *self.start), date(year, *self.end)


def _parse_dm(s: str) -> tuple[int, int]:
    day, month = s.strip().split(".")
    return ROMAN_MONTH[month], int(day)


@lru_cache
def table() -> dict:
    return json.loads(DATA.read_text(encoding="utf-8"))


@lru_cache
def periods() -> tuple[Period, ...]:
    out = []
    for i, p in enumerate(table()["periods"]):
        a, b = p["label"].split("-")
        out.append(Period(i, p["label"].replace(" ", ""), _parse_dm(a), _parse_dm(b)))
    return tuple(out)


def crops() -> list[dict]:
    return [{"id": k, "name": v["name"]} for k, v in table()["crops"].items()]


def threshold(crop: str, category: str, period: int) -> int | str | None:
    """int = critical KBW [mm]; 'x' = no yield loss from drought in this period; None = crop not suited to soil."""
    return table()["crops"][crop]["thresholds"][category][period]


def _prep(df: pd.DataFrame) -> dict:
    """Cumulative sums for O(1) window sums (crop comparison evaluates ~2000 windows per request).
    Stored in df.attrs, so it is built once per meteo DataFrame."""
    pre = df.attrs.get("_kbw_prep")
    # pandas copies attrs to slices/derived frames – only trust a prep built for this very object
    if pre is None or pre["owner"] != id(df) or len(pre["t"]) != len(df):
        p = df["P"].to_numpy(dtype=float)
        e = df["ET0"].to_numpy(dtype=float)
        valid = ~(np.isnan(p) | np.isnan(e))
        z = lambda a: np.concatenate(([0.0], np.cumsum(a)))  # noqa: E731
        pre = {
            "owner": id(df),
            "t": df.index.values,
            "valid_n": z(valid.astype(float)),
            "pe_valid": z(np.where(valid, p - e, 0.0)),
            "p": z(np.nan_to_num(p)),
            "e": z(np.nan_to_num(e)),
            "n": z(np.ones(len(p))),
        }
        df.attrs["_kbw_prep"] = pre
    return pre


def _span(pre: dict, start: date, end: date) -> tuple[int, int]:
    i = int(np.searchsorted(pre["t"], np.datetime64(start), "left"))
    j = int(np.searchsorted(pre["t"], np.datetime64(end), "right"))
    return i, j


def kbw_sum(df: pd.DataFrame, start: date, end: date) -> tuple[float | None, float]:
    """Returns (KBW, coverage 0..1). KBW is None when < 90% of days have data."""
    pre = _prep(df)
    i, j = _span(pre, start, end)
    expected = (end - start).days + 1
    n_valid = pre["valid_n"][j] - pre["valid_n"][i]
    cov = n_valid / expected if expected else 0
    if cov < 0.9:
        return None, cov
    return round(float(pre["pe_valid"][j] - pre["pe_valid"][i]), 1), cov


def window_sums(df: pd.DataFrame, start: date, end: date) -> tuple[float | None, float | None]:
    """(Σ P, Σ ET0) over the window, None when there are no rows."""
    pre = _prep(df)
    i, j = _span(pre, start, end)
    if j <= i:
        return None, None
    return round(float(pre["p"][j] - pre["p"][i]), 1), round(float(pre["e"][j] - pre["e"][i]), 1)


@dataclass
class PeriodResult:
    period: str
    start: str
    end: str
    kbw: float | None
    threshold: int | str | None
    drought: bool | None  # None = not assessable (no threshold / no data)
    margin: float | None  # kbw - threshold (negative = below threshold)
    p: float | None
    et0: float | None


def assess_year(df: pd.DataFrame, crop: str, category: str, year: int, until: date) -> list[PeriodResult]:
    out = []
    for per in periods():
        s, e = per.dates(year)
        if e > until:
            continue  # period not finished by analysis date
        k, _ = kbw_sum(df, s, e)
        thr = threshold(crop, category, per.index)
        psum, esum = window_sums(df, s, e)
        assessable = isinstance(thr, int) and k is not None
        out.append(PeriodResult(
            period=per.label, start=s.isoformat(), end=e.isoformat(), kbw=k, threshold=thr,
            drought=(k < thr) if assessable else None,
            margin=round(k - thr, 1) if assessable else None,
            p=psum,
            et0=esum,
        ))
    return out


def rolling_window(df: pd.DataFrame, end: date, days: int = 61) -> dict:
    """KBW for the `days` window ending at `end`, plus the same window in each previous year (percentile)."""
    start = end - timedelta(days=days - 1)
    cur, cov = kbw_sum(df, start, end)
    hist = []
    for y in range(1, 11):
        try:
            e = end.replace(year=end.year - y)
        except ValueError:  # 29 Feb
            e = end.replace(year=end.year - y, day=28)
        k, _ = kbw_sum(df, e - timedelta(days=days - 1), e)
        if k is not None:
            hist.append({"year": e.year, "kbw": k})
    vals = [h["kbw"] for h in hist]
    pct = round(100 * float(np.mean([v <= cur for v in vals])), 0) if cur is not None and vals else None
    return {
        "start": start.isoformat(), "end": end.isoformat(), "kbw": cur, "coverage": round(cov, 2),
        "history": hist, "percentile": pct,
        "median_hist": round(float(np.median(vals)), 1) if vals else None,
    }


def daily_rolling_series(
    df: pd.DataFrame, analysis_date: date, crop: str, category: str | None, days: int = 61, forecast_from: date | None = None
) -> list[dict]:
    """Daily 60-day KBW for the analysis year (Jan 1 → analysis date), with the 10-year median for the same day
    and the IUNG threshold of the period ending on that day (for the chart)."""
    pe = df["P"] - df["ET0"]
    roll = pe.rolling(days, min_periods=int(days * 0.9)).sum()
    year_start = pd.Timestamp(date(analysis_date.year, 1, 1))
    cur = roll[(roll.index >= year_start) & (roll.index <= pd.Timestamp(analysis_date))]
    hist = roll[roll.index < year_start]
    med = hist.groupby(hist.index.dayofyear).median()
    end_thr: dict[tuple[int, int], int] = {}
    if category:
        for per in periods():
            t = threshold(crop, category, per.index)
            if isinstance(t, int):
                end_thr[per.end] = t
    out = []
    for ts, v in cur.items():
        out.append({
            "date": ts.date().isoformat(),
            "kbw": None if pd.isna(v) else round(float(v), 1),
            "median": None if pd.isna(med.get(ts.dayofyear)) else round(float(med.get(ts.dayofyear)), 1),
            "threshold": end_thr.get((ts.month, ts.day)),
            "forecast": bool(forecast_from and ts.date() >= forecast_from),
        })
    return out
