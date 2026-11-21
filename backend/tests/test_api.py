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
