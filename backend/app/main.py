import time
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import analysis, geocode, parcels
from .services import status

# Stateless API: everything is computed from live open data; external responses are cached as files
# (services/cache.py). No database.
app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(parcels.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")
app.include_router(geocode.router, prefix="/api")


STARTED_AT = time.time()


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "app": settings.app_name,
        "uptime_s": round(time.time() - STARTED_AT),
        "server_time": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/health/sources")
async def health_sources(fresh: bool = False):
    """Are the live GUGiK services reachable from this server? (result cached for 60 s)"""
    return await status.check(fresh)
