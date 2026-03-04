"""SITI Intelligence Backend Tests — Iteration 2
   Tests: kernel state, tick, upload, stream-batch, fuzzy mapping, response data integrity
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestKernelState:
    """GET /api/kernel/state — state data integrity"""

    def test_kernel_state_ok(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        assert r.status_code == 200

    def test_kernel_state_rho_range(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        d = r.json()
        assert "rho" in d
        assert isinstance(d["rho"], float)
        assert 0.0 <= d["rho"] <= 1.0

    def test_kernel_state_phi(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        d = r.json()
        assert "phi" in d
        assert 0.0 <= d["phi"] <= 1.0

    def test_kernel_state_catastrophe_flag(self):
        """rho ~0.82 → catastrophe must be True"""
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        d = r.json()
        assert "catastrophe" in d
        assert isinstance(d["catastrophe"], bool)
        if d["rho"] > 0.80:
            assert d["catastrophe"] is True, f"Expected catastrophe=True for rho={d['rho']}"

    def test_kernel_state_collapse_flag(self):
        """rho ~0.82 → collapse must be False (< 0.85)"""
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        d = r.json()
        assert "collapse" in d
        assert isinstance(d["collapse"], bool)
        if d["rho"] < 0.85:
            assert d["collapse"] is False, f"Expected collapse=False for rho={d['rho']}"

    def test_kernel_state_kalman_fields(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        d = r.json()
        k = d.get("kalman", {})
        for field in ["x_hat", "rho_t1", "K", "P"]:
            assert field in k, f"Missing kalman field: {field}"

    def test_kernel_state_n_total_positive(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        d = r.json()
        assert d.get("n_total", 0) > 0

    def test_kernel_state_average_delay(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        d = r.json()
        assert "average_delay" in d
        assert isinstance(d["average_delay"], list)
        assert len(d["average_delay"]) > 0
        # Each entry should have block, avg_delay, n_late, n_total
        entry = d["average_delay"][0]
        for field in ["block", "avg_delay", "n_late", "n_total"]:
            assert field in entry, f"Missing field in average_delay entry: {field}"

    def test_kernel_state_red_zone_importance(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        d = r.json()
        assert "red_zone_importance" in d
        assert isinstance(d["red_zone_importance"], list)

    def test_kernel_state_routing(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        d = r.json()
        assert "routing" in d
        routing = d["routing"]
        for field in ["overloaded_blocks", "available_blocks", "diversion_active", "epsilon", "threshold"]:
            assert field in routing, f"Missing routing field: {field}"

    def test_kernel_state_inverse_reliability(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        d = r.json()
        ir = d.get("inverse_reliability", {})
        for field in ["failure_count", "total_high", "failure_rate", "leakage_total", "records"]:
            assert field in ir, f"Missing ir field: {field}"
        assert isinstance(ir["records"], list)

    def test_kernel_state_rho_history(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        d = r.json()
        assert "rho_history" in d
        assert isinstance(d["rho_history"], list)


class TestKernelTick:
    """POST /api/kernel/tick"""

    def test_tick_ok(self):
        r = requests.post(f"{BASE_URL}/api/kernel/tick")
        assert r.status_code == 200

    def test_tick_increments(self):
        r1 = requests.post(f"{BASE_URL}/api/kernel/tick")
        c1 = r1.json()["refresh_count"]
        r2 = requests.post(f"{BASE_URL}/api/kernel/tick")
        c2 = r2.json()["refresh_count"]
        assert c2 == c1 + 1

    def test_tick_revenue_saved_positive(self):
        r = requests.post(f"{BASE_URL}/api/kernel/tick")
        d = r.json()
        assert d.get("revenue_saved", -1) >= 0
        assert d.get("total_diverted", -1) >= 0
        assert d.get("diverted", -1) > 0


class TestStreamBatch:
    """POST /api/kernel/stream-batch — NEW Live Telemetry endpoint"""

    def test_stream_batch_default_ok(self):
        """Default n=100 returns success"""
        r = requests.post(f"{BASE_URL}/api/kernel/stream-batch?n=100")
        assert r.status_code == 200

    def test_stream_batch_success_field(self):
        r = requests.post(f"{BASE_URL}/api/kernel/stream-batch?n=100")
        d = r.json()
        assert d.get("success") is True

    def test_stream_batch_new_n_total_increases(self):
        """n_total must increase by 100 after injecting 100 units"""
        # Get current n_total
        state = requests.get(f"{BASE_URL}/api/kernel/state").json()
        old_n = state["n_total"]

        r = requests.post(f"{BASE_URL}/api/kernel/stream-batch?n=100")
        d = r.json()

        assert d.get("new_n_total", 0) > old_n, \
            f"Expected new_n_total > {old_n}, got {d.get('new_n_total')}"
        assert d.get("injected") == 100

    def test_stream_batch_revenue_increments(self):
        """Revenue should increase after injecting units"""
        r1 = requests.post(f"{BASE_URL}/api/kernel/stream-batch?n=100")
        rev1 = r1.json()["revenue_saved"]
        r2 = requests.post(f"{BASE_URL}/api/kernel/stream-batch?n=100")
        rev2 = r2.json()["revenue_saved"]
        assert rev2 > rev1, f"Revenue should increase: {rev1} → {rev2}"

    def test_stream_batch_response_fields(self):
        r = requests.post(f"{BASE_URL}/api/kernel/stream-batch?n=100")
        d = r.json()
        for field in ["success", "injected", "new_n_total", "new_rho", "diverted", "total_diverted", "revenue_saved"]:
            assert field in d, f"Missing stream-batch field: {field}"

    def test_stream_batch_new_rho_valid(self):
        r = requests.post(f"{BASE_URL}/api/kernel/stream-batch?n=100")
        d = r.json()
        rho = d.get("new_rho", -1)
        assert 0.0 <= rho <= 1.0, f"new_rho out of range: {rho}"

    def test_stream_batch_custom_n(self):
        """Inject 50 units"""
        state = requests.get(f"{BASE_URL}/api/kernel/state").json()
        old_n = state["n_total"]
        r = requests.post(f"{BASE_URL}/api/kernel/stream-batch?n=50")
        d = r.json()
        assert d.get("success") is True
        assert d.get("injected") == 50
        assert d.get("new_n_total", 0) > old_n


class TestKernelUpload:
    """POST /api/kernel/upload — CSV with fuzzy column mapping"""

    def _make_csv(self, messy=False):
        """Build a minimal valid CSV. If messy=True, use fuzzy headers."""
        if messy:
            header = "shipment_id,wh_block,carrier_mode,cc_call,csat,cost,prior,prod_tier,sex,discount,weight,delivered\n"
        else:
            header = "ID,Warehouse_block,Mode_of_Shipment,Customer_care_calls,Customer_rating,Cost_of_the_Product,Prior_purchases,Product_importance,Gender,Discount_offered,Weight_in_gms,Reached.on.Time_Y.N\n"
        rows = ""
        for i in range(1, 51):
            reached = 0 if i % 5 == 0 else 1
            rows += f"{i},A,Ship,3,4,200,3,Medium,M,10,2000,{reached}\n"
        return (header + rows).encode()

    def test_upload_standard_csv(self):
        r = requests.post(
            f"{BASE_URL}/api/kernel/upload",
            files={"file": ("standard.csv", self._make_csv(messy=False), "text/csv")}
        )
        assert r.status_code == 200
        d = r.json()
        assert d["success"] is True
        assert d["n_total"] == 50

    def test_upload_fuzzy_columns(self):
        """Messy headers should be auto-mapped via _fuzzy_map_columns()"""
        csv = self._make_csv(messy=True)
        r = requests.post(
            f"{BASE_URL}/api/kernel/upload",
            files={"file": ("messy.csv", csv, "text/csv")}
        )
        # Should succeed with fuzzy mapping
        assert r.status_code == 200, f"Fuzzy upload failed: {r.text}"
        d = r.json()
        assert d["success"] is True
        assert d["n_total"] == 50

    def test_upload_resets_session(self):
        """After upload, diverted_units and revenue_saved should reset"""
        csv = self._make_csv()
        r = requests.post(
            f"{BASE_URL}/api/kernel/upload",
            files={"file": ("reset.csv", csv, "text/csv")}
        )
        assert r.status_code == 200
        # Fetch state — refresh_count should be 0 right after upload
        state = requests.get(f"{BASE_URL}/api/kernel/state").json()
        # n_total should match uploaded rows
        assert state["n_total"] == 50

    def test_upload_invalid_csv(self):
        """CSV without any recognizable on-time column returns 400"""
        r = requests.post(
            f"{BASE_URL}/api/kernel/upload",
            files={"file": ("bad.csv", b"col1,col2\n1,2\n3,4\n", "text/csv")}
        )
        assert r.status_code == 400

    def test_upload_missing_values_filled(self):
        """CSV with NaN numeric values — should not crash, means fill applied"""
        csv_content = (
            "ID,Warehouse_block,Mode_of_Shipment,Customer_care_calls,Customer_rating,"
            "Cost_of_the_Product,Prior_purchases,Product_importance,Gender,"
            "Discount_offered,Weight_in_gms,Reached.on.Time_Y.N\n"
        )
        for i in range(1, 21):
            # leave some numerics blank
            cc = "" if i % 3 == 0 else "4"
            cost = "" if i % 4 == 0 else "200"
            reached = 0 if i % 5 == 0 else 1
            csv_content += f"{i},B,Flight,{cc},3,{cost},2,Low,F,5,3000,{reached}\n"
        r = requests.post(
            f"{BASE_URL}/api/kernel/upload",
            files={"file": ("missing.csv", csv_content.encode(), "text/csv")}
        )
        assert r.status_code == 200
        d = r.json()
        assert d["success"] is True
