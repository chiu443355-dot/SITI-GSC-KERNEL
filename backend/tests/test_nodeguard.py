"""NodeGuard GSC Backend Tests - MIMI Kernel API"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestKernelState:
    """GET /api/kernel/state tests"""

    def test_kernel_state_ok(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        assert r.status_code == 200

    def test_kernel_state_has_rho(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        d = r.json()
        assert "rho" in d
        assert isinstance(d["rho"], float)
        assert 0.0 <= d["rho"] <= 1.0

    def test_kernel_state_has_phi(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        d = r.json()
        assert "phi" in d
        assert isinstance(d["phi"], float)

    def test_kernel_state_has_catastrophe(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        d = r.json()
        assert "catastrophe" in d
        assert isinstance(d["catastrophe"], bool)

    def test_kernel_state_has_kalman(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        d = r.json()
        assert "kalman" in d
        k = d["kalman"]
        assert "x_hat" in k
        assert "rho_t1" in k
        assert "K" in k
        assert "P" in k

    def test_kernel_state_has_inverse_reliability(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        d = r.json()
        assert "inverse_reliability" in d
        ir = d["inverse_reliability"]
        assert "failure_count" in ir
        assert "leakage_total" in ir

    def test_kernel_state_catastrophe_when_rho_high(self):
        """Dataset has rho ~0.82 so catastrophe should be True"""
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        d = r.json()
        # rho is ~0.82, catastrophe should be True
        if d["rho"] > 0.80:
            assert d["catastrophe"] is True

    def test_kernel_state_n_total(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        d = r.json()
        assert "n_total" in d
        assert d["n_total"] > 0

    def test_kernel_state_warehouse_metrics(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        d = r.json()
        assert "warehouse_metrics" in d
        assert len(d["warehouse_metrics"]) > 0

    def test_kernel_state_mode_metrics(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        d = r.json()
        assert "mode_metrics" in d
        assert len(d["mode_metrics"]) > 0


class TestKernelTick:
    """POST /api/kernel/tick tests"""

    def test_tick_ok(self):
        r = requests.post(f"{BASE_URL}/api/kernel/tick")
        assert r.status_code == 200

    def test_tick_has_diverted(self):
        r = requests.post(f"{BASE_URL}/api/kernel/tick")
        d = r.json()
        assert "diverted" in d
        assert isinstance(d["diverted"], int)
        assert d["diverted"] > 0

    def test_tick_has_revenue_saved(self):
        r = requests.post(f"{BASE_URL}/api/kernel/tick")
        d = r.json()
        assert "revenue_saved" in d
        assert d["revenue_saved"] >= 0

    def test_tick_has_refresh_count(self):
        r = requests.post(f"{BASE_URL}/api/kernel/tick")
        d = r.json()
        assert "refresh_count" in d
        assert d["refresh_count"] > 0

    def test_tick_increments_refresh_count(self):
        r1 = requests.post(f"{BASE_URL}/api/kernel/tick")
        c1 = r1.json()["refresh_count"]
        r2 = requests.post(f"{BASE_URL}/api/kernel/tick")
        c2 = r2.json()["refresh_count"]
        assert c2 == c1 + 1


class TestKernelUpload:
    """POST /api/kernel/upload CSV upload tests"""

    def test_upload_valid_csv(self):
        csv_content = b"ID,Warehouse_block,Mode_of_Shipment,Customer_care_calls,Customer_rating,Cost_of_the_Product,Prior_purchases,Product_importance,Gender,Discount_offered,Weight_in_gms,Reached.on.Time_Y.N\n"
        for i in range(1, 51):
            reached = 0 if i % 5 == 0 else 1
            csv_content += f"{i},A,Ship,3,4,200,3,Medium,M,10,2000,{reached}\n".encode()
        
        r = requests.post(
            f"{BASE_URL}/api/kernel/upload",
            files={"file": ("test_data.csv", csv_content, "text/csv")}
        )
        assert r.status_code == 200
        d = r.json()
        assert d["success"] is True
        assert "n_total" in d
        assert d["n_total"] == 50

    def test_upload_invalid_csv(self):
        r = requests.post(
            f"{BASE_URL}/api/kernel/upload",
            files={"file": ("bad.csv", b"col1,col2\n1,2\n3,4\n", "text/csv")}
        )
        assert r.status_code == 400
