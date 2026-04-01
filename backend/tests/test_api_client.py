import pytest
from fastapi.testclient import TestClient
from backend.server import app, _api_keys

client = TestClient(app)
_api_keys["test-key"] = {"role": "ADMIN", "client": "default", "active": True}
headers = {"X-API-KEY": "test-key"}

def test_kernel_state():
    r = client.get("/api/kernel/state", headers=headers)
    assert r.status_code == 200
    assert "rho" in r.json()

def test_tick():
    r = client.post("/api/kernel/tick", headers=headers)
    assert r.status_code == 200
    assert "diverted" in r.json()

def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"
