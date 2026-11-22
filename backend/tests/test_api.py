import os
import tempfile

os.environ["CACHE_DIR"] = tempfile.mkdtemp(prefix="retentoor-cache-")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services import cache  # noqa: E402


def test_health():
    with TestClient(app) as c:
        assert c.get("/api/health").json()["status"] == "ok"


def test_crops():
    with TestClient(app) as c:
        crops = c.get("/api/analysis/crops").json()
        assert any(x["id"] == "kukurydza_na_ziarno" for x in crops)


def test_file_cache_roundtrip():
    import asyncio

    calls = 0

    async def fetch() -> str:
        nonlocal calls
        calls += 1
        return "payload-ąę"

    p1, _, hit1 = asyncio.run(cache.cached("test", "k/1?x=ą", fetch))
    p2, _, hit2 = asyncio.run(cache.cached("test", "k/1?x=ą", fetch))
    assert (p1, hit1) == ("payload-ąę", False)
    assert (p2, hit2) == ("payload-ąę", True)
    assert calls == 1


def test_rain_ahead_uses_only_forecast_days():
    from datetime import date, timedelta

    import pandas as pd

    from app.services import forecast, meteo

    today = date.today()
    idx = pd.date_range(today - timedelta(days=3), today + timedelta(days=10))
    df = pd.DataFrame({"P": 1.0, "ET0": 2.0, "Tmax": 0.0, "Tmean": 0.0}, index=idx)
    fr = forecast.ForecastResult(df=df, issued=today, method="nwp", source={"fetched_at": None})
    r = meteo.rain_ahead(fr, today - timedelta(days=3))  # window partly in the past
    assert r["days"] == 5 and r["p_next7_mm"] == 5.0  # today-2..today+4, of which today..today+4 are forecast
    assert meteo.rain_ahead(fr, today + timedelta(days=9)) is None  # beyond the horizon
    assert meteo.rain_ahead(None, today) is None


def test_water_budget_volumes():
    import numpy as np
    import pandas as pd
    from datetime import date
    from app.services import water_budget

    idx = pd.date_range("2015-01-01", "2026-11-20", freq="D")
    df = pd.DataFrame({"P": 2.0, "ET0": 3.0}, index=idx)  # ~730 mm/yr
    w = water_budget.budget(df, date(2026, 11, 20), 1.0, "zboza_ozime", 120, {"nearest_ditch_m": 10, "ditch_width_m": 1.0})
    assert w["rain_year_mm"] in (730, 731)
    assert abs(w["rain_year_m3"] - w["rain_year_mm"] * 10) <= 10  # 1 ha: 1 mm = 10 m³
    organic = next(m for m in w["measures"] if m["id"] == "organic")
    assert organic["m3"] == round(0.0116 * 0.3 * 10_000)  # 35 m³ per ha
    assert any(m["id"] == "ditch_weir" for m in w["measures"])
    assert np.isclose(w["use_mm_day"], 3.0 * 1.15, atol=0.05)
