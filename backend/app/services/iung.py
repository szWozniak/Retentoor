"""IUNG-PIB soil drought-susceptibility categories (SMSR).

WMS layer `Susza:katgl_landuse2024` on sgeo.iung.pl (the map behind
https://susza.iung.pulawy.pl/mapa-kategorii/). GetFeatureInfo returns a raster code:
1-4 = soil category I-IV, 5 = organic soils, 11+ = non-agricultural land use."""

import asyncio
import json
from collections import Counter
from dataclasses import dataclass
from datetime import datetime

from shapely.geometry import Point, shape

from . import cache
from .http import client

WMS_URL = "https://sgeo.iung.pl/geoserver/Susza/wms"
LAYER = "Susza:katgl_landuse2024"

CODES: dict[int, str] = {
    1: "Kategoria I – gleby bardzo lekkie (najbardziej podatne na suszę)",
    2: "Kategoria II – gleby lekkie",
    3: "Kategoria III – gleby średnie",
    4: "Kategoria IV – gleby ciężkie (najmniej podatne na suszę)",
    5: "Gleby organiczne i pochodzenia organicznego",
    11: "Lasy, zadrzewienia",
    12: "Wody",
    13: "Tereny zabudowane",
    14: "Tereny komunikacyjne, nieużytki",
    19: "Tereny niesklasyfikowane",
    99: "Tereny niesklasyfikowane",
}
ROMAN = {1: "I", 2: "II", 3: "III", 4: "IV"}


@dataclass
class SoilResult:
    code: int | None  # dominant code
    category: str | None  # "I".."IV" when agricultural mineral soil, else None
    label: str
    shares: dict[int, float]  # code -> share of sampled points
    n_points: int
    agricultural: bool
    fetched_at: datetime | None


async def _code_at(lat: float, lon: float) -> tuple[int | None, datetime]:
    d = 0.0005  # ~50 m box, 11x11 px, query centre pixel
    params = {
        "SERVICE": "WMS", "VERSION": "1.1.1", "REQUEST": "GetFeatureInfo",
        "LAYERS": LAYER, "QUERY_LAYERS": LAYER, "SRS": "EPSG:4326",
        "BBOX": f"{lon - d},{lat - d},{lon + d},{lat + d}",
        "WIDTH": "11", "HEIGHT": "11", "X": "5", "Y": "5",
        "INFO_FORMAT": "application/json",
    }

    async def fetch() -> str:
        async with client() as c:
            r = await c.get(WMS_URL, params=params)
            r.raise_for_status()
            return r.text

    text, fetched_at, _ = await cache.cached("iung_kat", f"{lat:.5f},{lon:.5f}", fetch)
    feats = json.loads(text).get("features") or []
    code = feats[0]["properties"].get("GRAY_INDEX") if feats else None
    code = int(code) if code is not None else None
    return (None if code in (0, 255) else code), fetched_at


def _sample_points(geometry: dict, n_side: int = 4) -> list[tuple[float, float]]:
    """Representative point + a regular grid of points inside the parcel (lat, lon)."""
    poly = shape(geometry)
    pts = [poly.representative_point()]
    minx, miny, maxx, maxy = poly.bounds
    for i in range(n_side):
        for j in range(n_side):
            p = Point(minx + (i + 0.5) * (maxx - minx) / n_side, miny + (j + 0.5) * (maxy - miny) / n_side)
            if poly.contains(p):
                pts.append(p)
    return [(p.y, p.x) for p in pts[:12]]


def classify_landuse(soil: "SoilResult") -> dict:
    """Agricultural / mixed / non-agricultural, from the share of sampled points on agricultural soil codes (1-5)."""
    if not soil.shares:
        return {"class": "nieznana", "agricultural_share": None, "label": "Brak danych o użytkowaniu terenu", "parts": []}
    agri = sum(v for c, v in soil.shares.items() if 1 <= int(c) <= 5)
    cls = "rolna" if agri >= 0.8 else "mieszana" if agri >= 0.2 else "nierolna"
    parts = [{"code": int(c), "label": CODES.get(int(c), f"Kod {c}"), "share": v} for c, v in soil.shares.items()]
    label = {
        "rolna": "Działka rolna",
        "mieszana": "Działka częściowo rolna",
        "nierolna": f"Działka nierolna ({CODES.get(soil.code, '').split(',')[0].split('–')[0].strip().lower()})" if soil.code else "Działka nierolna",
    }[cls]
    return {"class": cls, "agricultural_share": round(agri, 2), "label": label, "parts": parts}


async def soil_for_parcel(geometry: dict) -> SoilResult:
    points = _sample_points(geometry)
    results = await asyncio.gather(*(_code_at(lat, lon) for lat, lon in points), return_exceptions=True)
    codes = [r[0] for r in results if not isinstance(r, BaseException) and r[0] is not None]
    dates = [r[1] for r in results if not isinstance(r, BaseException)]
    if not codes:
        return SoilResult(None, None, "Brak danych o kategorii gleby (IUNG niedostępne lub poza zasięgiem mapy)", {}, 0, False, None)

    counts = Counter(codes)
    # prefer agricultural soil codes when the parcel is mixed (e.g. field with a tree strip)
    agri = {c: n for c, n in counts.items() if 1 <= c <= 5}
    dominant = max(agri or counts, key=lambda c: (agri or counts)[c])
    return SoilResult(
        code=dominant,
        category=ROMAN.get(dominant),
        label=CODES.get(dominant, f"Kod {dominant}"),
        shares={c: round(n / len(codes), 2) for c, n in counts.most_common()},
        n_points=len(codes),
        agricultural=1 <= dominant <= 5,
        fetched_at=min(dates) if dates else None,
    )
