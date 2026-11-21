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
| `GET/POST /api/records`, `GET/PATCH/DELETE /api/records/{id}` | CRUD on a generic `Record` (title, content, label, source) with `?q=` search and `?label=` filter |
| `POST /api/files` | upload a file; CSV/XLSX/JSON returns a preview (row count, columns, first 20 rows) |

## Adapting to the challenge

1. Rename/extend `Record` in `backend/app/models.py` (delete `backend/data/app.db` after schema changes — no migrations).
2. Add a router in `backend/app/routers/` and register it in `app/main.py`.
3. Mirror types and calls in `frontend/src/api.ts`, build UI in `frontend/src/`.
