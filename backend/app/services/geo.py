"""Coordinate helpers: WGS84 <-> PUWG 1992 (EPSG:2180, metres – used by GUGiK services)."""

from pyproj import Transformer
from shapely.geometry import shape
from shapely.ops import transform

_to_2180 = Transformer.from_crs("EPSG:4326", "EPSG:2180", always_xy=True)
_to_4326 = Transformer.from_crs("EPSG:2180", "EPSG:4326", always_xy=True)


def to_2180(lon: float, lat: float) -> tuple[float, float]:
    return _to_2180.transform(lon, lat)


def to_4326(x: float, y: float) -> tuple[float, float]:
    """Returns (lon, lat)."""
    return _to_4326.transform(x, y)


def geometry_2180(geojson: dict):
    """Shapely geometry in EPSG:2180 (x = easting, y = northing)."""
    return transform(_to_2180.transform, shape(geojson))
