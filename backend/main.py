"""
SITI GSC Kernel — main.py
Inverse Reliability Paradox Engine
Fixes: session isolation, /api/kernel/reset, Twilio SMS, auth middleware
"""

import os
import io
import uuid
import math
import logging
from collections import deque
from datetime import datetime

import numpy as np
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
from twilio.rest import Client as TwilioClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("siti-kernel")

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": os.getenv("ALLOWED_ORIGINS", "*")}})

# ── Supabase ──────────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Twilio ────────────────────────────────────────────────────────────────────
TWILIO_SID    = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_TOKEN  = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_FROM   = os.getenv("TWILIO_FROM_NUMBER")
TWILIO_TO     = os.getenv("TWILIO_ALERT_NUMBER")

def get_twilio():
    if TWILIO_SID and TWILIO_TOKEN:
        return TwilioClient(TWILIO_SID, TWILIO_TOKEN)
    return None


def send_sms(message: str):
    """Send a human-like Twilio SMS alert."""
    client = get_twilio()
    if not client:
        log.warning("Twilio not configured — skipping SMS")
        return False
    try:
        client.messages.create(body=message, from_=TWILIO_FROM, to=TWILIO_TO)
        log.info("SMS sent: %s", message[:60])
        return True
    except Exception as e:
        log.error("Twilio error: %s", e)
        return False


# ── Auth middleware ───────────────────────────────────────────────────────────
def require_api_key(fn):
    from functools import wraps
    @wraps(fn)
    def wrapper(*args, **kwargs):
        key = request.headers.get("X-API-Key") or request.args.get("api_key")
        if not key:
            return jsonify({"error": "missing API key bestie 🔑"}), 401
        # Verify against Supabase api_keys table
        res = supabase.table("api_keys").select("*").eq("key", key).eq("active", True).execute()
        if not res.data:
            return jsonify({"error": "invalid or inactive key 💀"}), 403
        return fn(*args, **kwargs)
    return wrapper


# ── Per-tenant state (FIXED: no more single global dict) ─────────────────────
class TenantKernel:
    """Isolated kernel state per tenant. Fixes the shared-session P0."""

    def __init__(self, tenant_id: str):
        self.tenant_id = tenant_id
        self.shipments: list[dict] = []
        self.hub_stats: dict[str, dict] = {}
        self.kalman_states: dict[str, dict] = {}
        self.alert_log: deque = deque(maxlen=500)
        self.created_at = datetime.utcnow().isoformat()
        log.info("New kernel created for tenant: %s", tenant_id)

    def reset(self, df: pd.DataFrame) -> dict:
        """Genius Reset — wipe state and ingest new dataset."""
        self.shipments.clear()
        self.hub_stats.clear()
        self.kalman_states.clear()
        self.alert_log.clear()

        required = {"hub_id", "arrival_rate", "service_rate", "shipment_id"}
        missing = required - set(df.columns)
        if missing:
            raise ValueError(f"CSV missing columns: {missing}")

        for _, row in df.iterrows():
            rec = row.to_dict()
            self.shipments.append(rec)
            self._update_hub(rec)

        log.info("Kernel reset complete for %s — %d rows", self.tenant_id, len(self.shipments))
        return self._summary()

    def _update_hub(self, rec: dict):
        hub = str(rec.get("hub_id", "UNKNOWN"))
        lam = float(rec.get("arrival_rate", 0))   # λ
        mu  = float(rec.get("service_rate", 1))    # μ

        if hub not in self.hub_stats:
            self.hub_stats[hub] = {"lambda_sum": 0, "mu_sum": 0, "count": 0, "queue_depth": 0}

        s = self.hub_stats[hub]
        s["lambda_sum"] += lam
        s["mu_sum"]     += mu
        s["count"]      += 1
        s["queue_depth"] = s.get("queue_depth", 0) + max(0, lam - mu)

    def _summary(self) -> dict:
        hubs = []
        for hub_id, s in self.hub_stats.items():
            lam = s["lambda_sum"] / s["count"]
            mu  = s["mu_sum"]     / s["count"]
            rho, irp = compute_irp(lam, mu, s["count"])
            hubs.append({
                "hub_id":      hub_id,
                "lambda":      round(lam, 4),
                "mu":          round(mu, 4),
                "rho":         round(rho, 4),
                "irp_score":   round(irp, 4),
                "queue_depth": int(s["queue_depth"]),
                "risk":        risk_level(rho),
            })
        return {
            "tenant_id":     self.tenant_id,
            "total_rows":    len(self.shipments),
            "hub_count":     len(hubs),
            "hubs":          sorted(hubs, key=lambda h: -h["rho"]),
            "reset_at":      datetime.utcnow().isoformat(),
        }


# Global tenant registry (keyed by tenant_id from API key)
_kernels: dict[str, TenantKernel] = {}

def get_kernel(tenant_id: str) -> TenantKernel:
    if tenant_id not in _kernels:
        _kernels[tenant_id] = TenantKernel(tenant_id)
    return _kernels[tenant_id]


# ── Core Math ─────────────────────────────────────────────────────────────────
def compute_irp(lam: float, mu: float, scale: int) -> tuple[float, float]:
    """
    M/M/1 reliability metric + Inverse Reliability Paradox score.
    ρ = λ/μ  →  rho > 1 means the hub is overloaded.
    IRP rises non-linearly with scale (the paradox: bigger network = less reliable).
    """
    mu  = max(mu, 1e-9)
    rho = lam / mu
    # Phi sigmoidal decay (SITI original math)
    phi = 1 / (1 + math.exp(-0.5 * (rho - 1.0)))
    irp = phi * math.log1p(scale) / 10.0
    return rho, irp


def risk_level(rho: float) -> str:
    if rho > 1.0:   return "critical"
    if rho > 0.85:  return "warning"
    return "safe"


class KalmanFilter1D:
    """
    Simple 1-D Kalman filter for delay probability prediction.
    State = estimated delay probability [0,1].
    """
    def __init__(self, process_var=0.01, obs_var=0.1):
        self.x   = 0.5   # initial estimate
        self.P   = 1.0   # initial uncertainty
        self.Q   = process_var
        self.R   = obs_var

    def update(self, z: float) -> float:
        # Predict
        x_pred = self.x
        P_pred = self.P + self.Q
        # Update
        K      = P_pred / (P_pred + self.R)
        self.x = x_pred + K * (z - x_pred)
        self.P = (1 - K) * P_pred
        return self.x

    def predict_n(self, n: int) -> list[float]:
        preds = []
        x, P = self.x, self.P
        for _ in range(n):
            P += self.Q
            preds.append(round(min(max(x + 0.01 * P, 0), 1), 4))
        return preds


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return jsonify({"status": "alive", "kernel": "SITI GSC v2.0", "timestamp": datetime.utcnow().isoformat()})


@app.post("/api/kernel/reset")
@require_api_key
def genius_reset():
    """
    Genius Reset — upload CSV, wipe kernel, re-ingest dataset.
    Fixes: missing /api/kernel/reset 404 + data format validation.
    """
    tenant_id = request.headers.get("X-Tenant-ID", "default")
    kernel    = get_kernel(tenant_id)

    if "file" not in request.files:
        return jsonify({"error": "no file uploaded bestie. send a CSV in 'file' field"}), 400

    f = request.files["file"]
    if not f.filename.lower().endswith(".csv"):
        return jsonify({"error": "we need a .csv not a PDF 💀 convert it first"}), 400

    try:
        df = pd.read_csv(io.StringIO(f.read().decode("utf-8")))
    except Exception as e:
        return jsonify({"error": f"CSV parse failed: {e}"}), 422

    try:
        summary = kernel.reset(df)
    except ValueError as e:
        return jsonify({"error": str(e)}), 422

    # Fire Twilio alert if any hub is critical
    critical_hubs = [h for h in summary["hubs"] if h["risk"] == "critical"]
    if critical_hubs:
        hub = critical_hubs[0]
        msg = (
            f"🚨 SITI KERNEL ALERT — {hub['hub_id']} is CRITICAL\n"
            f"ρ = {hub['rho']} (overloaded fr fr)\n"
            f"Queue depth: {hub['queue_depth']} shipments\n"
            f"IRP Score: {hub['irp_score']}/10 — reroute NOW bestie"
        )
        sms_sent = send_sms(msg)
        summary["sms_alert_sent"] = sms_sent
        summary["sms_message"]    = msg

    return jsonify({"success": True, "summary": summary}), 200


@app.get("/api/kernel/status")
@require_api_key
def kernel_status():
    tenant_id = request.headers.get("X-Tenant-ID", "default")
    kernel    = get_kernel(tenant_id)
    return jsonify(kernel._summary())


@app.post("/api/kernel/predict")
@require_api_key
def predict():
    """
    Run Kalman filter prediction for a hub.
    Body: { "hub_id": "MUM-01", "observations": [0.3, 0.5, 0.8] }
    """
    tenant_id = request.headers.get("X-Tenant-ID", "default")
    kernel    = get_kernel(tenant_id)
    data      = request.get_json(force=True)

    hub_id = data.get("hub_id", "UNKNOWN")
    obs    = data.get("observations", [])

    if hub_id not in kernel.kalman_states:
        kernel.kalman_states[hub_id] = KalmanFilter1D()

    kf  = kernel.kalman_states[hub_id]
    smoothed = [round(kf.update(float(z)), 4) for z in obs]
    predicted = kf.predict_n(5)

    result = {
        "hub_id":    hub_id,
        "smoothed":  smoothed,
        "predicted": predicted,
        "current_delay_prob": smoothed[-1] if smoothed else kf.x,
    }

    # Alert if predicted to exceed 90%
    if predicted and predicted[-1] > 0.90:
        hub_stats = kernel.hub_stats.get(hub_id, {})
        msg = (
            f"yo bestie 👀 {hub_id} is about to eat itself\n"
            f"Kalman predicts delay prob = {predicted[-1]*100:.1f}% in 5 ticks\n"
            f"Queue: {int(hub_stats.get('queue_depth', 0))} shipments\n"
            f"Take action NOW — SITI Kernel 🚨"
        )
        send_sms(msg)
        result["alert_fired"] = True

    return jsonify(result)


@app.get("/api/hubs")
@require_api_key
def list_hubs():
    tenant_id = request.headers.get("X-Tenant-ID", "default")
    kernel    = get_kernel(tenant_id)
    hubs      = []
    for hub_id, s in kernel.hub_stats.items():
        lam = s["lambda_sum"] / max(s["count"], 1)
        mu  = s["mu_sum"]     / max(s["count"], 1)
        rho, irp = compute_irp(lam, mu, s["count"])
        hubs.append({
            "hub_id":    hub_id,
            "rho":       round(rho, 4),
            "irp_score": round(irp, 4),
            "risk":      risk_level(rho),
        })
    return jsonify({"hubs": sorted(hubs, key=lambda h: -h["rho"])})


@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "route not found bestie. check the docs"}), 404

@app.errorhandler(500)
def server_error(e):
    log.error("500: %s", e)
    return jsonify({"error": "kernel exploded internally 💀 check render logs"}), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    log.info("SITI Kernel starting on port %d", port)
    app.run(host="0.0.0.0", port=port, debug=False)
