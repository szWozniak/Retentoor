""""Ile wody zatrzymasz" – the water budget of the parcel in cubic metres.

Turns the recommendations into volumes a farmer can picture. Each number comes with its assumptions; they are screening
estimates (order of magnitude), not a design. The pond / hollow volume needs the flow model and is added by the
frontend from /analysis/runoff.

References:
- Minasny & McBratney (2018), Limited effect of organic matter on soil available water capacity, Eur. J. Soil Sci. 69:
  +10 g/kg soil organic carbon ≈ +1.16 percentage points (by volume) of available water.
- FAO-56 for crop water use (ET0 × Kc).
"""

from datetime import date

import pandas as pd

from .advisor import CROP_PARAMS

SOC_GAIN_VOL = 0.0116  # +1 percentage point SOC → +1.16 % vol available water (Minasny & McBratney 2018)
TOPSOIL_M = 0.3
DAM_HEIGHT_M = 0.4  # water held up by a weir, averaged along the ditch
STRIP_M = 50  # width of the field strip whose groundwater a dammed ditch raises (parcel side only)
WT_RISE_M = 0.3  # groundwater rise in that strip
SPECIFIC_YIELD = 0.1  # water released per metre of groundwater change in a mineral soil


def _pl(x: float, nd: int = 0) -> str:
    """Polish number: space as thousands separator, decimal comma."""
    return f"{x:,.{nd}f}".replace(",", " ").replace(".", ",")


def budget(df: pd.DataFrame, analysis_date: date, area_ha: float, crop: str, awc_mm_100: float | None, ditches: dict | None) -> dict | None:
    area = area_ha * 10_000
    years = [y for y in range(analysis_date.year - 10, analysis_date.year) if ((df.index.year == y).sum() >= 360)]
    if not years:
        return None
    yearly = df[df.index.year.isin(years)]
    rain_mm = float(yearly["P"].groupby(yearly.index.year).sum().mean())
    summer = yearly[yearly.index.month.isin([6, 7, 8])]
    et0_summer = float(summer["ET0"].mean())
    kc_max = max(CROP_PARAMS.get(crop, {}).get("kc", {1: 1.0}).values())
    use_mm_day = et0_summer * kc_max
    use_m3_day = use_mm_day / 1000 * area

    def days(m3: float) -> float:
        return round(m3 / use_m3_day, 1) if use_m3_day else 0.0

    measures = []
    soc_m3 = SOC_GAIN_VOL * TOPSOIL_M * area
    measures.append({
        "id": "organic", "title": "Więcej materii organicznej (+1 pkt proc. węgla w glebie)", "m3": round(soc_m3), "days": days(soc_m3),
        "permanent": True,
        "assumptions": [f"+1,16 pkt proc. objętości wody dostępnej w warstwie 0–30 cm (Minasny i McBratney 2018), na {_pl(area_ha, 2)} ha"],
    })
    if ditches and ditches.get("nearest_ditch_m") is not None and ditches["nearest_ditch_m"] <= 50:
        length = min(area ** 0.5, 400)
        width = max(ditches.get("ditch_width_m") or 1.0, 0.8)
        ditch_m3 = length * width * DAM_HEIGHT_M
        ground_m3 = length * STRIP_M * WT_RISE_M * SPECIFIC_YIELD
        m3 = ditch_m3 + ground_m3
        measures.append({
            "id": "ditch_weir", "title": "Zastawka na rowie przy działce", "m3": round(m3), "days": days(m3), "permanent": False,
            "assumptions": [
                f"ok. {_pl(length)} m rowu wzdłuż działki (przyjęto długość boku działki), szerokość {_pl(width, 1)} m, spiętrzenie {_pl(DAM_HEIGHT_M, 1)} m: {_pl(ditch_m3)} m³ w rowie",
                f"podniesienie wód gruntowych o {_pl(WT_RISE_M, 1)} m w pasie {STRIP_M} m od rowu (odsączalność 10%): {_pl(ground_m3)} m³ w glebie",
                "zatrzymane wiosną, z roztopów i opadów – co roku na nowo",
            ],
        })
    return {
        "area_m2": round(area),
        "rain_year_mm": round(rain_mm),
        "rain_year_m3": round(rain_mm / 1000 * area),
        "years": f"{years[0]}–{years[-1]}",
        "use_mm_day": round(use_mm_day, 1),
        "use_m3_day": round(use_m3_day),
        "soil_m3": round(awc_mm_100 / 1000 * area) if awc_mm_100 else None,
        "measures": measures,
    }
