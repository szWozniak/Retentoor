"""Upload files. CSV/XLSX/JSON are parsed into a quick preview (columns + first rows)."""

import json
import uuid
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, HTTPException, UploadFile

from ..config import settings

router = APIRouter(prefix="/files", tags=["files"])

TABULAR = {".csv", ".xlsx", ".xls", ".json"}


def _preview(path: Path, rows: int = 20) -> dict | None:
    ext = path.suffix.lower()
    try:
        if ext == ".csv":
            df = pd.read_csv(path, sep=None, engine="python")  # sniffs , ; tab
        elif ext in {".xlsx", ".xls"}:
            df = pd.read_excel(path)
        elif ext == ".json":
            df = pd.json_normalize(json.loads(path.read_text(encoding="utf-8")))
        else:
            return None
    except Exception as exc:  # parsing is best-effort
        return {"error": str(exc)}
    return {
        "rows": len(df),
        "columns": [str(c) for c in df.columns],
        "head": json.loads(df.head(rows).to_json(orient="records", force_ascii=False)),
    }


@router.post("")
async def upload(file: UploadFile):
    if not file.filename:
        raise HTTPException(400, "Missing file name")
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename).suffix.lower()
    stored = upload_dir / f"{uuid.uuid4().hex}{ext}"
    stored.write_bytes(await file.read())
    return {
        "id": stored.name,
        "filename": file.filename,
        "size": stored.stat().st_size,
        "preview": _preview(stored) if ext in TABULAR else None,
    }
