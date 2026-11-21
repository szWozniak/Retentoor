import asyncio
from dataclasses import asdict

from fastapi import APIRouter, HTTPException, Query

from ..services import iung, uldk

router = APIRouter(prefix="/parcels", tags=["parcels"])

# rough bounding box of Poland
PL_LAT = (48.9, 55.0)
PL_LON = (14.0, 24.3)


async def _landuse(p: uldk.Parcel) -> dict:
    """Classify land use from the IUNG map; never fail the parcel lookup because of it."""
    try:
        soil = await asyncio.wait_for(iung.soil_for_parcel(p.geometry), timeout=8)
    except Exception:
        return {"class": "nieznana", "agricultural_share": None, "label": "Brak danych o użytkowaniu terenu (IUNG niedostępne)", "parts": []}
    return iung.classify_landuse(soil) | {"source": "IUNG-PIB, mapa kategorii glebowych i użytkowania 2024"}


async def _run(coro):
    try:
        p = await coro
    except uldk.ParcelNotFound:
        raise HTTPException(404, "Nie znaleziono działki. Sprawdź numer albo wskaż ją na mapie.")
    except uldk.UldkError as e:
        raise HTTPException(503, str(e))
    d = asdict(p)
    d["source"] = "ULDK GUGiK (uldk.gugik.gov.pl)"
    d["landuse"] = await _landuse(p)
    return d


@router.get("/by-id")
async def parcel_by_id(id: str = Query(..., min_length=3, max_length=100, description="np. 260104_5.0016.78")):
    return await _run(uldk.by_id(id))


@router.get("/at")
async def parcel_at(lat: float = Query(...), lon: float = Query(...)):
    if not (PL_LAT[0] <= lat <= PL_LAT[1] and PL_LON[0] <= lon <= PL_LON[1]):
        raise HTTPException(422, "Punkt poza Polską.")
    return await _run(uldk.by_point(lat, lon))
