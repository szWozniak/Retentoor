"""Reachability of the GUGiK services the app depends on live (shown to the user as a banner).

GUGiK enforces a per-IP request limit. When it is exceeded, every request is redirected to
integracja01.gugik.gov.pl/resp/... which returns a placeholder ("Przekroczono dopuszczalny limit zapytań")
instead of data. The check result is kept for CHECK_TTL seconds so the banner itself never adds load.
"""

import asyncio
import time

import httpx

from . import uldk

CHECK_TTL = 60
MIN_RECHECK = 10  # "Sprawdź ponownie" may bypass the cache, but not more often than this
KIEG_URL = "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow"
# a tiny, valid GetMap near Bydgoszcz
KIEG_PROBE = {
    "SERVICE": "WMS", "REQUEST": "GetMap", "VERSION": "1.1.1", "LAYERS": "dzialki", "STYLES": "",
    "FORMAT": "image/png", "TRANSPARENT": "true", "SRS": "EPSG:4326", "BBOX": "18.0,53.12,18.001,53.121",
    "WIDTH": "16", "HEIGHT": "16",
}
ULDK_PROBE = {"request": "GetParcelById", "id": "041704_2.0008.283", "result": "id"}

_last: tuple[float, dict] | None = None
_lock = asyncio.Lock()


def is_limited(url: httpx.URL | str) -> bool:
    return "/resp/" in str(url)


async def _probe(name: str, url: str, params: dict, ok) -> dict:
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True) as c:
            r = await c.get(url, params=params)
        if is_limited(r.url):
            return {"name": name, "state": "limit"}
        if r.status_code == 200 and ok(r):
            return {"name": name, "state": "ok"}
        return {"name": name, "state": "down"}
    except httpx.HTTPError:
        return {"name": name, "state": "down"}


async def check(fresh: bool = False) -> dict:
    global _last
    async with _lock:
        if _last and time.monotonic() - _last[0] < (MIN_RECHECK if fresh else CHECK_TTL):
            return _last[1]
        res = await asyncio.gather(
            _probe("ULDK – wyszukiwanie działek", uldk.ULDK_URL, ULDK_PROBE, lambda r: r.text.strip().startswith(("0", "1")) and "_" in r.text),
            _probe("KIEG – granice działek na mapie", KIEG_URL, KIEG_PROBE, lambda r: r.headers.get("content-type", "").startswith("image/")),
        )
        out = {"checked_at": time.time(), "services": list(res), "ok": all(s["state"] == "ok" for s in res)}
        _last = (time.monotonic(), out)
        return out
