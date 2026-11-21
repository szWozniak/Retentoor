"""ISRIC SoilGrids 2.0 (CC BY 4.0) – soil texture and organic carbon at 250 m, plus plant-available water.

Available water capacity (AWC = field capacity − wilting point) from the Saxton & Rawls (2006)
pedotransfer functions (Soil Sci. Soc. Am. J. 70:1569–1578)."""

import json
from dataclasses import dataclass
from datetime import datetime

from . import cache
from .http import client

URL = "https://rest.isric.org/soilgrids/v2.0/properties/query"
DEPTHS = [("0-5cm", 50), ("5-15cm", 100), ("15-30cm", 150), ("30-60cm", 300), ("60-100cm", 400)]  # label, thickness mm


@dataclass
class SoilGridsResult:
    clay_pct: float  # 0-30 cm weighted
    sand_pct: float
    silt_pct: float
    soc_pct: float  # organic carbon 0-30 cm, %
    om_pct: float  # organic matter ≈ SOC × 1.724
    awc_mm_100: float  # plant-available water in 0-100 cm, mm
    awc_mm_30: float
    texture: str  # simple Polish texture name
    fetched_at: datetime


def _saxton_rawls(sand: float, clay: float, om: float) -> float:
    """AWC [m3/m3]. sand, clay as fractions 0..1, om in %."""
    s, c = sand, clay
    t1500t = -0.024 * s + 0.487 * c + 0.006 * om + 0.005 * s * om - 0.013 * c * om + 0.068 * s * c + 0.031
    t1500 = t1500t + (0.14 * t1500t - 0.02)
    t33t = -0.251 * s + 0.195 * c + 0.011 * om + 0.006 * s * om - 0.027 * c * om + 0.452 * s * c + 0.299
    t33 = t33t + (1.283 * t33t**2 - 0.374 * t33t - 0.015)
    return max(0.0, t33 - t1500)


def _texture(sand: float, clay: float) -> str:
    # coarse grouping (USDA-like), enough for farmer-facing text
    if sand >= 70 and clay < 15:
        return "piaszczysta (lekka)"
    if clay >= 35:
        return "ilasta (ciężka)"
    if clay >= 20:
        return "gliniasta (średnio ciężka)"
    if sand >= 50:
        return "piaszczysto-gliniasta (lekka do średniej)"
    return "pylasta / gliniasta (średnia)"


async def query(lat: float, lon: float) -> SoilGridsResult | None:
    params = [("lon", f"{lon:.4f}"), ("lat", f"{lat:.4f}"), ("value", "mean")]
    params += [("property", p) for p in ("clay", "sand", "silt", "soc")]
    params += [("depth", d) for d, _ in DEPTHS]

    async def fetch() -> str:
        async with client() as c:
            r = await c.get(URL, params=params, timeout=15)
            r.raise_for_status()
            return r.text

    text, fetched_at, _ = await cache.cached("soilgrids", f"{lat:.3f},{lon:.3f}", fetch)
    layers = {l["name"]: l for l in json.loads(text)["properties"]["layers"]}

    def val(prop: str, depth: str) -> float | None:
        l = layers.get(prop)
        if not l:
            return None
        f = l["unit_measure"].get("d_factor", 1) or 1
        for d in l["depths"]:
            if d["label"] == depth:
                v = d["values"].get("mean")
                return None if v is None else v / f
        return None

    rows = []
    for depth, thick in DEPTHS:
        clay, sand, soc = val("clay", depth), val("sand", depth), val("soc", depth)  # %, %, g/kg
        if clay is None or sand is None:
            continue
        om = (soc or 0) / 10 * 1.724  # g/kg -> % SOC -> % OM
        rows.append({"depth": depth, "thick": thick, "clay": clay, "sand": sand, "silt": val("silt", depth), "soc": soc or 0, "om": om,
                     "awc": _saxton_rawls(sand / 100, clay / 100, min(om, 8))})
    if not rows:
        return None  # e.g. water, urban or outside SoilGrids mask

    top = [r for r in rows if r["depth"] in ("0-5cm", "5-15cm", "15-30cm")] or rows[:1]
    tw = sum(r["thick"] for r in top)

    def wavg(k: str) -> float:
        return sum(r[k] * r["thick"] for r in top) / tw

    clay, sand = wavg("clay"), wavg("sand")
    soc_pct = wavg("soc") / 10
    return SoilGridsResult(
        clay_pct=round(clay, 1),
        sand_pct=round(sand, 1),
        silt_pct=round(100 - clay - sand, 1),
        soc_pct=round(soc_pct, 2),
        om_pct=round(soc_pct * 1.724, 2),
        awc_mm_100=round(sum(r["awc"] * r["thick"] for r in rows), 0),
        awc_mm_30=round(sum(r["awc"] * r["thick"] for r in top), 0),
        texture=_texture(sand, clay),
        fetched_at=fetched_at,
    )
