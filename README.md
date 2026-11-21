# HackNation 2026 — baseline

Generic starter: **FastAPI + SQLite** backend and **React + Vite + Tailwind** frontend. No external paid services.

```
backend/   FastAPI app (app/main.py), SQLModel models, routers, pytest
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
| `GET /api/analysis?parcel_id=&crop=&date=` | full report (assessment, history, causes, recommendations) |
| `GET /api/analysis/crops` | crop list |
| `GET /api/geocode?q=` | place / address search (GUGiK UUG, Nominatim fallback) |

No database: external API responses are cached as JSON files in `backend/data/cache/` (`services/cache.py`). A report is shared as a link with its parameters (`/raport?dzialka=&uprawa=&data=`) and recomputed when opened.
