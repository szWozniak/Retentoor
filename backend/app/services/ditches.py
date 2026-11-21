"""Drainage ditches and watercourses next to a parcel – GUGiK BDOT10k (topographic database, 1:10 000).

WMS: https://mapy.geoportal.gov.pl/wss/service/pub/guest/kompozycja_BDOT10k_WMS/MapServer/WMSServer
Layers: `row` = rów melioracyjny (BDOT10k class SWRM), `rz` = rzeka/strumień, `kan` = kanał.
There is no public WFS, so geometry comes from a transparent PNG of the layer around the parcel:
non-transparent pixels are ditch lines → distance from the parcel edge. Attributes (width, type, update date)
come from GetFeatureInfo at the nearest ditch pixel. Free ("brak opłat"); bulk harvesting is not allowed,
so we query only on demand, one parcel at a time, and cache.

Note: BDOT10k is topographic mapping (from orthophotos), not the official melioration register – it says a ditch
exists, not who manages it or whether it holds water."""

import base64
import io
import math
import re
from dataclasses import dataclass
from datetime import datetime

import numpy as np
from PIL import Image
from shapely.geometry import MultiPoint, Point

from . import cache, geo
from .http import client

URL = "https://mapy.geoportal.gov.pl/wss/service/pub/guest/kompozycja_BDOT10k_WMS/MapServer/WMSServer"
HALF_M = 600  # box half-size around the parcel centre
PX = 480  # 2.5 m / px
ADJACENT_M = 25  # ditch on (or right at) the parcel boundary


@dataclass
class DitchResult:
    nearest_ditch_m: float | None  # from the parcel edge; 0 = crosses the parcel
    ditch_adjacent: bool
    ditch_width_m: float | None
    ditch_type: str | None
    ditch_updated: str | None
    nearest_ditch_point: tuple[float, float] | None  # (lat, lon)
    nearest_watercourse_m: float | None  # river / stream / canal
    watercourse_name: str | None
    fetched_at: datetime


def _bbox(lat: float, lon: float) -> tuple[float, float, float, float]:
    dlat = HALF_M / 111_320
    dlon = HALF_M / (111_320 * math.cos(math.radians(lat)))
    return lat - dlat, lon - dlon, lat + dlat, lon + dlon  # WMS 1.3.0 + EPSG:4326 = lat,lon order


async def _png(layers: str, bbox: tuple) -> tuple[np.ndarray, datetime]:
    params = {
        "SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetMap", "LAYERS": layers, "STYLES": "", "CRS": "EPSG:4326",
        "BBOX": ",".join(f"{v:.6f}" for v in bbox), "WIDTH": str(PX), "HEIGHT": str(PX), "FORMAT": "image/png", "TRANSPARENT": "TRUE",
    }

    async def fetch() -> str:
        async with client() as c:
            r = await c.get(URL, params=params)
            r.raise_for_status()
            if not r.headers.get("content-type", "").startswith("image/"):
                raise ValueError(r.text[:200])
            return base64.b64encode(r.content).decode()

    payload, fetched_at, _ = await cache.cached("bdot_wms", f"{layers}:{params['BBOX']}", fetch)
    img = np.asarray(Image.open(io.BytesIO(base64.b64decode(payload))).convert("RGBA"))
    return img[..., 3] > 40, fetched_at  # alpha mask of drawn features


def _nearest(mask: np.ndarray, bbox: tuple, poly2180) -> tuple[float | None, tuple[float, float] | None]:
    rows, cols = np.nonzero(mask)
    if not len(rows):
        return None, None
    min_lat, min_lon, max_lat, max_lon = bbox
    lats = max_lat - (rows + 0.5) / PX * (max_lat - min_lat)
    lons = min_lon + (cols + 0.5) / PX * (max_lon - min_lon)
    # subsample very dense masks (wide rivers) for speed
    step = max(1, len(rows) // 4000)
    pts = [geo.to_2180(lo, la) for la, lo in zip(lats[::step], lons[::step])]
    mp = MultiPoint(pts)
    d = float(poly2180.distance(mp))
    # the closest pixel
    best = min(range(len(pts)), key=lambda i: poly2180.distance(Point(pts[i])))
    return round(d, 0), (float(lats[::step][best]), float(lons[::step][best]))


async def _feature_info(layer: str, lat: float, lon: float) -> dict:
    d = 30 / 111_320  # ~60 m box (12 m pixels): server tolerance catches a line near the centre
    dl = d / math.cos(math.radians(lat))
    params = {
        "SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetFeatureInfo", "LAYERS": layer, "QUERY_LAYERS": layer, "STYLES": "",
        "CRS": "EPSG:4326", "BBOX": f"{lat - d:.6f},{lon - dl:.6f},{lat + d:.6f},{lon + dl:.6f}", "WIDTH": "5", "HEIGHT": "5",
        "I": "2", "J": "2", "INFO_FORMAT": "text/xml", "FEATURE_COUNT": "3",
    }

    async def fetch() -> str:
        async with client() as c:
            r = await c.get(URL, params=params)
            r.raise_for_status()
            return r.text

    text, _, _ = await cache.cached("bdot_gfi", f"v2:{layer}:{lat:.5f},{lon:.5f}", fetch)
    m = re.search(r"<FIELDS ([^>]*?)/?>", text)
    if not m:
        return {}
    return dict(re.findall(r'([\w.]+)="([^"]*)"', m.group(1)))


def _num(v: str | None) -> float | None:
    try:
        return float(v.replace(",", ".")) if v and v != "Null" else None
    except ValueError:
        return None


async def analyse(geometry: dict, lat: float, lon: float) -> DitchResult:
    poly = geo.geometry_2180(geometry)
    bbox = _bbox(lat, lon)
    ditch_mask, fetched_at = await _png("row", bbox)
    water_mask, _ = await _png("rz,kan", bbox)

    nd, npt = _nearest(ditch_mask, bbox, poly)
    nw, wpt = _nearest(water_mask, bbox, poly)

    attrs: dict = {}
    if npt:
        try:
            attrs = await _feature_info("row", *npt)
        except Exception:
            attrs = {}
    wname = None
    if wpt and nw is not None and nw <= 500:
        try:
            wa = await _feature_info("rz,kan", *wpt)
            wname = wa.get("NAZWA_CIEKU") if wa.get("NAZWA_CIEKU") not in (None, "", "Null") else None
        except Exception:
            wname = None

    return DitchResult(
        nearest_ditch_m=nd,
        ditch_adjacent=nd is not None and nd <= ADJACENT_M,
        ditch_width_m=_num(attrs.get("szerokosc")),
        ditch_type=attrs.get("rodzaj") if attrs.get("rodzaj") not in (None, "Null") else None,
        ditch_updated=attrs.get("x_aktualnoscG"),
        nearest_ditch_point=npt,
        nearest_watercourse_m=nw,
        watercourse_name=wname,
        fetched_at=fetched_at,
    )
