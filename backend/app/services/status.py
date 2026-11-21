"""Reachability of the live services the app depends on (shown to the user as a banner).

Groups: "gugik" (parcel lookup + parcel boundaries on the map) and "weather" (forecast providers – the banner shows
only when ALL of them fail, since one working provider is enough).

GUGiK enforces a per-IP request limit. When it is exceeded, every request is redirected to
integracja01.gugik.gov.pl/resp/... which returns a placeholder ("Przekroczono dopuszczalny limit zapytań")
instead of data. The check result is kept for CHECK_TTL seconds so the banner itself never adds load.
"""

import asyncio
import time

import httpx

from . import forecast, uldk

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


PROBE_POINT = (52.23, 21.01)  # any point in Poland; forecast answers are cached per day, so this is nearly free
PROVIDER_NAMES = {"openmeteo_nwp": "Open-Meteo", "metno": "MET Norway"}


async def _probe_forecast(provider) -> dict:
    name = PROVIDER_NAMES.get(provider.__name__, provider.__name__)
    try:
        await asyncio.wait_for(provider(*PROBE_POINT), 12)
        return {"name": name, "state": "ok"}
    except Exception as e:  # noqa: BLE001
        return {"name": name, "state": "limit" if forecast.is_rate_limit(e) else "down"}


def _group(gid: str, services: list[dict], need_all: bool) -> dict:
    states = [s["state"] for s in services]
    bad = [st for st in states if st != "ok"]
    failing = bool(bad) if need_all else len(bad) == len(states)
    state = "ok" if not failing else ("limit" if "limit" in bad else "down")
    return {"id": gid, "state": state, "services": services}


async def check(fresh: bool = False) -> dict:
    global _last
    async with _lock:
        if _last and time.monotonic() - _last[0] < (MIN_RECHECK if fresh else CHECK_TTL):
            return _last[1]
        uldk_s, kieg_s, *weather = await asyncio.gather(
            _probe("ULDK – wyszukiwanie działek", uldk.ULDK_URL, ULDK_PROBE, lambda r: r.text.strip().startswith(("0", "1")) and "_" in r.text),
            _probe("KIEG – granice działek na mapie", KIEG_URL, KIEG_PROBE, lambda r: r.headers.get("content-type", "").startswith("image/")),
            *(_probe_forecast(p) for p in forecast.PROVIDERS),
        )
        groups = [_group("gugik", [uldk_s, kieg_s], need_all=True), _group("weather", weather, need_all=False)]
        out = {"checked_at": time.time(), "groups": groups, "ok": all(g["state"] == "ok" for g in groups)}
        _last = (time.monotonic(), out)
        return out
