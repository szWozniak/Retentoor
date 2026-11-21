from fastapi import APIRouter, Query

from ..services import geocode

router = APIRouter(prefix="/geocode", tags=["geocode"])


@router.get("")
async def search(
    q: str = Query(..., min_length=2, max_length=120),
    full: bool = Query(False, description="true = explicit search (Enter): may use the Nominatim fallback"),
):
    return await geocode.search(q, allow_fallback=full)
