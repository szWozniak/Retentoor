# HackNation 2026 — baseline

Generic starter: **FastAPI + SQLite** backend and **React + Vite + Tailwind** frontend. No external paid services.

```
backend/   FastAPI app (app/main.py), routers, services, pytest (no database)
frontend/  React + TS, src/api.ts = typed API client, dev server proxies /api → :8000
```

## Run locally

**Backend** (http://localhost:8000, docs at http://localhost:8000/docs):

```powershell
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\uvicorn app.main:app --reload
```

**Frontend** (http://localhost:5173):

```powershell
cd frontend
npm install
npm run dev
```

**Or both via Docker:** `docker compose up --build`

## Tests

```powershell
cd backend
.venv\Scripts\python -m pytest
```

## What's in the baseline

| Endpoint | What it does |
|---|---|
| `GET /api/health` | health check |
| `GET /api/parcels/by-id?id=`, `GET /api/parcels/at?lat=&lon=` | parcel geometry (ULDK); `landuse=false` skips the slower land-use step |
| `GET /api/parcels/landuse?id=` | land-use class of a parcel (IUNG) |
| `GET /api/analysis/satellite?parcel_id=&crop=&date=` | Sentinel-2 NDVI/NDMI for the parcel vs the same time of year in earlier years (loaded separately; cold read 10–25 s, then cached) |
| `GET /api/analysis/satellite/season?parcel_id=&date=` | cloud-free Sentinel-2 frames of the parcel through one growing season (Mar–Oct, least cloudy scene per week) with NDVI/NDMI – for the time-lapse player (~25 s cold, then cached) |
| `GET /api/analysis/runoff?parcel_id=` | Flow model on the GUGiK terrain model (D8 on a ≤2400-point grid): runoff arrows and paths, where water leaves / collects, inflow from neighbours, best pond spot with its catchment (~2.5 s cold, then cached) |
| `GET /api/analysis?parcel_id=&crop=&date=` | full report (assessment, history, causes, recommendations); `date` from 10 years back up to 16 days ahead (future days use the weather forecast, `mode` = wsteczna / biezaca / prognoza) |
| `GET /api/analysis/crops` | crop list |
| `GET /api/geocode?q=` | place / address search (GUGiK UUG, Nominatim fallback) |

No database: external API responses are cached as JSON files in `backend/data/cache/` (`services/cache.py`). A report is shared as a link with its parameters (`/raport?dzialka=&uprawa=&data=`) and recomputed when opened.
