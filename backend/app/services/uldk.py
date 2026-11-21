"""ULDK GUGiK – land parcel lookup (https://uldk.gugik.gov.pl/opis.html).

Free, no key. Returns parcel geometry for a parcel ID (TERYT form WWPPGG_R.OOOO.NR,
or "obręb name + number") or for a point."""

from dataclasses import dataclass
from datetime import datetime

import httpx
from pyproj import Geod
from shapely import wkt
from shapely.geometry import mapping

from . import cache

ULDK_URL = "https://uldk.gugik.gov.pl/"
RESULT_FIELDS = "geom_wkt,id,voivodeship,county,commune,region,parcel"
_geod = Geod(ellps="GRS80")


class ParcelNotFound(Exception):
    pass


class UldkError(Exception):
    pass


@dataclass
class Parcel:
    id: str
    voivodeship: str
    county: str
    commune: str
    region: str  # obręb
    number: str
    geometry: dict  # GeoJSON (EPSG:4326, lon/lat)
    centroid: tuple[float, float]  # (lat, lon)
    area_ha: float
    fetched_at: datetime
    from_cache: bool


async def _request(params: dict) -> str:
    # GUGiK moved the service behind a redirect (uldk.gugik.gov.pl -> integracja01.gugik.gov.pl)
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        r = await client.get(ULDK_URL, params=params)
        r.raise_for_status()
        return r.text


def _parse(text: str, fetched_at: datetime, from_cache: bool) -> Parcel:
    lines = [ln for ln in text.strip().splitlines() if ln.strip()]
    # first line: status / count. "0" (XY) or "1" (Id) = ok, "-1 ..." = not found
    if not lines or lines[0].startswith("-1") or len(lines) < 2:
        raise ParcelNotFound(lines[0] if lines else "empty response")
    fields = lines[1].split("|")
    if len(fields) < 7:
        raise UldkError(f"Unexpected ULDK response: {lines[1][:80]}")
    geom_wkt, pid, voiv, county, commune, region, number = fields[:7]
    try:
        geom = wkt.loads(geom_wkt.split(";", 1)[-1])  # strip "SRID=4326;"
    except Exception as e:  # noqa: BLE001 – shapely raises its own error types
        raise UldkError("Unexpected ULDK geometry") from e
    area_m2 = abs(_geod.geometry_area_perimeter(geom)[0])
    c = geom.representative_point()
    return Parcel(
        id=pid,
        voivodeship=voiv,
        county=county,
        commune=commune,
        region=region,
        number=number,
        geometry=mapping(geom),
        centroid=(c.y, c.x),
        area_ha=round(area_m2 / 10_000, 4),
        fetched_at=fetched_at,
        from_cache=from_cache,
    )


async def _lookup(cache_key: str, params: dict) -> Parcel:
    async def fetch() -> str:
        text = await _request(params)
        if text.strip().startswith("-1"):
            raise ParcelNotFound(text.strip().splitlines()[0])
        _parse(text, datetime.now(), False)  # validate before caching: never store a broken answer
        return text

    try:
        text, fetched_at, hit = await cache.cached("uldk", cache_key, fetch)  # parcels rarely change: no expiry
    except ParcelNotFound:
        raise
    except (httpx.HTTPError, UldkError, ValueError) as e:
        raise UldkError(
            "Usługa GUGiK z granicami działek (ULDK) chwilowo nie odpowiada poprawnie. Spróbuj ponownie za kilka minut."
        ) from e
    return _parse(text, fetched_at, hit)


async def by_id(parcel_id: str) -> Parcel:
    pid = parcel_id.strip()
    return await _lookup(
        f"id:{pid}",
        {"request": "GetParcelByIdOrNr", "id": pid, "result": RESULT_FIELDS, "srid": "4326"},
    )


async def by_point(lat: float, lon: float) -> Parcel:
    # ~1 m rounding so repeated clicks on the same spot hit the cache
    key = f"xy:{lon:.5f},{lat:.5f}"
    return await _lookup(
        key,
        {"request": "GetParcelByXY", "xy": f"{lon},{lat},4326", "result": RESULT_FIELDS, "srid": "4326"},
    )
