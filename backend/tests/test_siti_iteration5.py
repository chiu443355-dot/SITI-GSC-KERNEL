"""
SITI Intelligence - Iteration 5 Backend Tests
Testing the 4-pillar enterprise upgrade:
1. ρ = λ/μ (Arrival Rate / Service Capacity) with configurable μ
2. 2D Kalman state vector x=[ρ, ρ̇] with T+3 (135-min) forecast
3. Multi-hub cascade (Alpha, Beta, Gamma): auto-diversion when ρ > 0.85
4. Enterprise API: /api/v1/intercept and /api/v1/intercept/schema
"""

import pytest
import requests
import os
import math

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestKernelState:
    """Test GET /api/kernel/state returns correct 3-hub structure"""

    def test_kernel_state_returns_200(self):
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        assert response.status_code == 200
        print("✓ GET /api/kernel/state returns 200")

    def test_kernel_state_has_hubs_array(self):
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        assert "hubs" in data
        assert isinstance(data["hubs"], list)
        assert len(data["hubs"]) == 3
        print(f"✓ hubs array has 3 hubs: {[h['name'] for h in data['hubs']]}")

    def test_hub_alpha_exists(self):
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        hub_names = [h["name"] for h in data["hubs"]]
        assert "Alpha" in hub_names
        print("✓ Hub Alpha exists")

    def test_hub_beta_exists(self):
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        hub_names = [h["name"] for h in data["hubs"]]
        assert "Beta" in hub_names
        print("✓ Hub Beta exists")

    def test_hub_gamma_exists(self):
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        hub_names = [h["name"] for h in data["hubs"]]
        assert "Gamma" in hub_names
        print("✓ Hub Gamma exists")

    def test_hub_has_rho_field(self):
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        for hub in data["hubs"]:
            assert "rho" in hub
            assert isinstance(hub["rho"], (int, float))
        print("✓ All hubs have 'rho' field")

    def test_hub_has_lambda_rate_field(self):
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        for hub in data["hubs"]:
            assert "lambda_rate" in hub
            assert isinstance(hub["lambda_rate"], (int, float))
        print("✓ All hubs have 'lambda_rate' field")

    def test_hub_has_mu_field(self):
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        for hub in data["hubs"]:
            assert "mu" in hub
            assert isinstance(hub["mu"], (int, float))
        print("✓ All hubs have 'mu' field")

    def test_hub_has_effective_lambda_field(self):
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        for hub in data["hubs"]:
            assert "effective_lambda" in hub
            assert isinstance(hub["effective_lambda"], (int, float))
        print("✓ All hubs have 'effective_lambda' field")

    def test_hub_has_kalman_object(self):
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        for hub in data["hubs"]:
            assert "kalman" in hub
            assert isinstance(hub["kalman"], dict)
        print("✓ All hubs have 'kalman' object")

    def test_hub_kalman_has_rho_dot(self):
        """2D Kalman should have rho_dot (velocity) field"""
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        for hub in data["hubs"]:
            assert "rho_dot" in hub["kalman"]
            assert isinstance(hub["kalman"]["rho_dot"], (int, float))
        print("✓ All hubs have kalman.rho_dot (velocity) field")

    def test_hub_kalman_has_rho_t1_projection(self):
        """2D Kalman should have T+1 (45-min) projection"""
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        for hub in data["hubs"]:
            assert "rho_t1" in hub["kalman"]
        print("✓ All hubs have kalman.rho_t1 projection")

    def test_hub_kalman_has_rho_t3_projection(self):
        """2D Kalman should have T+3 (135-min) projection"""
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        for hub in data["hubs"]:
            assert "rho_t3" in hub["kalman"]
        print("✓ All hubs have kalman.rho_t3 projection")

    def test_hub_has_cascade_risk_field(self):
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        for hub in data["hubs"]:
            assert "cascade_risk" in hub
            assert isinstance(hub["cascade_risk"], bool)
        print("✓ All hubs have 'cascade_risk' boolean field")

    def test_hub_has_cascade_source_field(self):
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        for hub in data["hubs"]:
            assert "cascade_source" in hub
            assert isinstance(hub["cascade_source"], bool)
        print("✓ All hubs have 'cascade_source' boolean field")

    def test_hub_has_saturation_protocol_field(self):
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        for hub in data["hubs"]:
            assert "saturation_protocol" in hub
            assert isinstance(hub["saturation_protocol"], bool)
        print("✓ All hubs have 'saturation_protocol' boolean field")


class TestRhoCalculation:
    """Test that ρ = λ/μ (NOT N_late/N_total)"""

    def test_global_rho_calculation(self):
        """global_rho should be total_lambda / total_mu"""
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        total_lambda = data.get("total_lambda", 0)
        mu_per_hub = data.get("mu", 150)
        num_hubs = len(data.get("hubs", []))
        expected_rho = total_lambda / (mu_per_hub * num_hubs) if (mu_per_hub * num_hubs) > 0 else 0
        actual_rho = data.get("global_rho", 0)
        # Allow for noise in measurement
        assert abs(actual_rho - expected_rho) < 0.1, f"Expected ρ≈{expected_rho:.4f}, got {actual_rho:.4f}"
        print(f"✓ global_rho = {actual_rho:.4f} ≈ λ/μ = {total_lambda:.1f}/{mu_per_hub * num_hubs}")

    def test_per_hub_rho_is_lambda_over_mu(self):
        """Each hub's rho should be effective_lambda / mu"""
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        for hub in data["hubs"]:
            eff_lambda = hub.get("effective_lambda", 0)
            mu = hub.get("mu", 150)
            expected_rho = eff_lambda / mu if mu > 0 else 0
            actual_rho = hub.get("rho_exact", hub.get("rho", 0))
            # Allow for noise
            assert abs(actual_rho - expected_rho) < 0.1, f"{hub['name']}: Expected ρ≈{expected_rho:.4f}, got {actual_rho:.4f}"
        print("✓ Per-hub ρ = λ/μ verified for all hubs")


class TestSetMu:
    """Test POST /api/kernel/set-mu endpoint"""

    def test_set_mu_returns_200(self):
        response = requests.post(f"{BASE_URL}/api/kernel/set-mu", json={"mu": 150})
        assert response.status_code == 200
        print("✓ POST /api/kernel/set-mu returns 200")

    def test_set_mu_updates_global_rho(self):
        # Set mu to 200
        response = requests.post(f"{BASE_URL}/api/kernel/set-mu", json={"mu": 200})
        assert response.status_code == 200
        data = response.json()
        assert "new_global_rho" in data
        assert isinstance(data["new_global_rho"], (int, float))
        print(f"✓ set-mu returns new_global_rho: {data['new_global_rho']}")

        # Reset mu to default
        requests.post(f"{BASE_URL}/api/kernel/set-mu", json={"mu": 150})

    def test_set_mu_updates_all_hubs(self):
        # Set mu to 175
        requests.post(f"{BASE_URL}/api/kernel/set-mu", json={"mu": 175})
        
        # Verify hubs have updated mu
        state = requests.get(f"{BASE_URL}/api/kernel/state").json()
        for hub in state["hubs"]:
            assert hub["mu"] == 175, f"Hub {hub['name']} mu should be 175"
        print("✓ set-mu updates mu for all hubs")

        # Reset
        requests.post(f"{BASE_URL}/api/kernel/set-mu", json={"mu": 150})

    def test_set_mu_validates_range(self):
        """mu must be between 10 and 1000"""
        response = requests.post(f"{BASE_URL}/api/kernel/set-mu", json={"mu": 5})
        assert response.status_code == 400
        print("✓ set-mu rejects mu < 10")


class Test2DKalman:
    """Test 2D Kalman filter with state vector x=[ρ, ρ̇]"""

    def test_kalman_has_x_hat(self):
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        kalman = data.get("kalman", {})
        assert "x_hat" in kalman
        print(f"✓ Root kalman has x_hat: {kalman.get('x_hat')}")

    def test_kalman_has_rho_dot(self):
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        kalman = data.get("kalman", {})
        assert "rho_dot" in kalman
        print(f"✓ Root kalman has rho_dot: {kalman.get('rho_dot')}")

    def test_kalman_has_rho_t1(self):
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        kalman = data.get("kalman", {})
        assert "rho_t1" in kalman
        print(f"✓ Root kalman has rho_t1: {kalman.get('rho_t1')}")

    def test_kalman_has_rho_t3(self):
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        kalman = data.get("kalman", {})
        assert "rho_t3" in kalman
        print(f"✓ Root kalman has rho_t3: {kalman.get('rho_t3')}")

    def test_t3_is_135_min_projection(self):
        """T+3 should be ρ + 3*dt*ρ_dot"""
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        kalman = data.get("kalman", {})
        x_hat = kalman.get("x_hat", 0)
        rho_dot = kalman.get("rho_dot", 0)
        rho_t3 = kalman.get("rho_t3", 0)
        # T+3 = ρ + 3*1.0*ρ̇ (clamped to [0, 1.5])
        expected = max(0, min(1.5, x_hat + 3.0 * rho_dot))
        # Allow margin for saturation strain adjustment
        assert abs(rho_t3 - expected) < 0.1, f"T+3 projection mismatch: {rho_t3} vs expected {expected}"
        print(f"✓ T+3 = {rho_t3:.4f} ≈ x_hat + 3*rho_dot = {expected:.4f}")


class TestCascade:
    """Test multi-hub cascade diversion when ρ > 0.85"""

    def test_cascade_events_array_exists(self):
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        assert "cascade_events" in data
        assert isinstance(data["cascade_events"], list)
        print(f"✓ cascade_events array exists ({len(data['cascade_events'])} events)")

    def test_alpha_triggers_cascade_when_saturated(self):
        """Alpha starts with λ≈138, μ=150, ρ≈0.92 → should trigger diversion"""
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        
        alpha = next((h for h in data["hubs"] if h["name"] == "Alpha"), None)
        assert alpha is not None
        
        # Alpha should have ρ > 0.85 triggering cascade
        if alpha["rho"] > 0.85:
            assert alpha["cascade_source"] == True, "Alpha should be cascade source when ρ > 0.85"
            # There should be cascade events
            assert len(data["cascade_events"]) > 0, "Should have cascade events when Alpha is saturated"
            print(f"✓ Alpha ρ={alpha['rho']:.4f} > 0.85 → cascade_source=True, {len(data['cascade_events'])} events")
        else:
            print(f"⚠ Alpha ρ={alpha['rho']:.4f} < 0.85 (may have diverted already)")

    def test_cascade_event_structure(self):
        """Cascade events should have from_hub, to_hub, excess_lambda"""
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        
        if data["cascade_events"]:
            event = data["cascade_events"][0]
            assert "from_hub" in event
            assert "to_hub" in event
            assert "excess_lambda" in event
            print(f"✓ Cascade event structure: {event['from_hub']} → {event['to_hub']}, excess={event['excess_lambda']:.2f}")
        else:
            print("⚠ No cascade events (network may be stable)")

    def test_cascade_receiver_marked(self):
        """Hub receiving cascade should have cascade_risk=True"""
        response = requests.get(f"{BASE_URL}/api/kernel/state")
        data = response.json()
        
        if data["cascade_events"]:
            receiver_hub = data["cascade_events"][0]["to_hub"]
            receiver = next((h for h in data["hubs"] if h["name"] == receiver_hub), None)
            assert receiver is not None
            assert receiver["cascade_risk"] == True
            print(f"✓ Receiver hub {receiver_hub} has cascade_risk=True")
        else:
            print("⚠ No cascade events to test receiver")


class TestStreamBatch:
    """Test POST /api/kernel/stream-batch"""

    def test_stream_batch_returns_200(self):
        response = requests.post(f"{BASE_URL}/api/kernel/stream-batch?n=10")
        assert response.status_code == 200
        print("✓ POST /api/kernel/stream-batch returns 200")

    def test_stream_batch_updates_lambdas(self):
        # Get initial state
        before = requests.get(f"{BASE_URL}/api/kernel/state").json()
        n_before = before.get("n_total", 0)
        
        # Stream 50 units
        response = requests.post(f"{BASE_URL}/api/kernel/stream-batch?n=50")
        data = response.json()
        
        assert data.get("success") == True
        assert data.get("injected") == 50
        assert data.get("new_n_total") == n_before + 50
        print(f"✓ stream-batch injected 50 units, new_n_total={data['new_n_total']}")


class TestInterceptEndpoint:
    """Test POST /api/v1/intercept enterprise API"""

    def test_intercept_returns_200(self):
        response = requests.post(f"{BASE_URL}/api/v1/intercept", json={})
        assert response.status_code == 200
        print("✓ POST /api/v1/intercept returns 200")

    def test_intercept_has_status(self):
        response = requests.post(f"{BASE_URL}/api/v1/intercept", json={})
        data = response.json()
        assert "status" in data
        assert data["status"] in ["nominal", "critical", "collapse"]
        print(f"✓ /api/v1/intercept status: {data['status']}")

    def test_intercept_has_network_object(self):
        response = requests.post(f"{BASE_URL}/api/v1/intercept", json={})
        data = response.json()
        assert "network" in data
        network = data["network"]
        assert "global_rho" in network
        assert "hubs" in network
        assert "cascade_events" in network
        print(f"✓ /api/v1/intercept has network object with {len(network['hubs'])} hubs")

    def test_intercept_has_recommended_action(self):
        response = requests.post(f"{BASE_URL}/api/v1/intercept", json={})
        data = response.json()
        assert "recommended_action" in data
        assert data["recommended_action"] in ["NOMINAL", "MONITOR", "DIVERT"]
        print(f"✓ /api/v1/intercept recommended_action: {data['recommended_action']}")


class TestInterceptSchema:
    """Test GET /api/v1/intercept/schema API docs"""

    def test_intercept_schema_returns_200(self):
        response = requests.get(f"{BASE_URL}/api/v1/intercept/schema")
        assert response.status_code == 200
        print("✓ GET /api/v1/intercept/schema returns 200")

    def test_intercept_schema_has_endpoint(self):
        response = requests.get(f"{BASE_URL}/api/v1/intercept/schema")
        data = response.json()
        assert "endpoint" in data
        assert data["endpoint"] == "/api/v1/intercept"
        print("✓ Schema has endpoint: /api/v1/intercept")

    def test_intercept_schema_has_request_schema(self):
        response = requests.get(f"{BASE_URL}/api/v1/intercept/schema")
        data = response.json()
        assert "request_schema" in data
        print("✓ Schema has request_schema")

    def test_intercept_schema_has_response_schema(self):
        response = requests.get(f"{BASE_URL}/api/v1/intercept/schema")
        data = response.json()
        assert "response_schema" in data
        print("✓ Schema has response_schema")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
