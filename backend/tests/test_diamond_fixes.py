import pytest
from fastapi.testclient import TestClient
from backend.server import app, _api_keys, ADMIN_SECRET

client = TestClient(app)
_api_keys["test-key"] = {"role": "OPERATOR", "client": "test_client", "active": True}
headers = {"X-API-KEY": "test-key"}

def test_mock_activate_unauthorized():
    response = client.post("/api/payments/mock-activate", json={"tenant_id": "test_client"})
    assert response.status_code == 401

def test_mock_activate_authorized():
    response = client.post(
        "/api/payments/mock-activate",
        json={"tenant_id": "test_client"},
        headers={"X-Admin-Secret": ADMIN_SECRET}
    )
    # This might fail if Supabase is not configured, but let's see how it behaves
    # If Supabase is None, it won't crash but won't do much.
    assert response.status_code == 200

def test_bulk_ingest():
    payload = [
        {"awb": "AWB1", "hub": "Mumbai", "status": "In Transit"},
        {"awb": "AWB2", "hub": "Delhi", "status": "Delayed"}
    ]
    response = client.post("/api/ingest/bulk", json=payload, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["submitted"] == 2
    assert "kf_state" in data
