"""Tiny persistent cache for external API responses (SQLite via SQLModel)."""

from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta, timezone

from sqlmodel import Session

from ..db import engine
from ..models import ApiCache


def get(source: str, key: str, max_age: timedelta | None = None) -> ApiCache | None:
    with Session(engine) as s:
        row = s.get(ApiCache, (source, key))
        if row is None:
            return None
        if max_age is not None:
            fetched = row.fetched_at if row.fetched_at.tzinfo else row.fetched_at.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - fetched > max_age:
                return None
        s.expunge(row)
        return row


def put(source: str, key: str, payload: str) -> ApiCache:
    with Session(engine) as s:
        row = ApiCache(source=source, key=key, payload=payload)
        s.merge(row)
        s.commit()
        return row


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
    row = put(source, key, payload)
    return payload, row.fetched_at, False
