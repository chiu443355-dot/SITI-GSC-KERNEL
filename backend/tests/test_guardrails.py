import pytest
from fastapi.testclient import TestClient
from backend.server import app, _api_keys, _get_session, MIMIKernel, _generate_dataset

client = TestClient(app)

# Inject an API key for testing
_api_keys["test-key"] = {"role": "OPERATOR", "client": "test_client", "active": True}
headers = {"X-API-KEY": "test-key"}

@pytest.fixture(autouse=True)
def init_kernel():
    # Ensure the session has a kernel
    session = _get_session("test_client")
    session["mimi"] = MIMIKernel(_generate_dataset(n=100))

def test_upload_guardrail_ok():
    # Create CSV with 2 classes for LR
    csv_content = "ID,Warehouse_block,Mode_of_Shipment,Customer_care_calls,Customer_rating,Cost_of_the_Product,Prior_purchases,Product_importance,Gender,Discount_offered,Weight_in_gms,Reached.on.Time_Y.N\n"
    csv_content += "1,A,Ship,3,4,200,3,Medium,M,10,2000,0\n"
    csv_content += "2,A,Ship,3,4,200,3,Medium,M,10,2000,1\n"

    response = client.post(
        "/api/kernel/upload",
        files={"file": ("test.csv", csv_content.encode())},
        headers=headers
    )
    assert response.status_code == 200
    assert response.json()["success"] is True

def test_stream_batch_limit():
    response = client.post("/api/kernel/stream-batch?n=100", headers=headers)
    assert response.status_code == 200
    assert response.json()["success"] is True
