"""
SITI Intelligence — Iteration 4 Backend Tests
Tests: T+3 Kalman (A³), PVI fields, Commander Console, encoding resilience (ISO-8859-1),
       on_bad_lines skip, rho_history t3 field, commander_message/commander_level
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


# ── Health / Baseline ──────────────────────────────────────────────────────────

class TestBaseline:
    """Baseline health and state checks"""

    def test_root_alive(self):
        r = requests.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        print("PASS: / alive")

    def test_kernel_state_200(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        assert r.status_code == 200
        data = r.json()
        assert "rho" in data
        print(f"PASS: state rho={data['rho']}")


# ── T+3 Kalman State: A, A3, rho_t3, pvi inside kalman dict ──────────────────

class TestKalmanT3Fields:
    """kernel/state must return T+3 Kalman fields inside kalman sub-dict"""

    def test_kalman_has_rho_t3(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        k = data.get("kalman", {})
        assert "rho_t3" in k, f"rho_t3 missing from kalman dict. kalman keys: {list(k.keys())}"
        assert isinstance(k["rho_t3"], float), f"rho_t3 should be float, got {type(k['rho_t3'])}"
        assert 0.0 <= k["rho_t3"] <= 1.0, f"rho_t3 out of [0,1]: {k['rho_t3']}"
        print(f"PASS: kalman.rho_t3={k['rho_t3']}")

    def test_kalman_has_pvi(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        k = data.get("kalman", {})
        assert "pvi" in k, f"pvi missing from kalman dict. kalman keys: {list(k.keys())}"
        assert isinstance(k["pvi"], (int, float)), f"pvi should be numeric, got {type(k['pvi'])}"
        assert k["pvi"] >= 0, f"pvi must be non-negative: {k['pvi']}"
        print(f"PASS: kalman.pvi={k['pvi']}")

    def test_kalman_has_A(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        k = data.get("kalman", {})
        assert "A" in k, f"A missing from kalman dict. kalman keys: {list(k.keys())}"
        assert isinstance(k["A"], (int, float)), f"A should be numeric, got {type(k['A'])}"
        # A should be close to 1 for stable rho (clipped to [0.97, 1.06])
        print(f"PASS: kalman.A={k['A']}")

    def test_kalman_has_A3(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        k = data.get("kalman", {})
        assert "A3" in k, f"A3 missing from kalman dict. kalman keys: {list(k.keys())}"
        assert isinstance(k["A3"], (int, float)), f"A3 should be numeric, got {type(k['A3'])}"
        # A3 should be A^3 (roughly in range of A^3)
        print(f"PASS: kalman.A3={k['A3']}")

    def test_kalman_A3_equals_A_cubed(self):
        """A3 should equal A^3 within floating point precision"""
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        k = data.get("kalman", {})
        A = k.get("A", 0)
        A3 = k.get("A3", 0)
        expected_A3 = round(A ** 3, 4)
        assert abs(A3 - expected_A3) < 0.001, f"A3={A3} != A^3={expected_A3} (A={A})"
        print(f"PASS: kalman.A3={A3} ≈ A^3={expected_A3} (A={A})")


# ── PVI Root-Level Fields ─────────────────────────────────────────────────────

class TestPVIRootFields:
    """kernel/state must expose pvi and pvi_alert at root level"""

    def test_root_pvi_present(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        assert "pvi" in data, f"pvi missing at root level. keys: {list(data.keys())[:20]}"
        assert isinstance(data["pvi"], (int, float)), f"pvi should be numeric, got {type(data['pvi'])}"
        print(f"PASS: root pvi={data['pvi']}")

    def test_root_pvi_alert_present(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        assert "pvi_alert" in data, f"pvi_alert missing at root level"
        assert isinstance(data["pvi_alert"], bool), f"pvi_alert should be bool, got {type(data['pvi_alert'])}"
        print(f"PASS: root pvi_alert={data['pvi_alert']}")

    def test_pvi_alert_false_when_pvi_low(self):
        """With stable data (rho~0.82, no streaming), pvi should be low → alert=False"""
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        pvi = data["pvi"]
        pvi_alert = data["pvi_alert"]
        # pvi_alert is True iff pvi > 15.0
        expected_alert = pvi > 15.0
        assert pvi_alert == expected_alert, \
            f"pvi_alert mismatch: pvi={pvi}, pvi_alert={pvi_alert}, expected={expected_alert}"
        print(f"PASS: pvi={pvi}, pvi_alert={pvi_alert} (consistent)")

    def test_root_rho_t3_shortcut(self):
        """kernel/state must also expose rho_t3 at root level (shortcut for frontend)"""
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        assert "rho_t3" in data, "rho_t3 missing at root level"
        # Should equal kalman.rho_t3
        assert data["rho_t3"] == data["kalman"]["rho_t3"], \
            f"root rho_t3={data['rho_t3']} != kalman.rho_t3={data['kalman']['rho_t3']}"
        print(f"PASS: root rho_t3={data['rho_t3']} matches kalman.rho_t3")


# ── Commander's Message Console ───────────────────────────────────────────────

class TestCommanderMessage:
    """kernel/state must return commander_message and commander_level"""

    def test_commander_message_present(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        assert "commander_message" in data, \
            f"commander_message missing. keys: {list(data.keys())[:20]}"
        assert isinstance(data["commander_message"], str)
        assert len(data["commander_message"]) > 0
        print(f"PASS: commander_message='{data['commander_message'][:60]}...'")

    def test_commander_level_present(self):
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        assert "commander_level" in data, "commander_level missing from state"
        assert data["commander_level"] in ["stable", "critical", "efficiency"], \
            f"Unexpected commander_level: {data['commander_level']}"
        print(f"PASS: commander_level={data['commander_level']}")

    def test_commander_message_stable_when_rho_t3_moderate(self):
        """With rho~0.82, T+3 projection should be ~0.82 → stable commander message"""
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        rho_t3 = data["kalman"]["rho_t3"]
        level = data["commander_level"]
        # Check consistency: level must match rho_t3 thresholds
        if rho_t3 >= 0.85:
            expected_level = "critical"
        elif rho_t3 < 0.50:
            expected_level = "efficiency"
        else:
            expected_level = "stable"
        assert level == expected_level, \
            f"commander_level={level} doesn't match rho_t3={rho_t3}, expected={expected_level}"
        print(f"PASS: rho_t3={rho_t3} → commander_level={level} (consistent)")

    def test_stable_message_contains_optimal_flow(self):
        """When commander_level is 'stable', message should contain 'OPTIMAL FLOW'"""
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        level = data["commander_level"]
        msg = data["commander_message"]
        if level == "stable":
            assert "OPTIMAL FLOW" in msg, \
                f"Stable message should contain OPTIMAL FLOW, got: {msg}"
            print(f"PASS: stable message contains 'OPTIMAL FLOW'")
        else:
            print(f"INFO: commander_level={level}, skipping stable message check (rho_t3={data['kalman']['rho_t3']})")


# ── rho_history entries with t3 field ────────────────────────────────────────

class TestRhoHistoryT3:
    """Each rho_history entry must include t3 field alongside rho and t1"""

    def test_rho_history_has_t3_field(self):
        """After a state call, rho_history entries must have 'time', 'rho', 't1', 't3'"""
        # Make a fresh call to populate history
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        history = data.get("rho_history", [])
        assert len(history) > 0, "rho_history is empty"
        last = history[-1]
        assert "t3" in last, f"'t3' missing from rho_history entry. keys: {list(last.keys())}"
        assert isinstance(last["t3"], float), f"t3 should be float, got {type(last['t3'])}"
        print(f"PASS: rho_history entry has t3={last['t3']}")

    def test_rho_history_has_t1_field(self):
        """rho_history entries must also still have t1"""
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        history = data.get("rho_history", [])
        assert len(history) > 0
        last = history[-1]
        assert "t1" in last, f"'t1' missing from rho_history entry. keys: {list(last.keys())}"
        print(f"PASS: rho_history entry has t1={last['t1']}")

    def test_rho_history_entry_has_all_fields(self):
        """Full schema check: time, rho, t1, t3 all present"""
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        history = data.get("rho_history", [])
        assert len(history) > 0
        for entry in history[-3:]:  # Check last 3
            assert "time" in entry, f"'time' missing: {entry}"
            assert "rho"  in entry, f"'rho' missing: {entry}"
            assert "t1"   in entry, f"'t1' missing: {entry}"
            assert "t3"   in entry, f"'t3' missing: {entry}"
        print(f"PASS: last 3 rho_history entries all have time/rho/t1/t3")


# ── ISO-8859-1 Encoding Resilience ───────────────────────────────────────────

class TestEncodingResilience:
    """_parse_csv_resilient() must handle ISO-8859-1 files without crashing"""

    def _make_standard_csv_rows(self, n=200):
        """Returns the standard part of CSV rows for testing"""
        rows = []
        for i in range(1, n + 1):
            late = 1 if i % 5 != 0 else 0
            rows.append(f"{i},{late},A,Ship,3,4,150,3,Medium,M,10,2000")
        return rows

    def test_iso8859_file_with_0xe2_byte_succeeds(self):
        """
        CSV with ISO-8859-1 byte 0xe2 (â€™ territory) must not crash with UnicodeDecodeError.
        Backend UTF-8 decode will hit replacement char \\uFFFD → fallback to ISO-8859-1.
        """
        # Build a valid CSV in UTF-8 first
        header = "ID,Reached.on.Time_Y.N,Warehouse_block,Mode_of_Shipment,Customer_care_calls,Customer_rating,Cost_of_the_Product,Prior_purchases,Product_importance,Gender,Discount_offered,Weight_in_gms\n"
        rows_text = "\n".join(self._make_standard_csv_rows(200)) + "\n"
        csv_utf8 = header + rows_text
        # Inject ISO-8859-1 byte 0xe2 into the text (simulating a smart-quote escape)
        # We add it as a stray byte in one comment-like cell that will be stripped by regex
        csv_bytes = csv_utf8.encode("utf-8")
        # Insert 0xe2 byte at offset 50 (inside first data row — will be stripped by non-ASCII regex)
        # Replace a 'A' byte in row 1 with 0xe2 to create an invalid UTF-8 sequence
        # Actually, to properly test, we build an ISO-8859-1 encoded file with a genuine 0xe2 byte
        iso_csv = header.encode("iso-8859-1") + rows_text.replace("A,Ship", "\xe2,Ship").encode("iso-8859-1")
        files = {"file": ("test_iso.csv", io.BytesIO(iso_csv), "text/csv")}
        r = requests.post(f"{BASE_URL}/api/kernel/upload", files=files)
        # Should succeed (200) or at worst return SCHEMA_MISMATCH if column mapping fails
        # The critical test is: NOT a 500 / UnicodeDecodeError
        assert r.status_code != 500, f"Expected non-500, got 500. Detail: {r.text[:200]}"
        assert "UnicodeDecodeError" not in r.text, f"UnicodeDecodeError in response: {r.text[:200]}"
        print(f"PASS: ISO-8859-1 file with 0xe2 → status={r.status_code} (no crash)")

    def test_utf8_file_with_smart_quote_succeeds(self):
        """
        CSV file with UTF-8 encoded smart quotes (\\xe2\\x80\\x99) must succeed.
        Backend strips non-ASCII via regex after encoding detection.
        """
        header = "ID,Reached.on.Time_Y.N,Warehouse_block,Mode_of_Shipment,Customer_care_calls,Customer_rating,Cost_of_the_Product,Prior_purchases,Product_importance,Gender,Discount_offered,Weight_in_gms\n"
        rows = self._make_standard_csv_rows(200)
        # Inject a UTF-8 smart apostrophe (U+2019 = '\xe2\x80\x99') into Warehouse_block cell
        rows[5] = rows[5].replace(",A,", ",A\u2019s,")  # "A's" as unicode
        csv_text = header + "\n".join(rows) + "\n"
        files = {"file": ("test_smart_quote.csv", io.BytesIO(csv_text.encode("utf-8")), "text/csv")}
        r = requests.post(f"{BASE_URL}/api/kernel/upload", files=files)
        assert r.status_code != 500, f"Got 500 on smart quote file: {r.text[:200]}"
        print(f"PASS: Smart quote in CSV → status={r.status_code}")

    def test_csv_with_corrupt_rows_succeeds(self):
        """
        CSV with some rows having wrong number of columns → on_bad_lines='skip' should skip them,
        backend succeeds with the remaining rows.
        """
        header = "ID,Reached.on.Time_Y.N,Warehouse_block,Mode_of_Shipment,Customer_care_calls,Customer_rating,Cost_of_the_Product,Prior_purchases,Product_importance,Gender,Discount_offered,Weight_in_gms\n"
        rows = []
        for i in range(1, 301):
            late = 1 if i % 5 != 0 else 0
            if i % 10 == 0:
                # Corrupt row: too many columns
                rows.append(f"{i},{late},A,Ship,3,4,150,3,Medium,M,10,2000,EXTRA_COL,ANOTHER_EXTRA")
            else:
                rows.append(f"{i},{late},A,Ship,3,4,150,3,Medium,M,10,2000")
        csv_text = header + "\n".join(rows) + "\n"
        files = {"file": ("test_corrupt_rows.csv", io.BytesIO(csv_text.encode()), "text/csv")}
        r = requests.post(f"{BASE_URL}/api/kernel/upload", files=files)
        assert r.status_code == 200, f"Expected 200 with corrupt rows skipped, got {r.status_code}. Detail: {r.text[:200]}"
        data = r.json()
        assert data.get("success") is True
        print(f"PASS: CSV with corrupt rows → success=True, n_total={data.get('n_total')}")


# ── PVI Alert triggering via stream ──────────────────────────────────────────

class TestPVIAlertMechanism:
    """PVI = |z - rho_t3| * 100 — should be consistent between state calls"""

    def test_pvi_consistent_with_kalman(self):
        """pvi at root should be same as kalman.pvi"""
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        root_pvi = data.get("pvi")
        kalman_pvi = data.get("kalman", {}).get("pvi")
        assert root_pvi == kalman_pvi, \
            f"root pvi={root_pvi} != kalman.pvi={kalman_pvi}"
        print(f"PASS: root pvi={root_pvi} == kalman.pvi={kalman_pvi}")

    def test_pvi_alert_threshold_is_15(self):
        """pvi_alert should be True iff pvi > 15.0"""
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        pvi = data["pvi"]
        pvi_alert = data["pvi_alert"]
        # Test the threshold logic
        if pvi > 15.0:
            assert pvi_alert is True, f"pvi={pvi}>15 but pvi_alert=False"
        else:
            assert pvi_alert is False, f"pvi={pvi}<=15 but pvi_alert=True"
        print(f"PASS: pvi={pvi}, pvi_alert={pvi_alert} — threshold=15% correct")


# ── Kalman state with multiple ticks ─────────────────────────────────────────

class TestKalmanMultipleCycles:
    """After several state calls (Kalman updates), A should stabilize"""

    def test_kalman_A_in_valid_range(self):
        """A must be clipped to [0.97, 1.06] per server code"""
        # Call state multiple times to build rho_trend
        for _ in range(5):
            requests.get(f"{BASE_URL}/api/kernel/state")
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        A = data["kalman"]["A"]
        # After enough ticks, A should be computed from trend (not default 1.0 trivially)
        assert 0.97 <= A <= 1.06, f"A={A} out of [0.97, 1.06] — check clipping in kalman_step"
        print(f"PASS: kalman.A={A} in valid range [0.97, 1.06]")

    def test_rho_t3_is_clipped_0_1(self):
        """rho_t3 must be in [0,1]"""
        r = requests.get(f"{BASE_URL}/api/kernel/state")
        data = r.json()
        rho_t3 = data["kalman"]["rho_t3"]
        assert 0.0 <= rho_t3 <= 1.0, f"rho_t3={rho_t3} out of [0,1]"
        print(f"PASS: rho_t3={rho_t3} in [0,1]")
