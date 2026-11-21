"""Landscape around the parcel (≈2 × 2 km) from the IUNG land-use/soil raster (katgl_landuse2024).

One WMS GetMap request in EPSG:2180 (10 m pixels); pixel colours are mapped back to class codes using
the layer's colour map. Gives: distance to the nearest surface water, share of water / forest & tree
cover / organic (often wet) soils in the surroundings – i.e. landscape retention elements."""

import base64
import io
from dataclasses import dataclass
from datetime import datetime

import numpy as np
from PIL import Image

from . import cache, geo
from .http import client
from .iung import LAYER, WMS_URL

COLORS = {  # from GetLegendGraphic
    1: (0xFF, 0xFF, 0x54), 2: (0xFF, 0x9D, 0x00), 3: (0xFD, 0x42, 0x00), 4: (0x80, 0x40, 0x00),
    5: (0x64, 0xCD, 0x6E), 11: (0x26, 0x73, 0x00), 12: (0x73, 0xB2, 0xFF), 13: (0x82, 0x82, 0x82),
    14: (0xCC, 0xCC, 0xCC), 19: (0x11, 0x11, 0x11),
}
HALF = 1000  # m
PX = 200  # -> 10 m / pixel


@dataclass
class SurroundingsResult:
    radius_m: int
    water_share: float
    forest_share: float
    organic_share: float  # organic soils – peat/muck, often former wetlands
    built_share: float
    nearest_water_m: float | None  # from parcel edge
    fetched_at: datetime


async def analyse(geometry: dict, lat: float, lon: float) -> SurroundingsResult | None:
    cx, cy = geo.to_2180(lon, lat)
    bbox = (cx - HALF, cy - HALF, cx + HALF, cy + HALF)
    params = {
        "SERVICE": "WMS", "VERSION": "1.1.1", "REQUEST": "GetMap", "LAYERS": LAYER, "STYLES": "",
        "SRS": "EPSG:2180", "BBOX": ",".join(f"{v:.1f}" for v in bbox),
        "WIDTH": str(PX), "HEIGHT": str(PX), "FORMAT": "image/png", "TRANSPARENT": "true",
    }

    async def fetch() -> str:
        async with client() as c:
            r = await c.get(WMS_URL, params=params)
            r.raise_for_status()
            if not r.headers.get("content-type", "").startswith("image/"):
                raise ValueError(f"WMS error: {r.text[:200]}")
            return base64.b64encode(r.content).decode()

    payload, fetched_at, _ = await cache.cached("iung_surroundings", f"{cx:.0f},{cy:.0f}", fetch)
    img = np.asarray(Image.open(io.BytesIO(base64.b64decode(payload))).convert("RGBA")).astype(int)
    rgb, alpha = img[..., :3], img[..., 3]

    codes = np.zeros(alpha.shape, dtype=int)
    palette = np.array(list(COLORS.values()))
    keys = np.array(list(COLORS.keys()))
    d = ((rgb[..., None, :] - palette[None, None, :, :]) ** 2).sum(-1)
    nearest = d.argmin(-1)
    ok = (alpha > 0) & (d.min(-1) < 30**2)
    codes[ok] = keys[nearest[ok]]
    valid = codes > 0
    if valid.sum() < 0.2 * codes.size:
        return None

    def share(*cs: int) -> float:
        return round(float(np.isin(codes, cs).sum() / valid.sum()), 3)

    # distance from parcel edge to the nearest water pixel
    poly = geo.geometry_2180(geometry)
    rows, cols = np.nonzero(codes == 12)
    nearest_water = None
    if len(rows):
        res = 2 * HALF / PX
        xs = bbox[0] + (cols + 0.5) * res
        ys = bbox[3] - (rows + 0.5) * res
        from shapely.geometry import MultiPoint

        nearest_water = round(float(poly.distance(MultiPoint(list(zip(xs, ys))))), 0)

    return SurroundingsResult(
        radius_m=HALF,
        water_share=share(12),
        forest_share=share(11),
        organic_share=share(5),
        built_share=share(13, 14),
        nearest_water_m=nearest_water,
        fetched_at=fetched_at,
    )
