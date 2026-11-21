"""Place search: towns / villages / addresses → coordinates.

Primary: GUGiK UUG (https://services.gugik.gov.pl/uug/) – official, free, no key.
Quirk: its firewall rejects UPPERCASE percent-encoding of Polish letters (%C3%B3) but accepts lowercase (%c3%b3),
so we build the query string ourselves.
Fallback: Nominatim (OpenStreetMap, ODbL) – used only on explicit search (its policy forbids autocomplete),
max 1 request/s, identified with a User-Agent."""

import asyncio
import json
import re
import time
from datetime import timedelta
from urllib.parse import quote

from . import cache
from .http import client

UUG_URL = "https://services.gugik.gov.pl/uug/"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
_last_nominatim = 0.0
_lock = asyncio.Lock()


def _lower_pct(s: str) -> str:
    return re.sub(r"%[0-9A-F]{2}", lambda m: m.group(0).lower(), quote(s, safe=""))


async def _uug(q: str) -> list[dict]:
    url = f"{UUG_URL}?request=GetAddress&srid=4326&address={_lower_pct(q)}"

    async def fetch() -> str:
        async with client() as c:
            r = await c.get(url)
            r.raise_for_status()
            if r.text.lstrip().startswith("<"):
                raise ValueError("UUG rejected the request")
            return r.text

    text, _, _ = await cache.cached("uug", q.lower(), fetch, max_age=timedelta(days=30))
    d = json.loads(text)
    out = []
    for r in (d.get("results") or {}).values():
        try:
            lat, lon = float(r["y"]), float(r["x"])
        except (KeyError, TypeError, ValueError):
            continue
        is_addr = d.get("type") == "address" or bool(r.get("number"))
        name = r.get("city") or r.get("street") or q
        if is_addr:
            name = " ".join(x for x in [r.get("street") or r.get("city"), r.get("number")] if x)
        sub = ", ".join(x for x in [r.get("city") if is_addr else None, f"gm. {r['commune']}" if r.get("commune") else None,
                                    f"pow. {r['county']}" if r.get("county") else None, r.get("voivodeship")] if x)
        out.append({"label": name, "sub": sub, "lat": lat, "lon": lon, "kind": "address" if is_addr else "place",
                    "zoom": 18 if is_addr else 14, "source": "GUGiK UUG"})
    return out


async def _nominatim(q: str) -> list[dict]:
    global _last_nominatim

    async def fetch() -> str:
        global _last_nominatim
        async with _lock:  # Nominatim usage policy: max 1 request per second
            wait = 1.0 - (time.monotonic() - _last_nominatim)
            if wait > 0:
                await asyncio.sleep(wait)
            _last_nominatim = time.monotonic()
            async with client() as c:
                r = await c.get(NOMINATIM_URL, params={"q": q, "countrycodes": "pl", "format": "jsonv2", "limit": 6,
                                                       "accept-language": "pl"})
                r.raise_for_status()
                return r.text

    text, _, _ = await cache.cached("nominatim", q.lower(), fetch, max_age=timedelta(days=30))
    out = []
    for r in json.loads(text):
        parts = [p.strip() for p in r.get("display_name", "").split(",")]
        kind = "address" if r.get("addresstype") in ("house", "building") or r.get("type") == "house" else "place"
        label, rest = (parts[0] if parts else q), parts[1:]
        if kind == "address" and len(parts) > 1 and re.fullmatch(r"\d+[A-Za-z]?", parts[0]):
            label, rest = f"{parts[1]} {parts[0]}", parts[2:]  # "1, Królewska, …" -> "Królewska 1"
        out.append({"label": label, "sub": ", ".join(rest[:3]), "lat": float(r["lat"]), "lon": float(r["lon"]),
                    "kind": kind, "zoom": 18 if kind == "address" else 14, "source": "OpenStreetMap Nominatim"})
    return out


async def search(q: str, allow_fallback: bool) -> list[dict]:
    q = q.strip()
    results: list[dict] = []
    try:
        results = await _uug(q)
    except Exception:
        results = []
    if not results and allow_fallback:
        try:
            results = await _nominatim(q)
        except Exception:
            results = []
    return results[:8]
