"""Persistent cache for external API responses – plain JSON files, no database.

Layout: <cache_dir>/<source>/<sha1(key)>.json  →  {"key": ..., "fetched_at": ISO-8601, "payload": "..."}
Files are written atomically (temp file + rename), so a crash never leaves a half-written entry. The directory
can be pre-filled before a demo (prewarm) and copied together with the app.
"""

import hashlib
import json
import os
import tempfile
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from ..config import settings

ROOT = Path(settings.cache_dir)


@dataclass
class Entry:
    payload: str
    fetched_at: datetime


def _path(source: str, key: str) -> Path:
    return ROOT / source / f"{hashlib.sha1(key.encode()).hexdigest()}.json"


def get(source: str, key: str, max_age: timedelta | None = None) -> Entry | None:
    try:
        d = json.loads(_path(source, key).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    fetched = datetime.fromisoformat(d["fetched_at"])
    if max_age is not None and datetime.now(timezone.utc) - fetched > max_age:
        return None
    return Entry(d["payload"], fetched)


def put(source: str, key: str, payload: str, fetched_at: datetime | None = None) -> Entry:
    entry = Entry(payload, fetched_at or datetime.now(timezone.utc))
    path = _path(source, key)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps({"key": key, "fetched_at": entry.fetched_at.isoformat(), "payload": payload}, ensure_ascii=False)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(data)
        os.replace(tmp, path)
    except OSError:
        Path(tmp).unlink(missing_ok=True)  # read-only disk etc. – the app still works, just without caching
    return entry


async def cached(
    source: str,
    key: str,
    fetch: Callable[[], Awaitable[str]],
    max_age: timedelta | None = None,
) -> tuple[str, datetime, bool]:
    """Return (payload, fetched_at, from_cache). On fetch failure falls back to a stale entry if any."""
    hit = get(source, key, max_age)
    if hit:
        return hit.payload, hit.fetched_at, True
    try:
        payload = await fetch()
    except Exception:
        stale = get(source, key)  # ignore max_age: better old data than none
        if stale:
            return stale.payload, stale.fetched_at, True
        raise
    entry = put(source, key, payload)
    return payload, entry.fetched_at, False
