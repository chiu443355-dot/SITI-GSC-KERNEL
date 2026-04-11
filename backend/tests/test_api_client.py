import pytest
import hashlib
from fastapi.testclient import TestClient
from backend.server import app, _api_keys, _get_session, MIMIKernel, _generate_dataset

client = TestClient(app)
key = "test-key"
key_hash = hashlib.sha256(key.encode()).hexdigest()
_api_keys[key] = {"role": "ADMIN", "client": "default", "active": True, "hash": key_hash}
headers = {"X-API-KEY": key}

@pytest.fixture(autouse=True)
def init_kernel():
    session = _get_session("default")
    if session["mimi"] is None:
        session["mimi"] = MIMIKernel(_generate_dataset(n=100))

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
