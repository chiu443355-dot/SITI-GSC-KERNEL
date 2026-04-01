import pytest
from fastapi.testclient import TestClient
from backend.server import app, _api_keys, _get_session, MIMIKernel, _generate_dataset
import backend.server as server

client = TestClient(app)
_api_keys["test-key"] = {"role": "OPERATOR", "client": "test_client", "active": True}
headers = {"X-API-KEY": "test-key"}

def test_stream_batch_limit_trigger():
    # Set MAX_TOTAL_ROWS very low for this test
    original_max = server.MAX_TOTAL_ROWS
    server.MAX_TOTAL_ROWS = 100

    # Init kernel with 90 rows
    session = _get_session("test_client")
    session["mimi"] = MIMIKernel(_generate_dataset(n=90))

    try:
        # Trying to add 20 rows (total 110) should fail
        response = client.post("/api/kernel/stream-batch?n=20", headers=headers)
        assert response.status_code == 413
        assert "Total dataset size would exceed" in response.json()["detail"]
    finally:
        server.MAX_TOTAL_ROWS = original_max

def test_upload_guardrail_trigger():
    original_max = server.MAX_TOTAL_ROWS
    server.MAX_TOTAL_ROWS = 5

    csv_content = "ID,Warehouse_block,Mode_of_Shipment,Customer_care_calls,Customer_rating,Cost_of_the_Product,Prior_purchases,Product_importance,Gender,Discount_offered,Weight_in_gms,Reached.on.Time_Y.N\n"
    for i in range(10):
        csv_content += f"{i},A,Ship,3,4,200,3,Medium,M,10,2000,{i%2}\n"

    try:
        response = client.post(
            "/api/kernel/upload",
            files={"file": ("test.csv", csv_content.encode())},
            headers=headers
        )
        assert response.status_code == 413
        assert "Dataset exceeds" in response.json()["detail"]
    finally:
        server.MAX_TOTAL_ROWS = original_max
