"""Water-situation assessment for a parcel, crop and analysis date (step 1 of the KOWR sequence)."""

import asyncio
import time
from dataclasses import asdict
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query

from ..services import advisor, iung, kbw, meteo, soilgrids, surroundings, terrain, uldk

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.get("/crops")
def list_crops():
    return kbw.crops()


@router.get("")
async def analyse(
    parcel_id: str = Query(..., min_length=3, max_length=100),
    crop: str = Query(...),
    analysis_date: date | None = Query(None, alias="date"),
):
    t0 = time.perf_counter()
    today = date.today()
    d = analysis_date or today
    if d > today:
        raise HTTPException(422, "Data analizy nie może być z przyszłości.")
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

    is_today = (today - d).days <= 2
    soil, met, sg, ter, sur, fc = await asyncio.gather(
        opt(iung.soil_for_parcel(parcel.geometry), 15),
        opt(meteo.daily_history(lat, lon, d), 45),
        opt(soilgrids.query(lat, lon), 16),
        opt(terrain.analyse(parcel.geometry), 15),
        opt(surroundings.analyse(parcel.geometry, lat, lon), 15),
        opt(meteo.forecast_7d(lat, lon), 10) if is_today else asyncio.sleep(0, result=None),
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
    if isinstance(sg, BaseException) or sg is None:
        missing.append("Skład gleby i węgiel organiczny (SoilGrids) – usługa nie odpowiedziała" if isinstance(sg, BaseException) else "Skład gleby (SoilGrids) – brak danych dla tego miejsca")
        sg = None
    if isinstance(ter, BaseException) or ter is None:
        missing.append("Ukształtowanie terenu (NMT GUGiK) – brak danych")
        ter = None
    if isinstance(sur, BaseException) or sur is None:
        missing.append("Otoczenie działki: wody, lasy, mokradła (IUNG) – brak danych")
        sur = None
    if isinstance(fc, BaseException):
        fc = None

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
    confidence = {3: "wysoki", 2: "średni"}.get(conf_score, "niski")

    sg_d = asdict(sg) if sg else None
    ter_d = asdict(ter) if ter else None
    sur_d = asdict(sur) if sur else None
    awc_per_m = sg.awc_mm_100 if sg else advisor.AWC_BY_CATEGORY.get(category or "", 120)
    balance = advisor.root_zone_balance(df, crop, d, awc_per_m)
    comparison = advisor.crop_comparison(df, category, d)
    hist_summary = {"years_with_drought": years_with_drought, "years_total": len(history), "period_frequency": freq}
    advice = advisor.advise(
        crop=crop, crop_name=crop_name, analysis_date=d, category=category, soil_code=soil.code,
        current_last_period=asdict(last_assessed) if last_assessed else None, window=window, history=hist_summary,
        meteo_stats=advisor.meteo_window_stats(df, d), soilgrids=sg_d, terrain=ter_d, surroundings=sur_d,
        balance=balance, comparison=comparison, forecast=fc,
    )
    if not is_today:
        limitations.append("Analiza historyczna: zalecenie dotyczące nawadniania odnosi się do stanu na dzień analizy (bez prognozy pogody).")
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
        *([{"name": "Open-Meteo Forecast – prognoza 7 dni", "url": meteo.FORECAST_URL, "fetched_at": fc["fetched_at"], "license": "CC BY 4.0"}] if fc else []),
    ]

    return {
        "parcel": asdict(parcel),
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
        "series": kbw.daily_rolling_series(df, d, crop, category),
        "soilgrids": sg_d,
        "terrain": ter_d,
        "surroundings": sur_d,
        "meteo_window": advisor.meteo_window_stats(df, d),
        "causes": [asdict(c) for c in advice["causes"]],
        "recommendations": [asdict(r) for r in advice["recommendations"]],
        "irrigation": advice["irrigation"],
        "crop_comparison": comparison,
        "confidence": confidence,
        "limitations": limitations,
        "missing": missing,
        "sources": sources,
        "meteo_cell": {"lat": met.lat, "lon": met.lon},
        "elapsed_s": round(time.perf_counter() - t0, 2),
    }


# ------------------------------------------------------------------ saved reports

reports = APIRouter(prefix="/reports", tags=["reports"])


@reports.post("", status_code=201)
async def save_report(
    parcel_id: str = Query(..., min_length=3, max_length=100),
    crop: str = Query(...),
    analysis_date: date | None = Query(None, alias="date"),
):
    """Recomputes the analysis server-side (inputs are cached, so it's fast) and stores the snapshot."""
    import json
    import secrets

    from fastapi.encoders import jsonable_encoder
    from sqlmodel import Session

    from ..db import engine
    from ..models import SavedReport

    result = await analyse(parcel_id=parcel_id, crop=crop, analysis_date=analysis_date)
    rid = secrets.token_urlsafe(6)
    with Session(engine) as s:
        s.add(SavedReport(id=rid, parcel_id=result["parcel"]["id"], crop=crop, analysis_date=result["analysis_date"],
                          payload=json.dumps(jsonable_encoder(result), ensure_ascii=False)))
        s.commit()
    return {"id": rid}


@reports.get("/{rid}")
def get_report(rid: str):
    import json

    from sqlmodel import Session

    from ..db import engine
    from ..models import SavedReport

    with Session(engine) as s:
        r = s.get(SavedReport, rid)
        if not r:
            raise HTTPException(404, "Nie znaleziono raportu.")
        return {"id": r.id, "created_at": r.created_at, "analysis": json.loads(r.payload)}
