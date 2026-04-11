import pytest
import hashlib
from fastapi.testclient import TestClient
from backend.server import app, _api_keys, _get_session, MIMIKernel, _generate_dataset

client = TestClient(app)

@pytest.fixture(autouse=True)
def init_kernel():
    session = _get_session("test_client")
    if session["mimi"] is None:
        session["mimi"] = MIMIKernel(_generate_dataset(n=100))
    session_default = _get_session("SITI_ADMIN_001")
    if session_default["mimi"] is None:
        session_default["mimi"] = MIMIKernel(_generate_dataset(n=100))

def test_hash_based_auth():
    key = "siti-test-auth-key-123"
    key_hash = hashlib.sha256(key.encode()).hexdigest()
    _api_keys["masked..."] = {"role": "ADMIN", "client": "test_client", "active": True, "hash": key_hash}

    headers = {"X-API-KEY": key}
    response = client.get("/api/kernel/state", headers=headers)
    assert response.status_code == 200

def test_plaintext_leak_prevention():
    admin_key = "siti-admin-key-001"
    admin_hash = hashlib.sha256(admin_key.encode()).hexdigest()
    _api_keys[admin_key] = {"role": "ADMIN", "client": "SITI_ADMIN_001", "active": True, "hash": admin_hash}

    payload = {"client_name": "new_secure_client", "role": "OPERATOR"}
    response = client.post("/api/admin/create-key", json=payload, headers={"X-API-KEY": admin_key})

    assert response.status_code == 200
    data = response.json()
    new_key = data["api_key"]

    for k, v in _api_keys.items():
        # Check that the plaintext key is NOT a key in the dict
        assert k != new_key
        # Check that the plaintext key is NOT anywhere in the values
        assert new_key not in str(v)
