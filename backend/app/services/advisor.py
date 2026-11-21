"""Causes of water shortage + recommendations, following the KOWR sequence:
ocena sytuacji wodnej → identyfikacja przyczyn → retencja krajobrazowa → retencja glebowa / agrotechnika → nawadnianie.

Everything here is rule-based and transparent: each cause / recommendation is triggered by a condition on
measured data and carries the numbers that justify it plus a reference to the method or guideline.

References used in `basis`:
- IUNG SMSR – Doroszewski i in. (2012), Podstawy Systemu Monitoringu Suszy Rolniczej; Dz.U. 2019 poz. 739
- FAO-56 – Allen, Pereira, Raes, Smith, Crop evapotranspiration (FAO Irrigation and Drainage Paper 56)
- NWRM – European Commission (2014/2015), Natural Water Retention Measures
- 4p1000 – Minasny i in. (2017), Soil carbon 4 per mille, Geoderma 292
- CDR 2025 – Centrum Doradztwa Rolniczego, Melioracje, retencja i gospodarka wodna w rolnictwie (e-poradnik)
- Saxton & Rawls (2006) – pedotransfer functions for available water capacity
"""

from dataclasses import dataclass, field
from datetime import date, timedelta

import numpy as np
import pandas as pd

from . import kbw

# Approximate FAO-56 crop coefficients (Table 12) mapped onto the Polish season, root depth Zr [m] and
# depletion fraction p. Monthly values; 0 = crop not in the field. Approximation – documented as such.
CROP_PARAMS: dict[str, dict] = {
    "zboza_ozime": {"kc": {3: 0.7, 4: 1.0, 5: 1.15, 6: 1.15, 7: 0.4}, "zr": 1.0, "p": 0.55},
    "zboza_jare": {"kc": {4: 0.4, 5: 0.9, 6: 1.15, 7: 0.7}, "zr": 0.9, "p": 0.55},
    "kukurydza_na_ziarno": {"kc": {5: 0.3, 6: 0.7, 7: 1.2, 8: 1.2, 9: 0.8}, "zr": 1.0, "p": 0.55},
    "kukurydza_na_kiszonke": {"kc": {5: 0.3, 6: 0.7, 7: 1.2, 8: 1.15, 9: 0.9}, "zr": 1.0, "p": 0.55},
    "rzepak_i_rzepik": {"kc": {3: 0.7, 4: 1.0, 5: 1.1, 6: 1.05, 7: 0.35}, "zr": 1.0, "p": 0.6},
    "ziemniak": {"kc": {5: 0.5, 6: 0.9, 7: 1.15, 8: 0.9, 9: 0.75}, "zr": 0.5, "p": 0.35},
    "burak_cukrowy": {"kc": {4: 0.35, 5: 0.6, 6: 1.0, 7: 1.2, 8: 1.2, 9: 1.0}, "zr": 0.9, "p": 0.55},
    "chmiel": {"kc": {5: 0.3, 6: 0.8, 7: 1.05, 8: 1.05, 9: 0.85}, "zr": 1.0, "p": 0.5},
    "tyton": {"kc": {6: 0.5, 7: 1.0, 8: 1.15, 9: 0.8}, "zr": 0.8, "p": 0.5},
    "warzywa_gruntowe": {"kc": {5: 0.6, 6: 0.9, 7: 1.0, 8: 1.0, 9: 0.9}, "zr": 0.5, "p": 0.4},
    "krzewy_owocowe": {"kc": {4: 0.5, 5: 0.8, 6: 1.0, 7: 1.0, 8: 0.9, 9: 0.7}, "zr": 0.8, "p": 0.5},
    "drzewa_owocowe": {"kc": {4: 0.6, 5: 0.9, 6: 1.1, 7: 1.1, 8: 1.05, 9: 0.85}, "zr": 1.2, "p": 0.5},
    "truskawki": {"kc": {4: 0.5, 5: 0.8, 6: 0.85, 7: 0.75, 8: 0.7, 9: 0.6}, "zr": 0.3, "p": 0.2},
    "rosliny_straczkowe": {"kc": {4: 0.4, 5: 0.8, 6: 1.15, 7: 0.9, 8: 0.35}, "zr": 0.7, "p": 0.45},
}
# fallback plant-available water per 1 m of soil by IUNG category (mm), used when SoilGrids is unavailable
AWC_BY_CATEGORY = {"I": 70, "II": 100, "III": 140, "IV": 170}


@dataclass
class Cause:
    id: str
    title: str
    status: str  # "tak" | "częściowo" | "nie" | "brak danych"
    evidence: list[str] = field(default_factory=list)


@dataclass
class Recommendation:
    id: str
    stage: str  # retencja_krajobrazowa | retencja_glebowa | agrotechnika | nawadnianie
    title: str
    action: str
    why: list[str]
    priority: str  # wysoki | średni | niski
    basis: list[str]
    permit: str | None = None
    location: dict | None = None  # {"lat", "lon", "label"}


# ---------------------------------------------------------------- meteorology of the recent window

def _longest_dry_spell(p: pd.Series, thr: float = 1.0) -> int:
    best = cur = 0
    for v in p.fillna(0).values:
        cur = cur + 1 if v < thr else 0
        best = max(best, cur)
    return best


def meteo_window_stats(df: pd.DataFrame, end: date, days: int = 61) -> dict:
    """Precipitation, ET0, hot days, longest dry spell in the window – now vs median of the 10 previous years."""

    def stats(e: date) -> dict | None:
        w = df.loc[pd.Timestamp(e - timedelta(days=days - 1)) : pd.Timestamp(e)]
        if len(w) < days * 0.9:
            return None
        return {
            "p": float(w["P"].sum()),
            "et0": float(w["ET0"].sum()),
            "hot_days": int((w["Tmax"] >= 30).sum()),
            "dry_spell": _longest_dry_spell(w["P"]),
            "tmean": float(w["Tmean"].mean()),
        }

    now = stats(end)
    hist = [s for y in range(1, 11) if (s := stats(_shift_year(end, -y)))]
    med = {k: float(np.median([h[k] for h in hist])) for k in now} if now and hist else None
    return {"now": now, "median": med, "n_years": len(hist)}


def _shift_year(d: date, n: int) -> date:
    try:
        return d.replace(year=d.year + n)
    except ValueError:
        return d.replace(year=d.year + n, day=28)


# ---------------------------------------------------------------- FAO-56 root-zone water balance

def root_zone_balance(df: pd.DataFrame, crop: str, analysis_date: date, awc_per_m: float) -> dict | None:
    """Daily soil-water depletion (FAO-56 ch. 8, simplified): start at field capacity on 1 March,
    Dr = Dr − Peff + Kc·ET0, bounded by [0, TAW]. Peff = 0.8 · P (rain-days > 2 mm)."""
    cp = CROP_PARAMS.get(crop)
    if not cp:
        return None
    kc_month = cp["kc"]
    if not kc_month.get(analysis_date.month):
        return {"in_field": False}
    taw = awc_per_m * cp["zr"]
    raw = cp["p"] * taw
    start = date(analysis_date.year, 3, 1)
    w = df.loc[pd.Timestamp(start) : pd.Timestamp(analysis_date)]
    dr = 0.0
    stress_days = 0
    for ts, row in w.iterrows():
        kc = kc_month.get(ts.month, 0)
        p = 0.0 if pd.isna(row["P"]) else float(row["P"])
        peff = 0.8 * p if p > 2 else 0.0
        etc = kc * (0.0 if pd.isna(row["ET0"]) else float(row["ET0"]))
        dr = min(taw, max(0.0, dr - peff + etc))
        if kc > 0 and dr > raw:
            stress_days += 1
    last7 = df.loc[pd.Timestamp(analysis_date - timedelta(days=6)) : pd.Timestamp(analysis_date)]
    return {
        "in_field": True,
        "kc": kc_month.get(analysis_date.month),
        "taw_mm": round(taw),
        "raw_mm": round(raw),
        "depletion_mm": round(dr),
        "stress": dr > raw,
        "stress_days_season": stress_days,
        "etc_last7_mm": round(float((last7["ET0"] * kc_month.get(analysis_date.month, 0)).sum()), 1),
        "p_last7_mm": round(float(last7["P"].sum()), 1),
    }


# ---------------------------------------------------------------- crop comparison

def crop_comparison(df: pd.DataFrame, category: str | None, analysis_date: date) -> list[dict]:
    """How often (in the last 10 seasons) each crop would have been in drought on this parcel."""
    if not category:
        return []
    out = []
    for c in kbw.crops():
        years = 0
        n = 0
        suited = True
        for y in range(analysis_date.year - 10, analysis_date.year):
            rows = kbw.assess_year(df, c["id"], category, y, date(y, 12, 31))
            if rows and all(r.threshold is None for r in rows):
                suited = False
                break
            flags = [r.drought for r in rows if r.drought is not None]
            if flags:
                n += 1
                years += any(flags)
        out.append({"crop": c["id"], "name": c["name"], "drought_years": years if suited else None, "n": n, "suited": suited})
    return sorted(out, key=lambda r: (r["drought_years"] is None, r["drought_years"] or 0))


# ---------------------------------------------------------------- main rule engine

def advise(
    *,
    crop: str,
    crop_name: str,
    analysis_date: date,
    category: str | None,
    soil_code: int | None,
    current_last_period: dict | None,
    window: dict,
    history: dict,
    meteo_stats: dict,
    soilgrids: dict | None,
    terrain: dict | None,
    surroundings: dict | None,
    balance: dict | None,
    comparison: list[dict],
    forecast: dict | None,
) -> dict:
    causes: list[Cause] = []
    recs: list[Recommendation] = []
    ms_now, ms_med = meteo_stats.get("now"), meteo_stats.get("median")
    drought_now = bool(current_last_period and current_last_period.get("drought"))
    yrs, yrs_total = history.get("years_with_drought", 0), history.get("years_total", 0)
    freq = sorted(history.get("period_frequency", []), key=lambda f: -f["share"])
    worst = freq[0] if freq and freq[0]["share"] > 0 else None

    # ---------------- cause 1: precipitation deficit + heat
    if ms_now and ms_med:
        ev = []
        p_ratio = ms_now["p"] / ms_med["p"] if ms_med["p"] > 0 else 1
        hot_more = ms_now["hot_days"] - ms_med["hot_days"]
        dry_more = ms_now["dry_spell"] - ms_med["dry_spell"]
        ev.append(f"Opad w ostatnich 60 dniach: {ms_now['p']:.0f} mm, czyli {p_ratio:.0%} typowej wartości ({ms_med['p']:.0f} mm, mediana z {meteo_stats['n_years']} lat).")
        ev.append(f"Parowanie potencjalne (ET₀): {ms_now['et0']:.0f} mm (typowo {ms_med['et0']:.0f} mm).")
        ev.append(f"Dni upalne (≥30°C): {ms_now['hot_days']} (typowo {ms_med['hot_days']:.0f}). Najdłuższy okres bez opadu (<1 mm): {ms_now['dry_spell']} dni (typowo {ms_med['dry_spell']:.0f}).")
        if window.get("percentile") is not None:
            ev.append(f"Bilans wodny (opad − parowanie) jest na {window['percentile']:.0f}. percentylu wielolecia.")
        strong = p_ratio < 0.6 or (window.get("percentile") is not None and window["percentile"] <= 20)
        some = p_ratio < 0.85 or hot_more >= 3 or dry_more >= 5 or drought_now
        causes.append(Cause("meteo", "Niedobór opadów i wysoka temperatura", "tak" if strong else "częściowo" if some else "nie", ev))
    else:
        causes.append(Cause("meteo", "Niedobór opadów i wysoka temperatura", "brak danych", ["Brak pełnych danych meteorologicznych dla okresu."]))

    # ---------------- cause 2: low soil water storage
    ev = []
    weak = 0
    if category:
        ev.append(f"Kategoria podatności gleby na suszę wg IUNG: {category} ({'gleby lekkie, słabo zatrzymujące wodę' if category in ('I', 'II') else 'gleby średnie do ciężkich'}).")
        weak += category in ("I", "II")
    elif soil_code == 5:
        ev.append("Gleby organiczne – zwykle dobrze zatrzymują wodę, ale po przesuszeniu tracą zdolność retencji (mineralizacja).")
    if soilgrids:
        ev.append(f"Skład gleby (SoilGrids, 0–30 cm): piasek {soilgrids['sand_pct']:.0f}%, ił {soilgrids['clay_pct']:.0f}% – gleba {soilgrids['texture']}.")
        ev.append(f"Woda dostępna dla roślin w profilu 0–100 cm: ok. {soilgrids['awc_mm_100']:.0f} mm (Saxton & Rawls 2006).")
        ev.append(f"Węgiel organiczny 0–30 cm: {soilgrids['soc_pct']:.1f}% (materia organiczna ok. {soilgrids['om_pct']:.1f}%).")
        weak += soilgrids["awc_mm_100"] < 110
        weak += soilgrids["soc_pct"] < 1.2
    status = "brak danych" if not ev else "tak" if weak >= 2 else "częściowo" if weak == 1 else "nie"
    causes.append(Cause("soil", "Mała zdolność gleby do magazynowania wody", status, ev or ["Brak danych glebowych."]))

    # ---------------- cause 3: surface runoff / lack of landscape retention
    ev = []
    runoff = 0
    if terrain:
        ev.append(f"Nachylenie działki (NMT GUGiK): średnio {terrain['slope_pct']:.1f}%, lokalnie do {terrain['max_local_slope_pct']:.0f}%; różnica wysokości {terrain['relief_m']:.1f} m.")
        if terrain.get("downslope_dir"):
            ev.append(f"Woda opadowa spływa w kierunku: {terrain['downslope_dir']}.")
        runoff += terrain["slope_pct"] >= 3
        runoff += terrain["slope_pct"] >= 8
    if surroundings:
        ev.append(
            f"W promieniu ~1 km (mapa IUNG): wody {surroundings['water_share']:.0%}, lasy i zadrzewienia {surroundings['forest_share']:.0%}, gleby organiczne (dawne mokradła) {surroundings['organic_share']:.0%}."
        )
        if surroundings.get("nearest_water_m") is not None:
            ev.append(f"Najbliższe wody powierzchniowe na mapie IUNG: ok. {surroundings['nearest_water_m']:.0f} m od działki.")
        few_elements = surroundings["water_share"] + surroundings["forest_share"] + surroundings["organic_share"] < 0.1
        if few_elements:
            ev.append("Mało elementów krajobrazu spowalniających odpływ wody (oczka, mokradła, zadrzewienia).")
        runoff += few_elements
    status = "brak danych" if not ev else "tak" if runoff >= 2 else "częściowo" if runoff == 1 else "nie"
    causes.append(Cause("runoff", "Szybki odpływ wody i mało retencji w krajobrazie", status, ev or ["Brak danych o terenie."]))

    # ---------------- cause 4: crop sensitivity
    ev = []
    if yrs_total:
        ev.append(f"W ostatnich {yrs_total} latach susza dla uprawy „{crop_name}” na tej glebie wystąpiła w {yrs} sezonach.")
    if worst:
        ev.append(f"Najczęściej w okresie {worst['period']} ({worst['share']:.0%} lat) – to krytyczny czas dla tej uprawy.")
    better = [c for c in comparison if c["drought_years"] is not None and c["crop"] != crop and c["drought_years"] < yrs]
    if better and yrs >= 2:
        ev.append("Mniej narażone na tej działce: " + ", ".join(f"{c['name'].lower()} ({c['drought_years']}/{c['n']})" for c in better[:3]) + ".")
    causes.append(Cause("crop", "Wrażliwość uprawy na niedobór wody", "tak" if yrs >= 3 else "częściowo" if yrs >= 1 else "nie" if yrs_total else "brak danych", ev or ["Brak oceny wieloletniej."]))

    # ================= recommendations: 1) landscape retention
    if terrain and terrain["relief_m"] >= 1.0 and terrain["slope_pct"] >= 1.0:
        recs.append(Recommendation(
            "low_spot", "retencja_krajobrazowa", "Zatrzymaj wodę w najniższym miejscu działki",
            "W najniższym punkcie działki (zaznaczony na mapie) rozważ nieckę, płytkie oczko śródpolne lub pas trwałej roślinności, gdzie woda opadowa będzie mogła wsiąkać zamiast odpływać.",
            [f"Różnica wysokości na działce: {terrain['relief_m']:.1f} m, średnie nachylenie {terrain['slope_pct']:.1f}% – woda zbiera się w jednym miejscu.",
             f"Najniższy punkt: {terrain['min_m']:.1f} m n.p.m."],
            "wysoki" if terrain["slope_pct"] >= 3 else "średni", ["NWRM (EC 2014)", "CDR 2025", "NMT GUGiK"],
            permit="Budowa stawu lub zbiornika może wymagać zgłoszenia lub pozwolenia wodnoprawnego (Wody Polskie) – sprawdź przed realizacją.",
            location={"lat": terrain["lowest_point"][0], "lon": terrain["lowest_point"][1], "label": "Najniższy punkt działki"},
        ))
    if terrain and terrain["slope_pct"] >= 3:
        recs.append(Recommendation(
            "buffer", "retencja_krajobrazowa", "Pas buforowy lub zadrzewienie na dolnej krawędzi pola",
            f"Wzdłuż dolnej krawędzi działki (strona: {terrain.get('downslope_dir') or 'najniższa'}) pozostaw pas trawy, krzewów lub drzew szerokości kilku metrów. Spowalnia spływ, zatrzymuje glebę i wodę.",
            [f"Nachylenie {terrain['slope_pct']:.1f}% sprzyja spływowi powierzchniowemu i erozji."],
            "wysoki" if terrain["slope_pct"] >= 8 else "średni", ["NWRM (EC 2014)", "Podstawy naukowe KOWR"],
        ))
    if surroundings and surroundings.get("nearest_water_m") is not None and surroundings["nearest_water_m"] <= 500:
        recs.append(Recommendation(
            "ditch", "retencja_krajobrazowa", "Spowolnij odpływ w rowach i ciekach przy działce",
            "Jeśli przy działce jest rów melioracyjny, rozważ zastawkę (piętrzenie) wiosną, by zatrzymać wodę z roztopów, oraz ochronę istniejących oczek i mokradeł z pasem buforowym.",
            [f"Wody powierzchniowe ok. {surroundings['nearest_water_m']:.0f} m od działki."],
            "średni", ["NWRM (EC 2014)", "CDR 2025"],
            permit="Piętrzenie wody na rowach wymaga uzgodnienia z zarządcą (spółka wodna / Wody Polskie).",
        ))
    if surroundings and surroundings["water_share"] + surroundings["forest_share"] + surroundings["organic_share"] < 0.1:
        recs.append(Recommendation(
            "landscape", "retencja_krajobrazowa", "Dodaj elementy zatrzymujące wodę w krajobrazie",
            "Zadrzewienia śródpolne, miedze i małe oczka wodne zmniejszają parowanie z pól (osłona przed wiatrem) i spowalniają odpływ. Warto planować je wspólnie z sąsiadami.",
            ["W promieniu ~1 km jest mniej niż 10% wód, lasów i gleb organicznych."],
            "średni", ["NWRM (EC 2014)", "Podstawy naukowe KOWR"],
        ))

    # ================= 2) soil retention
    low_soc = soilgrids and soilgrids["soc_pct"] < 2.0
    light = category in ("I", "II") or (soilgrids and soilgrids["sand_pct"] >= 60)
    if low_soc or light:
        why = []
        if soilgrids and soilgrids["soc_pct"] < 2.0:
            why.append(f"Węgiel organiczny tylko {soilgrids['soc_pct']:.1f}% – każdy 1% więcej materii organicznej to kilka mm więcej wody w glebie.")
        elif soilgrids:
            why.append(f"Węgiel organiczny {soilgrids['soc_pct']:.1f}% to dobry poziom – na lekkiej glebie trzeba go utrzymać, bo to główny magazyn wody.")
        if light:
            why.append(f"Gleba lekka (kat. {category or '?'}) szybko przesycha.")
        recs.append(Recommendation(
            "organic", "retencja_glebowa", "Zwiększaj materię organiczną w glebie" if low_soc else "Utrzymuj materię organiczną w glebie",
            "Pozostawiaj resztki pożniwne, stosuj obornik/kompost i nawozy naturalne. To najtańszy sposób na trwałe zwiększenie pojemności wodnej gleby.",
            why, "wysoki" if light else "średni", ["4p1000 (Minasny 2017)", "Podstawy naukowe KOWR", "CDR 2025"],
        ))
    recs.append(Recommendation(
        "cover", "retencja_glebowa", "Międzyplony i okrywa gleby",
        "Po zbiorze wysiej międzyplon ścierniskowy lub ozimy. Gleba okryta roślinami lub mulczem paruje mniej i lepiej chłonie deszcz.",
        [*([f"Susza na tej działce wystąpiła w {yrs}/{yrs_total} sezonów."] if yrs else []),
         *([f"Gleba lekka (kat. {category or '?'}) – bez okrywy szybko traci wodę."] if light else []),
         *([f"Bieżący bilans wodny na {window['percentile']:.0f}. percentylu wielolecia."] if window.get("percentile") is not None and window["percentile"] <= 30 else []),
         "Gleba okryta roślinami lub resztkami paruje mniej niż goła."],
        "wysoki" if yrs >= 3 or light else "średni", ["Podstawy naukowe KOWR", "CDR 2025"],
    ))

    # ================= 3) agrotechnics
    if yrs >= 2 or drought_now or light:
        recs.append(Recommendation(
            "tillage", "agrotechnika", "Ogranicz intensywną uprawę gleby",
            "Rozważ uprawę uproszczoną (bezorkową) i unikanie głębokiej orki przed suchym okresem – każdy zabieg przesusza wierzchnią warstwę gleby.",
            [*([f"Susza w {yrs}/{yrs_total} sezonów."] if yrs else []),
             *([f"Gleba lekka (kat. {category or '?'}) – każdy zabieg uprawowy przesusza wierzchnią warstwę."] if light else []),
             *(["Bieżący okres poniżej progu suszy."] if drought_now else [])],
            "średni", ["Podstawy naukowe KOWR", "CDR 2025"],
        ))
    if worst:
        recs.append(Recommendation(
            "timing", "agrotechnika", f"Przygotuj się na okres {worst['period']}",
            "Wybieraj odmiany o większej tolerancji na suszę i termin siewu pozwalający roślinom ukorzenić się przed tym okresem. Monitoruj stan upraw szczególnie w tym czasie.",
            [f"W tym okresie susza wystąpiła w {worst['share']:.0%} z ostatnich {worst['n']} lat."],
            "średni", ["IUNG SMSR"],
        ))
    if better and yrs >= 3:
        recs.append(Recommendation(
            "crop_choice", "agrotechnika", "Rozważ uprawy mniej narażone na suszę na tej działce",
            "Przy planowaniu płodozmianu weź pod uwagę uprawy, które na tej glebie i w tym klimacie rzadziej cierpiały z powodu suszy.",
            [f"„{crop_name}”: susza w {yrs}/{yrs_total} sezonów; " + ", ".join(f"{c['name'].lower()}: {c['drought_years']}/{c['n']}" for c in better[:3]) + "."],
            "niski", ["IUNG SMSR (progi KBW dla 14 grup upraw)"],
        ))

    # ================= 4) irrigation (optional, last)
    irrigation = None
    if balance and balance.get("in_field"):
        need = balance["stress"]
        rain_soon = forecast.get("p_next7_mm") if forecast else None
        dose = int(round(min(balance["depletion_mm"], 30) / 5) * 5) if need else 0
        if need and rain_soon is not None and rain_soon >= balance["depletion_mm"] * 0.8:
            decision, dose = "wstrzymaj się", 0
        elif need:
            decision = "zasadne"
        else:
            decision = "niezasadne"
        why = [
            f"Szacowany niedobór wody w strefie korzeni: {balance['depletion_mm']} mm, przy łatwo dostępnej wodzie {balance['raw_mm']} mm (z {balance['taw_mm']} mm dostępnej).",
            f"Ostatnie 7 dni: opad {balance['p_last7_mm']} mm, potrzeby wodne uprawy (ET₀·Kc) {balance['etc_last7_mm']} mm.",
        ]
        if rain_soon is not None:
            why.append(f"Prognoza opadu na 7 dni (Open-Meteo): {rain_soon:.0f} mm.")
        if balance["stress_days_season"]:
            why.append(f"Dni ze stresem wodnym w tym sezonie: {balance['stress_days_season']}.")
        irrigation = {"decision": decision, "dose_mm": dose, **balance, "p_next7_mm": rain_soon}
        recs.append(Recommendation(
            "irrigation", "nawadnianie",
            {"zasadne": f"Nawadnianie zasadne: ok. {dose} mm w najbliższych dniach", "niezasadne": "Nawadnianie teraz niepotrzebne",
             "wstrzymaj się": "Wstrzymaj się z nawadnianiem – w prognozie opady"}[decision],
            "Nawadniaj wieczorem lub rano, dawkami 20–30 mm, i dopiero po wykorzystaniu działań retencyjnych. Sprawdzaj wilgotność gleby na głębokości korzeni (np. próba palcowa, tensjometr)."
            if decision == "zasadne" else "Obserwuj uprawę i prognozę. Zapas wody w glebie wystarcza lub nadchodzą opady.",
            why, "wysoki" if decision == "zasadne" else "niski", ["FAO-56 (bilans wodny strefy korzeniowej)", "Open-Meteo"],
            permit="Pobór wody do nawadniania powyżej limitu zwykłego korzystania z wód może wymagać pozwolenia wodnoprawnego – sprawdź w Wodach Polskich." if decision == "zasadne" else None,
        ))
    elif balance and not balance.get("in_field"):
        irrigation = {"decision": "poza sezonem", "dose_mm": 0, "in_field": False}

    order = {"retencja_krajobrazowa": 0, "retencja_glebowa": 1, "agrotechnika": 2, "nawadnianie": 3}
    prio = {"wysoki": 0, "średni": 1, "niski": 2}
    recs.sort(key=lambda r: (order[r.stage], prio[r.priority]))
    return {"causes": causes, "recommendations": recs, "irrigation": irrigation}
