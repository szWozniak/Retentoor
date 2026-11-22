"""Sentinel-2 L2A vegetation and moisture indices for a parcel (Earth Search STAC + Cloud-Optimized GeoTIFFs, no account).

- NDVI = (NIR − Red) / (NIR + Red)      – green biomass / canopy vigour
- NDMI = (NIR − SWIR1) / (NIR + SWIR1)  – water content of the canopy (Gao 1996)
Bands are read at 20 m (B04 via overview, B8A, B11, SCL) and only for the parcel window, so one scene costs a few
small HTTP range requests. Reflectance = DN·0.0001, minus 0.1 only for processing baseline >= 04.00 when the
offset is still in the data. Note: Earth Search items with `earthsearch:boa_offset_applied = true` already have it
removed, although their raster:bands metadata still lists offset −0.1 (checked on real scenes: dark-vegetation red
DN ~300 – impossible with the offset still applied).
Clouds, shadows, snow and water are masked with the scene classification (SCL).

Satellite indices are a confirmation, not the main signal (KOWR scientific annex): the current value is compared with
the same time of year in previous years, and the interpretation depends on the crop calendar (FAO-56 Kc by month).
Per-scene statistics for a parcel never change, so they are cached permanently.
"""

import asyncio
import base64
import hashlib
import io
import json
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

import httpx
import numpy as np
import rasterio
from PIL import Image, ImageDraw
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.features import geometry_mask
from rasterio.windows import from_bounds
from shapely.geometry import shape
from shapely.ops import transform

from . import cache

STAC_URL = "https://earth-search.aws.element84.com/v1/search"
COLLECTION = "sentinel-2-l2a"
BANDS = {"red": "red", "nir": "nir08", "swir": "swir16", "scl": "scl"}
SCL_CLEAR = {4, 5}  # vegetation, bare soil (6 = water, 8–10 = clouds, 3 = shadow, 11 = snow)
MIN_CLEAR_SHARE = 0.8  # share of parcel pixels that must be cloud-free
VEGETATED_NDVI = 0.4  # below this the field is bare / harvested / sparse – NDMI says nothing about crop water
CURRENT_LOOKBACK_DAYS = 40
BASELINE_HALF_WINDOW = 20  # ± days around the same day-of-year in earlier years
GDAL_ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif",
    "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES",
    "GDAL_HTTP_MULTIPLEX": "YES",
    "GDAL_INGESTED_BYTES_AT_OPEN": "32768",
    "VSI_CACHE": "TRUE",
    "GDAL_HTTP_MAX_RETRY": "2",
    "GDAL_HTTP_TIMEOUT": "20",
}
_pool = ThreadPoolExecutor(max_workers=24, thread_name_prefix="s2")


@dataclass
class SceneStats:
    scene: str
    date: str
    cloud_cover: float  # whole scene, %
    clear_share: float  # parcel pixels usable
    ndvi: float | None
    ndmi: float | None
    n_px: int


@dataclass
class SatelliteResult:
    current: SceneStats | None
    baseline: list[SceneStats]  # same time of year, earlier years (one scene per year)
    ndvi_median: float | None
    ndmi_median: float | None
    ndmi_delta: float | None  # current − median of earlier years
    stage: str  # "pełny łan" | "wschody/dojrzewanie" | "poza sezonem"
    assessment: str  # short verdict for the user
    level: str  # "niższa" | "nieco niższa" | "typowa" | "wyższa" | "niepewne" | "brak danych" | "nie dotyczy"
    n_reference: int = 0  # earlier years used for the median (green field only, in the canopy stage)
    notes: list[str] = field(default_factory=list)
    fetched_at: datetime | None = None


async def _search(bbox: list[float], start: date, end: date, max_cloud: int, limit: int) -> list[dict]:
    body = {
        "collections": [COLLECTION], "bbox": bbox, "limit": limit,
        "datetime": f"{start.isoformat()}T00:00:00Z/{end.isoformat()}T23:59:59Z",
        "query": {"eo:cloud_cover": {"lt": max_cloud}},
        "fields": {"include": ["id", "properties.datetime", "properties.eo:cloud_cover", "properties.s2:processing_baseline",
                               "properties.earthsearch:boa_offset_applied", "assets.red", "assets.nir08",
                               "assets.swir16", "assets.scl", "bbox"]},
    }
    key = json.dumps(body, sort_keys=True)

    async def fetch() -> str:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(STAC_URL, json=body)
            r.raise_for_status()
            return r.text

    # past windows never change; windows that include the last days are refreshed daily
    max_age = None if end < date.today() - timedelta(days=3) else timedelta(hours=12)
    text, _, _ = await cache.cached("s2_stac", key, fetch, max_age=max_age)
    items = json.loads(text)["features"]
    # one scene per day: the same overpass is published in two overlapping MGRS tiles – keep the less cloudy one
    by_day: dict[str, dict] = {}
    for it in items:
        day = it["properties"]["datetime"][:10]
        if day not in by_day or it["properties"]["eo:cloud_cover"] < by_day[day]["properties"]["eo:cloud_cover"]:
            by_day[day] = it
    return list(by_day.values())


def _read_band(href: str, geom_wgs84, scale: float, offset: float, shape_hw: tuple[int, int] | None = None):
    with rasterio.open(href) as src:
        tr = Transformer.from_crs(4326, src.crs, always_xy=True)
        g = transform(tr.transform, geom_wgs84)
        win = from_bounds(*g.bounds, transform=src.transform).round_offsets().round_lengths()
        out_shape = shape_hw or (max(1, int(win.height)), max(1, int(win.width)))
        arr = src.read(1, window=win, out_shape=out_shape, boundless=True, fill_value=0, resampling=Resampling.average)
        wt = src.window_transform(win)
        if shape_hw:  # resampled read (10 m band onto the 20 m grid): adjust the transform
            wt = wt * wt.scale(win.width / out_shape[1], win.height / out_shape[0])
        mask = geometry_mask([g.__geo_interface__], out_shape=arr.shape, transform=wt, invert=True)
    refl = arr.astype("float32") * scale + offset if scale else arr
    return refl, arr == 0, mask


def _scene_stats(item: dict, geom_geojson: dict) -> SceneStats:
    geom = shape(geom_geojson)
    key = f"v2:{item['id']}:{hashlib.sha1(geom.wkb).hexdigest()}"
    hit = cache.get("s2_stats", key)
    if hit:
        return SceneStats(**json.loads(hit.payload))

    def rb(asset: str):
        pr = item["properties"]
        offset_in_data = (pr.get("s2:processing_baseline") or "00.00") >= "04.00" and not pr.get("earthsearch:boa_offset_applied", False)
        return 0.0001, (-0.1 if offset_in_data else 0.0)

    with rasterio.Env(**GDAL_ENV):
        scl, _, pmask = _read_band(item["assets"]["scl"]["href"], geom, 0, 0)
        hw = scl.shape
        nir, nir0, _ = _read_band(item["assets"]["nir08"]["href"], geom, *rb("nir08"), shape_hw=hw)
        swir, swir0, _ = _read_band(item["assets"]["swir16"]["href"], geom, *rb("swir16"), shape_hw=hw)
        red, red0, _ = _read_band(item["assets"]["red"]["href"], geom, *rb("red"), shape_hw=hw)
    n_px = int(pmask.sum())
    clear = pmask & np.isin(scl, list(SCL_CLEAR)) & ~nir0 & ~swir0 & ~red0
    share = float(clear.sum() / n_px) if n_px else 0.0
    ndvi = ndmi = None
    if clear.sum() >= 3:
        with np.errstate(invalid="ignore", divide="ignore"):
            ndvi = float(np.nanmedian(((nir - red) / (nir + red))[clear]))
            ndmi = float(np.nanmedian(((nir - swir) / (nir + swir))[clear]))
    st = SceneStats(item["id"], item["properties"]["datetime"][:10], round(item["properties"]["eo:cloud_cover"], 1), round(share, 2),
                    None if ndvi is None else round(ndvi, 3), None if ndmi is None else round(ndmi, 3), n_px)
    cache.put("s2_stats", key, json.dumps(st.__dict__))
    return st


async def _stats(items: list[dict], geom_geojson: dict) -> list[SceneStats]:
    loop = asyncio.get_running_loop()
    res = await asyncio.gather(*(loop.run_in_executor(_pool, _scene_stats, it, geom_geojson) for it in items), return_exceptions=True)
    return [r for r in res if isinstance(r, SceneStats)]


def _usable(s: SceneStats) -> bool:
    return s.clear_share >= MIN_CLEAR_SHARE and s.ndmi is not None


def crop_stage(kc_month: dict[int, float], month: int) -> str:
    kc = kc_month.get(month, 0)
    if kc >= 0.7:
        return "pełny łan"
    return "wschody/dojrzewanie" if kc > 0 else "poza sezonem"


async def analyse(geom_geojson: dict, analysis_date: date, kc_month: dict[int, float], crop_name: str) -> SatelliteResult:
    g = shape(geom_geojson)
    minx, miny, maxx, maxy = g.bounds
    bbox = [minx, miny, maxx, maxy]
    d = analysis_date if analysis_date <= date.today() else date.today()  # no images of the future
    notes: list[str] = []

    # current: latest clear scene in the last CURRENT_LOOKBACK_DAYS days (check the 4 newest candidates)
    async def current_scene() -> SceneStats | None:
        items = await _search(bbox, d - timedelta(days=CURRENT_LOOKBACK_DAYS), d, 70, 20)
        items.sort(key=lambda it: it["properties"]["datetime"], reverse=True)
        stats = await _stats(items[:4], geom_geojson)
        ok = sorted((s for s in stats if _usable(s)), key=lambda s: s.date, reverse=True)
        return ok[0] if ok else None

    # baseline: per earlier year, the least cloudy scene within ± BASELINE_HALF_WINDOW days of the same date
    async def year_scene(y: int) -> SceneStats | None:
        try:
            c = d.replace(year=y)
        except ValueError:
            c = d.replace(year=y, day=28)
        items = await _search(bbox, c - timedelta(days=BASELINE_HALF_WINDOW), c + timedelta(days=BASELINE_HALF_WINDOW), 40, 20)
        items.sort(key=lambda it: it["properties"]["eo:cloud_cover"])
        for batch in (items[:1], items[1:3]):  # least cloudy first; two more only if the parcel was cloudy
            ok = [s for s in await _stats(batch, geom_geojson) if _usable(s)]
            if ok:
                return min(ok, key=lambda s: abs((date.fromisoformat(s.date) - c).days))
        return None

    first_year = max(2017, d.year - 10)  # Sentinel-2 L2A archive on Earth Search is complete from 2017
    cur, *years = await asyncio.gather(current_scene(), *(year_scene(y) for y in range(first_year, d.year)))
    baseline = [s for s in years if s]

    stage = crop_stage(kc_month, (date.fromisoformat(cur.date) if cur else d).month)
    # in the canopy stage compare only with years when the field was green (bare/harvested years would skew the median)
    ref = [s for s in baseline if (s.ndvi or 0) >= VEGETATED_NDVI] if stage != "poza sezonem" else baseline
    ndvi_med = float(np.median([s.ndvi for s in ref])) if ref else None
    ndmi_med = float(np.median([s.ndmi for s in ref])) if ref else None
    delta = round(cur.ndmi - ndmi_med, 3) if cur and ndmi_med is not None else None

    if cur is None:
        level, verdict = "brak danych", f"Brak bezchmurnego zdjęcia działki z ostatnich {CURRENT_LOOKBACK_DAYS} dni – nie da się potwierdzić oceny danymi satelitarnymi."
    elif stage == "poza sezonem":
        level, verdict = "nie dotyczy", (f"Zdjęcie z {_pl_date(cur.date)} przypada poza okresem wegetacji uprawy „{crop_name}”. "
                                         "Wskaźniki opisują wtedy ściernisko, gołą glebę albo inną roślinność, więc nie świadczą o suszy dla tej uprawy.")
    elif (cur.ndvi or 0) < VEGETATED_NDVI:
        level, verdict = "niepewne", (f"Na zdjęciu z {_pl_date(cur.date)} działka ma mało zieleni (NDVI {_pl_num(cur.ndvi)}): wygląda na nieobsianą, po zbiorze "
                                      f"albo z inną uprawą niż „{crop_name}”. Nie traktujemy tego jako potwierdzenia suszy.")
    elif delta is None or len(ref) < 3:
        level, verdict = "brak danych", "Za mało bezchmurnych zdjęć z poprzednich lat w tym terminie, żeby ocenić, czy wilgotność roślin odbiega od normy."
    else:
        level = "niższa" if delta <= -0.10 else "nieco niższa" if delta <= -0.05 else "wyższa" if delta >= 0.05 else "typowa"
        verdict = {
            "niższa": "Wilgotność roślin (NDMI) wyraźnie niższa niż zwykle o tej porze roku – zdjęcie satelitarne potwierdza niedobór wody.",
            "nieco niższa": "Wilgotność roślin (NDMI) nieco niższa niż zwykle o tej porze roku.",
            "typowa": "Wilgotność roślin (NDMI) typowa dla tej pory roku – zdjęcie nie wskazuje na stres wodny.",
            "wyższa": "Wilgotność roślin (NDMI) wyższa niż zwykle o tej porze roku – zdjęcie nie wskazuje na stres wodny.",
        }[level]
        if stage == "wschody/dojrzewanie":
            verdict += " Uprawa jest we wczesnej fazie albo dojrzewa, więc niższe wartości są częściowo naturalne – traktuj to ostrożnie."

    if analysis_date > date.today():
        notes.append("Data analizy jest w przyszłości – pokazujemy ostatnie dostępne zdjęcie satelitarne.")
    notes.append("Porównanie z poprzednimi latami nie uwzględnia płodozmianu: wtedy na działce mogły rosnąć inne uprawy.")
    return SatelliteResult(
        current=cur, baseline=baseline, ndvi_median=None if ndvi_med is None else round(ndvi_med, 3),
        ndmi_median=None if ndmi_med is None else round(ndmi_med, 3), ndmi_delta=delta, stage=stage, assessment=verdict,
        level=level, n_reference=len(ref), notes=notes, fetched_at=datetime.now(timezone.utc),
    )


def _pl_num(x: float) -> str:
    return f"{x:.2f}".replace(".", ",")


def _pl_date(iso: str) -> str:
    return date.fromisoformat(iso).strftime("%d.%m.%Y")


# ---------------------------------------------------------------- source image for the user ("Pokaż zdjęcie")

ITEM_URL = "https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/{}"
# NDMI colour ramp: dry (brown) -> wet (teal/blue); clouds/shadows grey
NDMI_RAMP = [(-0.4, (140, 81, 10)), (-0.1, (216, 179, 101)), (0.1, (246, 232, 195)), (0.25, (199, 234, 229)),
             (0.4, (90, 180, 172)), (0.6, (1, 102, 94))]
IMAGE_PX = 640  # longer side of the output PNG


async def _item(scene: str) -> dict:
    async def fetch() -> str:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(ITEM_URL.format(scene))
            r.raise_for_status()
            return r.text

    text, _, _ = await cache.cached("s2_item", scene, fetch)
    return json.loads(text)


def _ramp(v: np.ndarray) -> np.ndarray:
    xs = [p for p, _ in NDMI_RAMP]
    out = np.zeros(v.shape + (3,), dtype="uint8")
    for ch in range(3):
        out[..., ch] = np.interp(v, xs, [c[ch] for _, c in NDMI_RAMP]).astype("uint8")
    return out


def _render(item: dict, geom_geojson: dict, kind: str) -> bytes:
    geom = shape(geom_geojson)
    with rasterio.Env(**GDAL_ENV):
        href = item["assets"]["visual" if kind == "rgb" else "scl"]["href"]
        with rasterio.open(href) as src:
            crs = src.crs
            tr = Transformer.from_crs(4326, crs, always_xy=True)
            g = transform(tr.transform, geom)
            minx, miny, maxx, maxy = g.bounds
            pad = max(maxx - minx, maxy - miny) * 0.6 + 60  # context around the parcel
            bounds = (minx - pad, miny - pad, maxx + pad, maxy + pad)
            win = from_bounds(*bounds, transform=src.transform).round_offsets().round_lengths()
            if kind == "rgb":
                arr = src.read(window=win, boundless=True, fill_value=0)  # 3 × h × w, uint8 (already stretched)
                rgb = np.moveaxis(arr, 0, -1).astype("float32")
                rgb = (255 * (rgb / 255) ** 0.8).clip(0, 255).astype("uint8")  # slight gamma lift for dark fields
            else:
                scl = src.read(1, window=win, boundless=True, fill_value=0)
            wt = src.window_transform(win)
        if kind != "rgb":
            hw = scl.shape
            nir, nir0, _ = _read_window(item["assets"]["nir08"]["href"], bounds, hw)
            swir, swir0, _ = _read_window(item["assets"]["swir16"]["href"], bounds, hw)
            with np.errstate(invalid="ignore", divide="ignore"):
                ndmi = (nir - swir) / (nir + swir)
            rgb = _ramp(np.nan_to_num(ndmi, nan=-0.4))
            cloudy = ~np.isin(scl, [4, 5, 6]) | nir0 | swir0
            rgb[cloudy] = (190, 190, 190)
    img = Image.fromarray(rgb, "RGB")
    scale = IMAGE_PX / max(img.size)
    img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.NEAREST if kind != "rgb" else Image.BICUBIC)
    # parcel outline: map CRS coords -> pixel coords of the resized image
    inv = ~wt
    draw = ImageDraw.Draw(img)
    polys = [g] if g.geom_type == "Polygon" else list(g.geoms)
    for poly in polys:
        pts = [tuple(v * scale for v in inv * (x, y)) for x, y in poly.exterior.coords]
        draw.line(pts + [pts[0]], fill=(255, 255, 255), width=8, joint="curve")
        draw.line(pts + [pts[0]], fill=(21, 128, 61), width=4, joint="curve")
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def _read_window(href: str, bounds: tuple, hw: tuple[int, int]):
    """Band on the same window (map bounds) and grid as the SCL read; reflectance without offset (only ratios are used)."""
    with rasterio.open(href) as src:
        win = from_bounds(*bounds, transform=src.transform).round_offsets().round_lengths()
        arr = src.read(1, window=win, out_shape=hw, boundless=True, fill_value=0, resampling=Resampling.average)
    return arr.astype("float32"), arr == 0, None


async def image(scene: str, geom_geojson: dict, kind: str) -> bytes:
    key = f"v2:{scene}:{kind}:{hashlib.sha1(shape(geom_geojson).wkb).hexdigest()}"
    hit = cache.get("s2_png", key)
    if hit:
        return base64.b64decode(hit.payload)
    item = await _item(scene)
    png = await asyncio.get_running_loop().run_in_executor(_pool, _render, item, geom_geojson, kind)
    cache.put("s2_png", key, base64.b64encode(png).decode())
    return png


# ---------------------------------------------------------------- season time-lapse

SEASON_START, SEASON_END = (3, 1), (10, 31)
SEASON_MAX_CLOUD = 50  # scene-level prefilter; the parcel itself must still be ≥ MIN_CLEAR_SHARE clear


def season_year(analysis_date: date) -> int:
    """The growing season to show: this year's once it has started (April), otherwise last year's."""
    d = min(analysis_date, date.today())
    return d.year if d.month >= 4 else d.year - 1


async def season(geom_geojson: dict, year: int) -> list[SceneStats]:
    """Cloud-free frames of the parcel through one growing season (at most one per week, least cloudy first)."""
    g = shape(geom_geojson)
    minx, miny, maxx, maxy = g.bounds
    start = date(year, *SEASON_START)
    end = min(date(year, *SEASON_END), date.today())
    if end <= start:
        return []
    items = await _search([minx, miny, maxx, maxy], start, end, SEASON_MAX_CLOUD, 100)
    # least cloudy scene of each ISO week keeps reads (and the cold wait) small
    weekly: dict[tuple[int, int], dict] = {}
    for it in items:
        wk = date.fromisoformat(it["properties"]["datetime"][:10]).isocalendar()[:2]
        if wk not in weekly or it["properties"]["eo:cloud_cover"] < weekly[wk]["properties"]["eo:cloud_cover"]:
            weekly[wk] = it
    stats = await _stats(list(weekly.values()), geom_geojson)
    return sorted((s for s in stats if _usable(s)), key=lambda s: s.date)
