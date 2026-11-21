import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlmodel import Session

from .config import settings
from .db import engine, init_db
from .routers import analysis, files, parcels, records


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(records.router, prefix="/api")
app.include_router(files.router, prefix="/api")
app.include_router(parcels.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")
app.include_router(analysis.reports, prefix="/api")


STARTED_AT = time.time()


@app.get("/api/health")
def health():
    db_ok = True
    try:
        with Session(engine) as session:
            session.exec(text("SELECT 1"))
    except Exception:
        db_ok = False
    return {
        "status": "ok" if db_ok else "degraded",
        "app": settings.app_name,
        "db": "ok" if db_ok else "error",
        "uptime_s": round(time.time() - STARTED_AT),
        "server_time": datetime.now(timezone.utc).isoformat(),
    }
