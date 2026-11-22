"""Prewarm the weather fallback for the whole of Poland (not for chosen parcels).

NASA POWER, the fallback when Open-Meteo is unreachable or rate-limited, has a coarse grid (0.5° × 0.625°), so about
200 requests cover every parcel in the country. Each cached cell is refreshed daily; when NASA cannot be reached, the
older copy is served (services/cache.py), so after one run the fallback works everywhere even with no access to NASA.

Open-Meteo itself (0.05° grid, >13 000 cells × 21 years) is far beyond its free limit, and map tiles are loaded by the
browser straight from GUGiK – neither can be prewarmed sensibly.

Usage (from backend/):  .venv/Scripts/python -m scripts.prewarm_weather [--concurrency 3]
"""

import argparse
import asyncio
import time
from datetime import date

from shapely.geometry import Polygon, box

from app.services import meteo, nasa_power

# rough outline of Poland (lon, lat), buffered below so border parcels are covered too
POLAND = Polygon([
    (14.2, 53.9), (15.5, 54.2), (16.5, 54.55), (17.9, 54.83), (18.6, 54.75), (18.95, 54.35), (19.65, 54.45),
    (22.8, 54.36), (23.5, 54.2), (23.9, 53.9), (23.6, 53.5), (23.9, 53.0), (23.2, 52.3), (23.65, 52.1), (23.5, 51.6),
    (24.1, 51.0), (24.0, 50.4), (22.7, 49.6), (22.9, 49.0), (22.0, 49.2), (21.0, 49.4), (20.0, 49.2), (19.4, 49.6),
    (18.85, 49.5), (18.0, 50.0), (17.0, 50.3), (16.3, 50.65), (15.0, 51.0), (14.8, 51.6), (14.6, 52.5), (14.15, 52.85),
    (14.45, 53.3),
]).buffer(0.3)
LAT_STEP, LON_STEP = 0.5, 1 / 1.6  # NASA POWER cell, same rounding as services/nasa_power.daily


def cells() -> list[tuple[float, float]]:
    minx, miny, maxx, maxy = POLAND.bounds
    out = []
    for i in range(round(miny / LAT_STEP), round(maxy / LAT_STEP) + 1):
        for j in range(round(minx / LON_STEP), round(maxx / LON_STEP) + 1):
            lat, lon = i * LAT_STEP, j * LON_STEP
            if POLAND.intersects(box(lon - LON_STEP / 2, lat - LAT_STEP / 2, lon + LON_STEP / 2, lat + LAT_STEP / 2)):
                out.append((lat, lon))
    return out


async def main(concurrency: int) -> None:
    today = date.today()
    start = date(today.year - meteo.ARCHIVE_YEARS, 1, 1).strftime("%Y%m%d")  # same span as services/meteo
    end = today.strftime("%Y%m%d")
    todo = cells()
    print(f"{len(todo)} komórek NASA POWER nad Polską, {concurrency} naraz")
    sem = asyncio.Semaphore(concurrency)
    done = failed = 0
    t0 = time.perf_counter()

    async def one(lat: float, lon: float) -> None:
        nonlocal done, failed
        async with sem:
            try:
                await nasa_power.daily(lat, lon, start, end)
            except Exception as e:  # noqa: BLE001 – keep going, report at the end
                failed += 1
                print(f"  błąd {lat:.2f},{lon:.3f}: {type(e).__name__}: {e}")
            done += 1
            if done % 10 == 0 or done == len(todo):
                print(f"  {done}/{len(todo)}  ({time.perf_counter() - t0:.0f} s)")

    await asyncio.gather(*(one(lat, lon) for lat, lon in todo))
    print(f"gotowe: {done - failed} w cache, {failed} błędów, {time.perf_counter() - t0:.0f} s")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--concurrency", type=int, default=3, help="równoległe zapytania (NASA prosi o umiar)")
    asyncio.run(main(ap.parse_args().concurrency))
