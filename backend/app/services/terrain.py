"""Terrain of the parcel from the GUGiK digital terrain model (NMT, ~1 m grid).

Service: https://services.gugik.gov.pl/nmt/?request=GetHByPointList&list=N E,N E,... (EPSG:2180, geodetic order:
northing first, then easting).
We sample a regular grid inside the parcel and derive: elevation range, mean slope (least-squares plane),
the direction water runs off, and the lowest spot (natural place where water collects)."""

import hashlib
import math
from dataclasses import dataclass
from datetime import datetime

import numpy as np
from shapely.geometry import Point

from . import cache, geo
from .http import client

URL = "https://services.gugik.gov.pl/nmt/"
DIRS = ["północ", "północny wschód", "wschód", "południowy wschód", "południe", "południowy zachód", "zachód", "północny zachód"]


@dataclass
class TerrainResult:
    n_points: int
    min_m: float
    max_m: float
    relief_m: float  # max - min
    slope_pct: float  # mean slope of the fitted plane
    max_local_slope_pct: float
    downslope_dir: str | None  # where surface water flows to
    lowest_point: tuple[float, float]  # (lat, lon)
    highest_point: tuple[float, float]
    fetched_at: datetime


def _grid(poly2180, target: int = 120) -> list[tuple[float, float]]:
    minx, miny, maxx, maxy = poly2180.bounds
    area = max(poly2180.area, 1.0)
    step = max(5.0, math.sqrt(area / target))
    pts = []
    y = miny + step / 2
    while y < maxy:
        x = minx + step / 2
        while x < maxx:
            if poly2180.contains(Point(x, y)):
                pts.append((round(x, 1), round(y, 1)))
            x += step
        y += step
    if len(pts) < 4:  # tiny / thin parcel: use vertices + centroid
        c = poly2180.representative_point()
        pts = [(round(c.x, 1), round(c.y, 1))] + [(round(x, 1), round(y, 1)) for x, y in list(poly2180.exterior.coords)[:-1]][:20]
    return pts[:200]


async def analyse(geometry: dict) -> TerrainResult | None:
    poly = geo.geometry_2180(geometry)
    if poly.geom_type == "MultiPolygon":
        poly = max(poly.geoms, key=lambda g: g.area)
    pts = _grid(poly)
    lst = ",".join(f"{y} {x}" for x, y in pts)  # service wants northing easting
    key = hashlib.sha1(lst.encode()).hexdigest()

    async def fetch() -> str:
        async with client() as c:
            # long point lists go in a POST body; the service accepts the same params as GET
            r = await c.post(URL, data={"request": "GetHByPointList", "list": lst})
            if r.status_code >= 400 or not r.text.strip() or r.text.strip().startswith("<"):
                r = await c.get(URL, params={"request": "GetHByPointList", "list": lst})
            r.raise_for_status()
            return r.text

    text, fetched_at, _ = await cache.cached("nmt", key, fetch)
    xyz = []
    for item in text.strip().split(","):
        parts = item.split()
        if len(parts) == 3:
            try:
                h = float(parts[2])
            except ValueError:
                continue
            if h != 0.0 and h > -100:  # 0.0 = no NMT coverage
                xyz.append((float(parts[1]), float(parts[0]), h))  # back to (easting, northing)
    if len(xyz) < 3:
        return None

    a = np.array(xyz)
    x, y, z = a[:, 0], a[:, 1], a[:, 2]
    # plane z = ax + by + c (least squares) -> mean slope + aspect
    A = np.c_[x - x.mean(), y - y.mean(), np.ones(len(x))]
    (ga, gb, _), *_ = np.linalg.lstsq(A, z, rcond=None)
    slope = math.hypot(ga, gb) * 100
    downslope = None
    if slope >= 0.5:
        # water flows against the gradient; azimuth from north, clockwise
        az = (math.degrees(math.atan2(-ga, -gb)) + 360) % 360
        downslope = DIRS[int((az + 22.5) // 45) % 8]

    # local slopes between neighbouring samples
    loc = []
    for i in range(len(a)):
        d = np.hypot(x - x[i], y - y[i])
        mask = (d > 0) & (d < 2.5 * np.sort(d)[1] if len(d) > 1 else d > 0)
        if mask.any():
            loc.append(float(np.max(np.abs(z[mask] - z[i]) / d[mask])) * 100)

    lo, hi = int(np.argmin(z)), int(np.argmax(z))
    lo_lon, lo_lat = geo.to_4326(x[lo], y[lo])
    hi_lon, hi_lat = geo.to_4326(x[hi], y[hi])
    return TerrainResult(
        n_points=len(a),
        min_m=round(float(z.min()), 1),
        max_m=round(float(z.max()), 1),
        relief_m=round(float(z.max() - z.min()), 1),
        slope_pct=round(slope, 1),
        max_local_slope_pct=round(float(np.percentile(loc, 90)) if loc else slope, 1),
        downslope_dir=downslope,
        lowest_point=(round(lo_lat, 6), round(lo_lon, 6)),
        highest_point=(round(hi_lat, 6), round(hi_lon, 6)),
        fetched_at=fetched_at,
    )
