"""
SITI Intelligence — Iteration 3 Backend Tests
Tests: Ghost Trigger (stream-batch n=50), regex sanitizer, schema mismatch,
       chart data endpoints, $2.81M exposure constant
"""
import pytest
import requests
import os
import io
import time

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


# ── Health check ──────────────────────────────────────────────────────────────

class TestHealth:
    """Basic health check"""

    def test_root(self):
        r = requests.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        data = r.json()
        assert "MIMI" in data.get("message", "")
        print(f"PASS: root → {data['message']}")

    def test_kernel_state_200(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        assert r.status_code == 200
        data = r.json()
        assert "rho" in data
        assert "n_total" in data
        print(f"PASS: kernel/state → rho={data['rho']}, n_total={data['n_total']}")


# ── Ghost Trigger: stream-batch n=50 ─────────────────────────────────────────

class TestGhostTriggerBatch:
    """Ghost Trigger uses n=50; normal stream uses n=100"""

    def test_stream_batch_n50_returns_success(self):
        """Ghost Trigger fires POST /api/kernel/stream-batch?n=50"""
        r = requests.post(f"{BASE_URL}/api/kernel/stream-batch?n=50")
        assert r.status_code == 200
        data = r.json()
        assert data.get("success") is True
        assert data.get("injected") == 50
        print(f"PASS: stream-batch n=50 → injected={data['injected']}, n_total={data['new_n_total']}")

    def test_stream_batch_n50_increments_n_total(self):
        """Each Ghost Trigger call must increment n_total by 50"""
        r1 = requests.get(f"{BASE_URL}/api/kernel/state")
        n_before = r1.json()["n_total"]

        requests.post(f"{BASE_URL}/api/kernel/stream-batch?n=50")

        r2 = requests.get(f"{BASE_URL}/api/kernel/state")
        n_after = r2.json()["n_total"]

        assert n_after == n_before + 50, f"Expected {n_before + 50}, got {n_after}"
        print(f"PASS: n_total {n_before} → {n_after} (+50)")

    def test_stream_batch_n100_returns_success(self):
        """Normal stream batch n=100 still works"""
        r = requests.post(f"{BASE_URL}/api/kernel/stream-batch?n=100")
        assert r.status_code == 200
        data = r.json()
        assert data.get("injected") == 100
        print(f"PASS: stream-batch n=100 → injected={data['injected']}")

    def test_stream_batch_response_has_revenue(self):
        """stream-batch response must include revenue_saved and total_diverted"""
        r = requests.post(f"{BASE_URL}/api/kernel/stream-batch?n=50")
        data = r.json()
        assert "revenue_saved" in data
        assert "total_diverted" in data
        assert isinstance(data["revenue_saved"], (int, float))
        print(f"PASS: revenue_saved={data['revenue_saved']}, total_diverted={data['total_diverted']}")


# ── Backend Regex Sanitizer: '100kg' → 100 ───────────────────────────────────

class TestRegexSanitizer:
    """Backend _sanitize_numeric() must strip units like 'kg', '$' from CSV values"""

    def _make_csv_with_messy_weight(self):
        """Returns CSV text with '100kg' as weight value"""
        csv = (
            "ID,Reached.on.Time_Y.N,Warehouse_block,Mode_of_Shipment,"
            "Customer_care_calls,Customer_rating,Cost_of_the_Product,"
            "Prior_purchases,Product_importance,Gender,Discount_offered,Weight_in_gms\n"
        )
        for i in range(1, 201):
            late = 1 if i % 5 != 0 else 0
            csv += (
                f"{i},{late},A,Ship,3,4,150,3,Medium,M,10,100kg\n"
            )
        return csv

    def test_upload_csv_with_100kg_succeeds(self):
        """CSV with '100kg' in Weight_in_gms must not error — regex sanitizer strips 'kg'"""
        csv_text = self._make_csv_with_messy_weight()
        files = {"file": ("test_weight.csv", io.BytesIO(csv_text.encode()), "text/csv")}
        r = requests.post(f"{BASE_URL}/api/kernel/upload", files=files)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}. Detail: {r.text}"
        data = r.json()
        assert data.get("success") is True
        print(f"PASS: upload with '100kg' → success=True, n_total={data['n_total']}")

    def test_upload_csv_with_dollar_cost_succeeds(self):
        """CSV with '$150' in Cost_of_the_Product must succeed — regex strips '$'"""
        csv = (
            "ID,Reached.on.Time_Y.N,Warehouse_block,Mode_of_Shipment,"
            "Customer_care_calls,Customer_rating,Cost_of_the_Product,"
            "Prior_purchases,Product_importance,Gender,Discount_offered,Weight_in_gms\n"
        )
        for i in range(1, 201):
            late = 1 if i % 5 != 0 else 0
            csv += f"{i},{late},A,Ship,3,4,$150,3,Medium,M,10,2000\n"
        files = {"file": ("test_cost.csv", io.BytesIO(csv.encode()), "text/csv")}
        r = requests.post(f"{BASE_URL}/api/kernel/upload", files=files)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}. Detail: {r.text}"
        data = r.json()
        assert data.get("success") is True
        print(f"PASS: upload with '$150' in cost → success=True")


# ── Schema Mismatch: SCHEMA_MISMATCH 400 with column name ────────────────────

class TestSchemaMismatch:
    """Upload CSV with all unknown columns → backend returns SCHEMA_MISMATCH with specific column info"""

    def _make_unknown_columns_csv(self):
        """CSV with completely unrecognizable column names"""
        csv = "alpha,bravo,charlie,delta,echo,foxtrot\n"
        for i in range(1, 51):
            csv += f"{i},X,Y,Z,W,V\n"
        return csv

    def test_upload_unknown_columns_returns_400(self):
        """Uploading CSV with unknown columns must return 400 SCHEMA_MISMATCH"""
        csv_text = self._make_unknown_columns_csv()
        files = {"file": ("unknown_cols.csv", io.BytesIO(csv_text.encode()), "text/csv")}
        r = requests.post(f"{BASE_URL}/api/kernel/upload", files=files)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        print(f"PASS: unknown CSV → 400 as expected")

    def test_upload_unknown_columns_detail_is_schema_mismatch(self):
        """Detail type must be SCHEMA_MISMATCH"""
        csv_text = self._make_unknown_columns_csv()
        files = {"file": ("unknown_cols.csv", io.BytesIO(csv_text.encode()), "text/csv")}
        r = requests.post(f"{BASE_URL}/api/kernel/upload", files=files)
        detail = r.json().get("detail", {})
        assert detail.get("type") == "SCHEMA_MISMATCH", f"Expected SCHEMA_MISMATCH, got: {detail.get('type')}"
        print(f"PASS: detail.type == SCHEMA_MISMATCH")

    def test_upload_schema_mismatch_includes_column_name(self):
        """SCHEMA_MISMATCH detail must include required_unmapped with 'Reached.on.Time_Y.N'"""
        csv_text = self._make_unknown_columns_csv()
        files = {"file": ("unknown_cols.csv", io.BytesIO(csv_text.encode()), "text/csv")}
        r = requests.post(f"{BASE_URL}/api/kernel/upload", files=files)
        detail = r.json().get("detail", {})
        assert "required_unmapped" in detail
        assert "Reached.on.Time_Y.N" in detail["required_unmapped"], \
            f"Expected 'Reached.on.Time_Y.N' in required_unmapped, got: {detail['required_unmapped']}"
        print(f"PASS: required_unmapped includes 'Reached.on.Time_Y.N'")

    def test_upload_schema_mismatch_includes_found_columns(self):
        """SCHEMA_MISMATCH detail must include found_columns list"""
        csv_text = self._make_unknown_columns_csv()
        files = {"file": ("unknown_cols.csv", io.BytesIO(csv_text.encode()), "text/csv")}
        r = requests.post(f"{BASE_URL}/api/kernel/upload", files=files)
        detail = r.json().get("detail", {})
        assert "found_columns" in detail
        found = detail["found_columns"]
        assert isinstance(found, list) and len(found) > 0
        print(f"PASS: found_columns={found}")


# ── Kernel State — $2.81M exposure always present ────────────────────────────

class TestExposureAndKernelState:
    """$2.81M annualized exposure must always be in state response"""

    def test_kernel_state_has_annualized_exposure(self):
        """kernel/state must return annualized_exposure = 2810000"""
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        assert "annualized_exposure" in data
        assert data["annualized_exposure"] == 2_810_000, \
            f"Expected 2810000, got {data.get('annualized_exposure')}"
        print(f"PASS: annualized_exposure={data['annualized_exposure']}")

    def test_kernel_state_has_rho_history(self):
        """rho_history must be a list for area chart"""
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        assert "rho_history" in data
        assert isinstance(data["rho_history"], list)
        print(f"PASS: rho_history length={len(data['rho_history'])}")

    def test_kernel_state_has_average_delay(self):
        """average_delay must be a list for bar chart"""
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        assert "average_delay" in data
        assert isinstance(data["average_delay"], list)
        assert len(data["average_delay"]) > 0
        print(f"PASS: average_delay has {len(data['average_delay'])} items")

    def test_kernel_state_has_red_zone_importance(self):
        """red_zone_importance must be a list for pie chart"""
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        assert "red_zone_importance" in data
        assert isinstance(data["red_zone_importance"], list)
        print(f"PASS: red_zone_importance={data['red_zone_importance']}")

    def test_kernel_state_catastrophe_at_rho_82(self):
        """rho~0.82 > 0.80 so catastrophe must be True"""
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        rho = data["rho"]
        if rho > 0.80:
            assert data["catastrophe"] is True
            print(f"PASS: rho={rho} > 0.80, catastrophe=True")
        else:
            print(f"INFO: rho={rho} not in catastrophe zone currently")

    def test_kernel_state_kalman_present(self):
        """kalman dict with rho_t1, x_hat, K, P must be present"""
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        assert "kalman" in data
        k = data["kalman"]
        assert "rho_t1" in k
        assert "x_hat" in k
        assert "K" in k
        assert "P" in k
        print(f"PASS: kalman rho_t1={k['rho_t1']}, K={k['K']}")


# ── Tick endpoint ──────────────────────────────────────────────────────────────

class TestTickEndpoint:
    """POST /api/kernel/tick returns revenue and diverted units"""

    def test_tick_returns_200(self):
        r = requests.post(f"{BASE_URL}/api/kernel/tick")
        assert r.status_code == 200
        data = r.json()
        assert "total_diverted" in data
        assert "revenue_saved" in data
        assert "refresh_count" in data
        print(f"PASS: tick → diverted={data['total_diverted']}, saved={data['revenue_saved']}")
