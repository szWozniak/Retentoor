"""Where surface water goes on and around the parcel – a small flow model on the GUGiK terrain model (NMT).

1. A regular grid of heights (up to 2400 points, 3–25 m apart) over the parcel plus a margin, from the same NMT
   point service as services/terrain.py (one request, cached).
2. Light 3 × 3 smoothing (the NMT has ~0.1–0.2 m vertical noise; we want the shape of the field, not furrows).
3. D8 flow directions (O'Callaghan & Mark 1984): each cell sends its water to the steepest lower neighbour.
   Cells with no lower neighbour are sinks – places where water collects.
4. Flow accumulation: cells sorted from highest to lowest pass their water downhill. Counted separately for water that
   falls on the parcel and water that comes from the neighbouring land.

Results: arrows (direction of the slope), main runoff paths, where water leaves the parcel and where it collects,
how much land drains onto the parcel, and the catchment of the best place for a pond / retention hollow.
A screening tool, not a hydraulic design: it ignores drains, furrows, field roads and soil infiltration.
"""

import asyncio
import hashlib
import math
from dataclasses import asdict, dataclass, field

import numpy as np
from shapely.geometry import Point
from shapely.prepared import prep

from . import cache, geo
from .http import client
from .terrain import DIRS, URL

MAX_POINTS = 2400  # grid points in total (3 parallel requests of 800 – the service gives heights for ~1000 per request)
STORM_MM = 30  # heavy rain used for the pond sizing (a typical summer downpour)
RUNOFF_COEF = 0.2  # share of a downpour that runs off arable land (screening value; depends on soil and cover)
FLAT_SLOPE = 0.003  # below 0.3% the NMT noise dominates – no arrow

# D8 neighbours: (dy, dx); y grows to the north
NB = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)]


@dataclass
class RunoffResult:
    flat: bool
    step_m: float
    parcel_cells: int
    relief_m: float
    arrows: list[list[list[float]]] = field(default_factory=list)  # polylines [[lat, lon], …]: shaft + head
    streams: list[dict] = field(default_factory=list)  # {"path": [[lat, lon], [lat, lon]], "w": 1–5}
    outlets: list[dict] = field(default_factory=list)  # where water leaves the parcel: lat, lon, share, dir
    sinks: list[dict] = field(default_factory=list)  # where it collects on the parcel: lat, lon, share
    kept_share: float = 0.0  # share of the parcel's runoff that ends in a hollow on the parcel
    inflow_ha: float = 0.0  # neighbouring land draining onto the parcel
    storm_loss_m3: float = 0.0  # water leaving the parcel in one heavy rain (STORM_MM × RUNOFF_COEF)
    pond: dict | None = None  # best spot to catch water: lat, lon, catchment_ha, storm_m3, pond_m2
    notes: list[str] = field(default_factory=list)


def _latlon(x: float, y: float) -> list[float]:
    lon, lat = geo.to_4326(x, y)
    return [round(lat, 6), round(lon, 6)]


def _compass(dx: float, dy: float) -> str:
    az = (math.degrees(math.atan2(dx, dy)) + 360) % 360
    return DIRS[int((az + 22.5) // 45) % 8]


CHUNK = 800  # the service returns heights for only ~1000 points per request; the rest come back without a height


async def _heights(xs: np.ndarray, ys: np.ndarray) -> np.ndarray:
    pts = [f"{y:.1f} {x:.1f}" for y in ys for x in xs]  # northing easting, row by row
    key = hashlib.sha1(",".join(pts).encode()).hexdigest()

    async def part(c, chunk: list[str]) -> list[str]:
        r = await c.post(URL, data={"request": "GetHByPointList", "list": ",".join(chunk)}, timeout=40)
        r.raise_for_status()
        out = r.text.strip().split(",")
        if len(out) != len(chunk):
            raise ValueError("NMT: niepełna odpowiedź")
        return out

    async def fetch() -> str:
        async with client() as c:
            chunks = await asyncio.gather(*(part(c, pts[i : i + CHUNK]) for i in range(0, len(pts), CHUNK)))
        parts = [p for ch in chunks for p in ch]
        # a point without NMT coverage comes back as "y x" (no height) or with height 0
        missing = sum(len(p.split()) < 3 or p.split()[2] in ("0", "0.0") for p in parts)
        if missing > 0.3 * len(parts):
            raise ValueError("NMT: brak wysokości")
        return ",".join(parts)

    text, _, _ = await cache.cached("nmt_grid", key, fetch)
    z = np.array([float(p.split()[2]) if len(p.split()) == 3 else np.nan for p in text.split(",")]).reshape(len(ys), len(xs))
    z[(z == 0) | (z < -100)] = np.nan
    return z


def _fill_nan(z: np.ndarray) -> np.ndarray:
    z = z.copy()
    for _ in range(10):
        bad = np.isnan(z)
        if not bad.any():
            break
        p = np.pad(z, 1, mode="edge")
        stack = np.stack([p[1 + dy : 1 + dy + z.shape[0], 1 + dx : 1 + dx + z.shape[1]] for dy, dx in NB])
        with np.errstate(all="ignore"):
            z[bad] = np.nanmean(stack, axis=0)[bad]
    return z


def _smooth(z: np.ndarray) -> np.ndarray:
    p = np.pad(z, 1, mode="edge")
    return sum(p[1 + dy : 1 + dy + z.shape[0], 1 + dx : 1 + dx + z.shape[1]] for dy, dx in NB + [(0, 0)]) / 9


async def analyse(geometry: dict) -> RunoffResult | None:
    poly = geo.geometry_2180(geometry)
    minx, miny, maxx, maxy = poly.bounds
    margin = max(30.0, 0.2 * math.hypot(maxx - minx, maxy - miny))
    minx, miny, maxx, maxy = minx - margin, miny - margin, maxx + margin, maxy + margin
    # point budget over the area (not the longer side): long, narrow parcels get a finer grid
    step = max(3.0, math.sqrt((maxx - minx) * (maxy - miny) / MAX_POINTS))
    xs = np.arange(minx + step / 2, maxx, step)
    ys = np.arange(miny + step / 2, maxy, step)

    z = await _heights(xs, ys)
    if np.isnan(z).mean() > 0.3:
        return None
    zs = _smooth(_fill_nan(z))
    ny, nx = zs.shape
    pp = prep(poly)
    inside = np.array([[pp.contains(Point(x, y)) for x in xs] for y in ys])
    n_in = int(inside.sum())
    if n_in < 6:
        return None
    cell_ha = step * step / 10_000

    # D8 receivers
    rec = np.full((ny, nx), -1, dtype=int)
    for j in range(ny):
        for i in range(nx):
            best, target = 0.0, -1
            for dy, dx in NB:
                jj, ii = j + dy, i + dx
                if 0 <= jj < ny and 0 <= ii < nx:
                    drop = (zs[j, i] - zs[jj, ii]) / (step * math.hypot(dx, dy))
                    if drop > best:
                        best, target = drop, jj * nx + ii
            rec[j, i] = target

    # accumulation, highest cell first: water from the parcel, and water from the neighbours
    flat_rec = rec.ravel()
    acc_in = inside.ravel().astype(float)
    acc_out = (~inside).ravel().astype(float)
    for c in np.argsort(-zs.ravel()):
        r = flat_rec[c]
        if r >= 0:
            acc_in[r] += acc_in[c]
            acc_out[r] += acc_out[c]
    acc = acc_in + acc_out
    ins = inside.ravel()

    def xy(c: int) -> tuple[float, float]:
        return float(xs[c % nx]), float(ys[c // nx])

    relief = float(np.nanmax(zs[inside]) - np.nanmin(zs[inside]))
    gy, gx = np.gradient(zs, step)  # rows = y (north), cols = x (east)
    slope = np.hypot(gx, gy)
    flat = relief < 0.4 or float(np.median(slope[inside])) < FLAT_SLOPE
    res = RunoffResult(flat=flat, step_m=round(step, 1), parcel_cells=n_in, relief_m=round(relief, 2))

    # arrows on a sub-grid of parcel cells (~70 arrows), along the smoothed slope
    k = max(1, round(math.sqrt(n_in / 70)))
    for j in range(0, ny, k):
        for i in range(0, nx, k):
            if not inside[j, i] or slope[j, i] < FLAT_SLOPE:
                continue
            ux, uy = -gx[j, i] / slope[j, i], -gy[j, i] / slope[j, i]  # downhill unit vector
            L = 0.75 * k * step
            x0, y0 = xs[i] - ux * L / 2, ys[j] - uy * L / 2
            x1, y1 = xs[i] + ux * L / 2, ys[j] + uy * L / 2
            h = 0.35 * L
            head = []
            for a in (math.radians(150), math.radians(-150)):
                hx = ux * math.cos(a) - uy * math.sin(a)
                hy = ux * math.sin(a) + uy * math.cos(a)
                head.append(_latlon(x1 + hx * h, y1 + hy * h))
            res.arrows.append([_latlon(x0, y0), _latlon(x1, y1)])
            res.arrows.append([head[0], _latlon(x1, y1), head[1]])

    # main runoff paths: links carrying water from enough cells (parcel + around it)
    # threshold relative to the biggest flow on the parcel: on long even slopes water runs in many parallel threads,
    # and only the ones that gather real water are worth drawing
    top = acc.max()
    thr = max(6.0, 0.03 * n_in, 0.08 * float(acc[ins].max()))
    order = np.argsort(-acc)
    for c in order:
        if acc[c] < thr or len(res.streams) >= 700:
            break
        r = flat_rec[c]
        if r < 0:
            continue
        w = 1 + 4 * math.log(acc[c] / thr) / math.log(max(top / thr, 1.0001))  # 1 = just above threshold, 5 = biggest
        res.streams.append({"path": [_latlon(*xy(c)), _latlon(*xy(r))], "w": round(w, 1), "on": bool(ins[c] or ins[r])})

    # where the parcel's water leaves it: parcel cells draining to a cell outside
    out_cells = [c for c in np.flatnonzero(ins) if flat_rec[c] >= 0 and not ins[flat_rec[c]]]
    edge_sinks = [c for c in np.flatnonzero(ins) if flat_rec[c] < 0 and (c // nx in (0, ny - 1) or c % nx in (0, nx - 1))]
    clusters: list[dict] = []
    for c in sorted(out_cells + edge_sinks, key=lambda c: -acc_in[c]):
        x, y = xy(c)
        for cl in clusters:
            if math.hypot(cl["x"] - x, cl["y"] - y) <= 3.5 * step:
                cl["n"] += acc_in[c]
                break
        else:
            clusters.append({"x": x, "y": y, "n": acc_in[c]})
    cx, cy = poly.centroid.x, poly.centroid.y
    for cl in sorted(clusters, key=lambda c: -c["n"]):
        share = cl["n"] / n_in
        if share < 0.05 or len(res.outlets) >= 3:
            continue
        res.outlets.append({**dict(zip(("lat", "lon"), _latlon(cl["x"], cl["y"]))), "share": round(share, 2),
                            "dir": _compass(cl["x"] - cx, cl["y"] - cy)})

    # where water collects on the parcel: inside sinks
    sink_cells = [c for c in np.flatnonzero(ins) if flat_rec[c] < 0 and c not in edge_sinks]
    kept = sum(acc_in[c] for c in sink_cells)
    res.kept_share = round(kept / n_in, 2)
    for c in sorted(sink_cells, key=lambda c: -acc[c])[:3]:
        if acc_in[c] / n_in >= 0.03:
            res.sinks.append({**dict(zip(("lat", "lon"), _latlon(*xy(c)))), "share": round(acc_in[c] / n_in, 2)})

    res.storm_loss_m3 = round((1 - res.kept_share) * n_in * step * step * STORM_MM / 1000 * RUNOFF_COEF)

    # water arriving from the neighbours: outside-sourced water that enters a parcel cell
    inflow = sum(acc_out[c] for c in range(nx * ny) if not ins[c] and flat_rec[c] >= 0 and ins[flat_rec[c]])
    res.inflow_ha = round(inflow * cell_ha, 2)

    # best place to catch water on the parcel: the parcel cell with the largest catchment
    best = max(np.flatnonzero(ins), key=lambda c: acc[c])
    catch_ha = acc[best] * cell_ha
    storm_m3 = catch_ha * 10_000 * STORM_MM / 1000 * RUNOFF_COEF
    if not flat and catch_ha >= 0.2:
        res.pond = {**dict(zip(("lat", "lon"), _latlon(*xy(best)))), "catchment_ha": round(catch_ha, 2),
                    "storm_mm": STORM_MM, "runoff_coef": RUNOFF_COEF, "storm_m3": round(storm_m3),
                    "pond_m2": round(storm_m3 / 1.0)}  # 1 m deep

    if flat:
        res.notes.append("Teren działki jest prawie płaski: woda raczej stoi w zagłębieniach i wsiąka, niż spływa. Strzałki pokazano tylko tam, gdzie spadek jest wyraźny.")
    res.notes.append(f"Model spływu na siatce co {step:.0f} m z NMT GUGiK (wygładzony). Nie uwzględnia drenowania, bruzd, dróg polnych ani wsiąkania – pokazuje kierunki, nie dokładne ilości.")
    return res


def _plain(v):
    """numpy scalars -> Python numbers (JSON)."""
    if isinstance(v, dict):
        return {k: _plain(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_plain(x) for x in v]
    if isinstance(v, np.generic):
        return v.item()
    return v


def as_dict(r: RunoffResult) -> dict:
    return _plain(asdict(r))
