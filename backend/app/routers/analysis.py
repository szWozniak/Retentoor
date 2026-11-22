"""Water-situation assessment for a parcel, crop and analysis date (step 1 of the KOWR sequence)."""

import asyncio
import re
import time
from dataclasses import asdict
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query, Response

from ..services import advisor, ditches, forecast, iung, kbw, meteo, runoff, sentinel, soilgrids, surroundings, terrain, uldk, water_budget

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.get("/crops")
def list_crops():
    return kbw.crops()


@router.get("/satellite")
async def satellite(
    parcel_id: str = Query(..., min_length=3, max_length=100),
    crop: str = Query(...),
    analysis_date: date | None = Query(None, alias="date"),
):
    """Sentinel-2 confirmation of the water assessment (NDVI / NDMI vs the same time of year in earlier years).
    Separate from /analysis because cold reads of the imagery take 10–25 s; the report shows it when it arrives."""
    t0 = time.perf_counter()
    d = analysis_date or date.today()
    if crop not in kbw.table()["crops"]:
        raise HTTPException(422, "Nieznana uprawa.")
    try:
        parcel = await uldk.by_id(parcel_id)
    except uldk.ParcelNotFound:
        raise HTTPException(404, "Nie znaleziono działki.")
    except uldk.UldkError as e:
        raise HTTPException(503, str(e))
    kc = advisor.CROP_PARAMS.get(crop, {}).get("kc", {})
    try:
        r = await asyncio.wait_for(sentinel.analyse(parcel.geometry, d, kc, kbw.table()["crops"][crop]["name"]), 50)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(503, "Zdjęcia satelitarne Sentinel-2 są chwilowo niedostępne (Earth Search / AWS nie odpowiada). Spróbuj ponownie później.") from e
    return asdict(r) | {
        "source": {"name": "Copernicus Sentinel-2 L2A (ESA) przez Earth Search (Element 84, AWS Open Data)", "url": sentinel.STAC_URL,
                   "license": "dane Copernicus – wolny i otwarty dostęp (Copernicus Sentinel data Legal Notice)", "fetched_at": r.fetched_at},
        "limitations": [
            "Rozdzielczość Sentinel-2 to 10–20 m: wynik to mediana pikseli wewnątrz działki, bez pasów brzegowych mniejszych niż piksel.",
            "Chmury, cienie i śnieg są maskowane klasyfikacją sceny (SCL). Zdjęcie bierzemy tylko wtedy, gdy co najmniej 80% działki jest bez chmur.",
            *r.notes,
        ],
        "elapsed_s": round(time.perf_counter() - t0, 2),
    }


SCENE_RE = re.compile(r"^S2[A-D]_\d{2}[A-Z]{3}_\d{8}_\d+_L2A$")


@router.get("/runoff")
async def runoff_map(parcel_id: str = Query(..., min_length=3, max_length=100)):
    """Where surface water goes on and around the parcel (flow model on the GUGiK terrain model)."""
    t0 = time.perf_counter()
    try:
        parcel = await uldk.by_id(parcel_id)
    except uldk.ParcelNotFound:
        raise HTTPException(404, "Nie znaleziono działki.")
    except uldk.UldkError as e:
        raise HTTPException(503, str(e))
    try:
        r = await asyncio.wait_for(runoff.analyse(parcel.geometry), 30)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(503, "Model terenu GUGiK (NMT) chwilowo nie odpowiada – mapa spływu niedostępna. Spróbuj ponownie później.") from e
    if r is None:
        raise HTTPException(404, "Brak danych wysokościowych dla tej działki (NMT GUGiK).")
    return runoff.as_dict(r) | {
        "area_m2": round(parcel.area_ha * 10_000),
        "source": {"name": "GUGiK NMT – numeryczny model terenu", "url": terrain.URL, "license": "dane PZGiK udostępniane bez opłat"},
        "elapsed_s": round(time.perf_counter() - t0, 2),
    }


@router.get("/satellite/season")
async def satellite_season(
    parcel_id: str = Query(..., min_length=3, max_length=100),
    analysis_date: date | None = Query(None, alias="date"),
):
    """Cloud-free Sentinel-2 frames of the parcel through one growing season (for the time-lapse player)."""
    t0 = time.perf_counter()
    try:
        parcel = await uldk.by_id(parcel_id)
    except uldk.ParcelNotFound:
        raise HTTPException(404, "Nie znaleziono działki.")
    except uldk.UldkError as e:
        raise HTTPException(503, str(e))
    year = sentinel.season_year(analysis_date or date.today())
    try:
        frames = await asyncio.wait_for(sentinel.season(parcel.geometry, year), 90)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(503, "Zdjęcia satelitarne Sentinel-2 są chwilowo niedostępne (Earth Search / AWS nie odpowiada). Spróbuj ponownie później.") from e
    return {"year": year, "frames": [asdict(f) for f in frames], "elapsed_s": round(time.perf_counter() - t0, 2)}


@router.get("/satellite/image")
async def satellite_image(
    scene: str = Query(..., max_length=40),
    parcel_id: str = Query(..., min_length=3, max_length=100),
    kind: str = Query("rgb", pattern="^(rgb|ndmi)$"),
):
    """PNG of the Sentinel-2 scene around the parcel (true colour or NDMI), with the parcel outline."""
    if not SCENE_RE.match(scene):
        raise HTTPException(422, "Nieprawidłowy identyfikator sceny.")
    try:
        parcel = await uldk.by_id(parcel_id)
    except uldk.ParcelNotFound:
        raise HTTPException(404, "Nie znaleziono działki.")
    except uldk.UldkError as e:
        raise HTTPException(503, str(e))
    try:
        png = await asyncio.wait_for(sentinel.image(scene, parcel.geometry, kind), 40)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(503, "Nie udało się pobrać zdjęcia satelitarnego. Spróbuj ponownie później.") from e
    return Response(png, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})


@router.get("")
async def analyse(
    parcel_id: str = Query(..., min_length=3, max_length=100),
    crop: str = Query(...),
    analysis_date: date | None = Query(None, alias="date"),
):
    t0 = time.perf_counter()
    today = date.today()
    d = analysis_date or today
    if d > today + timedelta(days=forecast.HORIZON_DAYS):
        raise HTTPException(422, f"Data analizy może być najwyżej {forecast.HORIZON_DAYS} dni naprzód – tyle obejmuje prognoza pogody.")
    if d < date(today.year - 10, 1, 1):
        raise HTTPException(422, "Data analizy musi mieścić się w ostatnich 10 latach.")
    if crop not in kbw.table()["crops"]:
        raise HTTPException(422, "Nieznana uprawa.")

    try:
        parcel = await uldk.by_id(parcel_id)
    except uldk.ParcelNotFound:
        raise HTTPException(404, "Nie znaleziono działki.")
    except uldk.UldkError as e:
        raise HTTPException(503, str(e))

    lat, lon = parcel.centroid

    async def opt(coro, timeout: float):
        # optional sources: a slow/failing service must not break the analysis – it becomes "brak danych"
        try:
            return await asyncio.wait_for(coro, timeout)
        except Exception as e:  # noqa: BLE001
            return e

    # "wsteczna": past date (assessment as it was then); "biezaca": today ±2 days; "prognoza": future date (forecast weather)
    mode = "prognoza" if d > today else ("biezaca" if (today - d).days <= 2 else "wsteczna")
    soil, met, sg, ter, sur, dit = await asyncio.gather(
        opt(iung.soil_for_parcel(parcel.geometry), 15),
        opt(meteo.daily_history(lat, lon, d), 45),
        opt(soilgrids.query(lat, lon), 16),
        opt(terrain.analyse(parcel.geometry), 15),
        opt(surroundings.analyse(parcel.geometry, lat, lon), 15),
        opt(ditches.analyse(parcel.geometry, lat, lon), 15),
    )

    limitations: list[str] = [
        "Parowanie potencjalne (ET₀) liczone jest metodą FAO-56 Penman-Monteith, a IUNG stosuje zmodyfikowaną metodę Penmana – wartości KBW mogą się nieco różnić od komunikatów SMSR.",
        "Granice działki odpowiadają obecnemu stanowi ewidencji (ULDK), także dla dat historycznych.",
    ]
    missing: list[str] = []

    if isinstance(soil, BaseException):
        soil = iung.SoilResult(None, None, "Brak danych o kategorii gleby (błąd usługi IUNG)", {}, 0, False, None)
        missing.append("Kategoria gleby IUNG – usługa niedostępna")
    if isinstance(met, BaseException):
        raise HTTPException(503, f"Brak danych meteorologicznych (Open-Meteo i NASA POWER niedostępne): {met}")
    limitations = met.limitations + limitations
    if mode == "prognoza":
        if met.forecast_from is None:
            raise HTTPException(503, "Prognoza pogody jest chwilowo niedostępna (Open-Meteo i MET Norway nie odpowiadają), więc nie da się ocenić przyszłej daty. Wybierz dzisiejszą lub wcześniejszą datę.")
        last = met.df.index.max().date()
        if last < d:
            raise HTTPException(503, f"Dostępna teraz prognoza pogody ({met.forecast.source['name'].split(' (')[0]}) sięga tylko do {last.strftime('%d.%m.%Y')}. Wybierz tę lub wcześniejszą datę.")
    fc = meteo.rain_ahead(met.forecast, d) if mode != "wsteczna" else None
    if isinstance(sg, BaseException) or sg is None:
        missing.append("Skład gleby i węgiel organiczny (SoilGrids) – usługa nie odpowiedziała" if isinstance(sg, BaseException) else "Skład gleby (SoilGrids) – brak danych dla tego miejsca")
        sg = None
    if isinstance(ter, BaseException) or ter is None:
        missing.append("Ukształtowanie terenu (NMT GUGiK) – brak danych")
        ter = None
    if isinstance(sur, BaseException) or sur is None:
        missing.append("Otoczenie działki: wody, lasy, mokradła (IUNG) – brak danych")
        sur = None
    if isinstance(dit, BaseException):
        missing.append("Rowy melioracyjne i cieki (BDOT10k GUGiK) – brak danych")
        dit = None

    category = soil.category
    if soil.code == 5:
        limitations.append("Gleba organiczna: progi KBW IUNG obejmują tylko kategorie I–IV. Do oceny przyjęto kategorię IV, co może zaniżać ryzyko suszy.")
        category = "IV"
    elif soil.code is not None and not soil.agricultural:
        limitations.append(f"Według mapy IUNG działka to „{soil.label}”. Ocena suszy rolniczej dla upraw ma tu ograniczoną wiarygodność.")
    if category is None:
        missing.append("Nie można porównać KBW z progiem suszy bez kategorii gleby. Pokazujemy sam bilans wodny na tle wielolecia.")

    df = met.df
    crop_name = kbw.table()["crops"][crop]["name"]

    # --- current season (analysis year) ---
    current = kbw.assess_year(df, crop, category, d.year, d) if category else []
    last_assessed = next((p for p in reversed(current) if p.kbw is not None), None)

    # --- history: previous 10 full seasons ---
    history = []
    if category:
        for y in range(d.year - 10, d.year):
            rows = kbw.assess_year(df, crop, category, y, date(y, 12, 31))
            history.append({
                "year": y,
                "drought": any(r.drought for r in rows),
                "periods": [{"period": r.period, "kbw": r.kbw, "threshold": r.threshold, "drought": r.drought} for r in rows],
            })
    years_with_drought = sum(1 for h in history if h["drought"])
    # how often each period was in drought
    freq = []
    if history:
        for i, per in enumerate(kbw.periods()):
            flags = [h["periods"][i]["drought"] for h in history if i < len(h["periods"]) and h["periods"][i]["drought"] is not None]
            if flags:
                freq.append({"period": per.label, "share": round(sum(flags) / len(flags), 2), "n": len(flags)})

    window = kbw.rolling_window(df, d)

    # confidence: simple, transparent rule
    conf_score = 3
    if category is None:
        conf_score -= 2
    elif soil.code == 5 or not soil.agricultural:
        conf_score -= 1
    if window["coverage"] < 1:
        conf_score -= 1
    if any("NASA POWER" in src["name"] for src in met.sources):
        conf_score -= 1  # coarser fallback weather data
    if mode == "prognoza" and (d - today).days > 7:
        conf_score -= 1  # second week of a weather forecast is much less reliable
    confidence = {3: "wysoki", 2: "średni"}.get(conf_score, "niski")

    sg_d = asdict(sg) if sg else None
    ter_d = asdict(ter) if ter else None
    sur_d = asdict(sur) if sur else None
    dit_d = asdict(dit) if dit else None
    awc_per_m = sg.awc_mm_100 if sg else advisor.AWC_BY_CATEGORY.get(category or "", 120)
    balance = advisor.root_zone_balance(df, crop, d, awc_per_m)
    comparison = advisor.crop_comparison(df, category, d)
    hist_summary = {"years_with_drought": years_with_drought, "years_total": len(history), "period_frequency": freq}
    advice = advisor.advise(
        crop=crop, crop_name=crop_name, analysis_date=d, category=category, soil_code=soil.code,
        current_last_period=asdict(last_assessed) if last_assessed else None, window=window, history=hist_summary,
        meteo_stats=advisor.meteo_window_stats(df, d), soilgrids=sg_d, terrain=ter_d, surroundings=sur_d, ditches=dit_d,
        balance=balance, comparison=comparison, forecast=fc, mode=mode,
    )
    if mode == "wsteczna":
        limitations.append("Analiza wsteczna: ocena i zalecenie dotyczące nawadniania opisują stan na dzień analizy (bez ówczesnej prognozy pogody). Działania retencyjne są aktualne także dziś.")
    if met.forecast_from:
        limitations.insert(0, f"Pogoda od {met.forecast_from.strftime('%d.%m.%Y')} do {d.strftime('%d.%m.%Y')} to {forecast.describe(met.forecast.method)}, a nie pomiar – im dalej od dziś, tym mniej pewna.")
    limitations.append("Współczynniki uprawowe Kc i głębokość korzeni to przybliżenia wg FAO-56 dla typowego kalendarza upraw w Polsce.")
    if sg:
        limitations.append("Dane glebowe SoilGrids mają rozdzielczość 250 m i są modelowane – mogą odbiegać od stanu na działce.")

    sources = [
        {"name": "ULDK GUGiK – granice działki", "url": "https://uldk.gugik.gov.pl", "fetched_at": parcel.fetched_at, "license": "dane PZGiK udostępniane bez opłat"},
        {"name": "IUNG-PIB SMSR – mapa kategorii glebowych (katgl_landuse2024)", "url": iung.WMS_URL, "fetched_at": soil.fetched_at, "license": "dane publiczne IUNG-PIB"},
        {"name": "IUNG-PIB SMSR – wartości progowe KBW (Dz.U. 2019 poz. 739)", "url": "https://susza.iung.pulawy.pl/progi/", "fetched_at": None, "license": "akt prawny"},
        *met.sources,
        *([{"name": "ISRIC SoilGrids 2.0 – skład gleby, węgiel organiczny", "url": soilgrids.URL, "fetched_at": sg.fetched_at, "license": "CC BY 4.0"}] if sg else []),
        *([{"name": "GUGiK NMT – numeryczny model terenu", "url": terrain.URL, "fetched_at": ter.fetched_at, "license": "dane PZGiK udostępniane bez opłat"}] if ter else []),
        *([{"name": "IUNG-PIB – otoczenie działki (wody, lasy, gleby organiczne)", "url": iung.WMS_URL, "fetched_at": sur.fetched_at, "license": "dane publiczne IUNG-PIB"}] if sur else []),
        *([{"name": "GUGiK BDOT10k – rowy melioracyjne i cieki", "url": ditches.URL, "fetched_at": dit.fetched_at, "license": "dane PZGiK udostępniane bez opłat"}] if dit else []),
    ]

    return {
        "parcel": asdict(parcel) | {"landuse": iung.classify_landuse(soil)},
        "crop": {"id": crop, "name": crop_name},
        "analysis_date": d.isoformat(),
        "soil": asdict(soil) | {"category_used": category},
        "current": {
            "window": window,
            "season_periods": [asdict(p) for p in current],
            "last_period": asdict(last_assessed) if last_assessed else None,
            "in_season": date(d.year, 3, 21) <= d <= date(d.year, 9, 30),
        },
        "history": {
            "years": history,
            "years_with_drought": years_with_drought,
            "years_total": len(history),
            "period_frequency": freq,
        },
        "mode": mode,
        "forecast_span": {"from": met.forecast_from.isoformat(), "to": d.isoformat(), "method": met.forecast.method,
                          "label": forecast.describe(met.forecast.method)} if met.forecast_from else None,
        "series": kbw.daily_rolling_series(df, d, crop, category, forecast_from=met.forecast_from),
        "soilgrids": sg_d,
        "terrain": ter_d,
        "surroundings": sur_d,
        "ditches": dit_d,
        "meteo_window": advisor.meteo_window_stats(df, d),
        "causes": [asdict(c) for c in advice["causes"]],
        "recommendations": [asdict(r) for r in advice["recommendations"]],
        "irrigation": advice["irrigation"],
        "crop_comparison": comparison,
        "water": water_budget.budget(df, d, parcel.area_ha, crop, sg.awc_mm_100 if sg else None, dit_d),
        "confidence": confidence,
        "limitations": limitations,
        "missing": missing,
        "sources": sources,
        "meteo_cell": {"lat": met.lat, "lon": met.lon},
        "elapsed_s": round(time.perf_counter() - t0, 2),
    }
