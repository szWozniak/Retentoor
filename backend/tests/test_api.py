import os

os.environ["DATABASE_URL"] = "sqlite:///./data/test.db"
os.environ["UPLOAD_DIR"] = "./data/test_uploads"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def test_health():
    with TestClient(app) as c:
        assert c.get("/api/health").json()["status"] == "ok"


def test_records_crud():
    with TestClient(app) as c:
        r = c.post("/api/records", json={"title": "Test", "content": "abc"})
        assert r.status_code == 201
        rid = r.json()["id"]
        assert c.patch(f"/api/records/{rid}", json={"label": "ok"}).json()["label"] == "ok"
        assert any(x["id"] == rid for x in c.get("/api/records", params={"q": "Test"}).json())
        assert c.delete(f"/api/records/{rid}").status_code == 204
        assert c.get(f"/api/records/{rid}").status_code == 404


def test_csv_upload_preview():
    with TestClient(app) as c:
        r = c.post("/api/files", files={"file": ("a.csv", b"x;y\n1;2\n3;4\n", "text/csv")})
        p = r.json()["preview"]
        assert p["rows"] == 2 and p["columns"] == ["x", "y"]
