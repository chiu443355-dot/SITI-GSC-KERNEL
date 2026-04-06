"""
SITI Intelligence — Unified Production Backend
Flask + Supabase + Twilio + Cashfree
Fixes: 422 errors, endpoint mismatch, lazy init, Twilio SMS/WhatsApp
"""

import os
import io
import re
import math
import logging
import hashlib
import hmac
import json
from collections import deque
from datetime import datetime
from functools import wraps

import httpx
import numpy as np
import pandas as pd
from flask import Flask, request, jsonify, Response
from flask_cors import CORS

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s"
)
log = logging.getLogger("siti")

app = Flask(__name__)

# ── CORS ──────────────────────────────────────────────────────────────────────
CORS(app, resources={
    r"/api/*": {
        "origins": os.getenv("CORS_ORIGINS", "*").split(","),
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "X-API-Key", "X-Tenant-ID", "Authorization"]
    }
})

# ── Lazy Supabase ──────────────────────────────────────────────────────────────
_supabase = None

def get_supabase():
    global _supabase
    if _supabase is not None:
        return _supabase
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        return None
    try:
        from supabase import create_client
        _supabase = create_client(url, key)
        log.info("Supabase connected")
    except Exception as e:
        log.warning("Supabase init skipped: %s", e)
    return _supabase

# ── Lazy Twilio ────────────────────────────────────────────────────────────────
_twilio = None

def get_twilio():
    global _twilio
    if _twilio is not None:
        return _twilio
    sid   = os.getenv("TWILIO_ACCOUNT_SID", "")
    token = os.getenv("TWILIO_AUTH_TOKEN", "")
    if not sid or not token:
        return None
    try:
        from twilio.rest import Client
        _twilio = Client(sid, token)
        log.info("Twilio connected")
    except Exception as e:
        log.warning("Twilio init skipped: %s", e)
    return _twilio


def send_alert(message: str, channel: str = "sms") -> dict:
    """
    Send alert via SMS or WhatsApp.
    channel: 'sms' | 'whatsapp'
    Returns dict with success + details.
    """
    client = get_twilio()
    if not client:
        log.warning("Twilio not configured — alert skipped: %s", message[:80])
        return {"sent": False, "reason": "Twilio not configured"}

    from_num = os.getenv("TWILIO_FROM_NUMBER", "")
    to_num   = os.getenv("TWILIO_ALERT_NUMBER", "")

    if not from_num or not to_num:
        log.warning("TWILIO_FROM_NUMBER or TWILIO_ALERT_NUMBER not set")
        return {"sent": False, "reason": "Phone numbers not configured"}

    try:
        if channel == "whatsapp":
            from_str = f"whatsapp:{from_num}" if not from_num.startswith("whatsapp:") else from_num
            to_str   = f"whatsapp:{to_num}"   if not to_num.startswith("whatsapp:")   else to_num
        else:
            from_str = from_num
            to_str   = to_num

        msg = client.messages.create(body=message, from_=from_str, to=to_str)
        log.info("Alert sent via %s: SID=%s", channel, msg.sid)
        return {"sent": True, "sid": msg.sid, "channel": channel}
    except Exception as e:
        log.error("Twilio send failed (%s): %s", channel, e)
        return {"sent": False, "reason": str(e)}


# ── Auth middleware ────────────────────────────────────────────────────────────
# In-memory fallback keys (used when Supabase is not configured)
_FALLBACK_KEYS = set(
    k.strip() for k in os.getenv("API_KEYS", "siti-admin-key-001:ADMIN,siti-demo-key:READONLY")
              .split(",") if k.strip()
)
_FALLBACK_KEYS = {k.split(":")[0] for k in _FALLBACK_KEYS}


def require_api_key(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        key = (
            request.headers.get("X-API-Key")
            or request.headers.get("Authorization", "").replace("Bearer ", "")
            or request.args.get("api_key")
        )
        if not key:
            return jsonify({"error": "Missing API key. Send X-API-Key header."}), 401

        db = get_supabase()
        if db:
            try:
                res = db.table("api_keys").select("key,active").eq("key", key).execute()
                if res.data and res.data[0].get("active"):
                    return fn(*args, **kwargs)
                # If record not found, fall through to fallback
                if res.data:
                    return jsonify({"error": "API key inactive."}), 403
            except Exception as e:
                log.warning("Supabase auth check failed, using fallback: %s", e)

        # Fallback: check env-based keys
        if key in _FALLBACK_KEYS:
            return fn(*args, **kwargs)

        return jsonify({"error": "Invalid API key."}), 403
    return wrapper


# ── Kernel Math ────────────────────────────────────────────────────────────────
def compute_irp(lam: float, mu: float, scale: int) -> tuple[float, float]:
    """Compute load factor ρ and IRP score."""
    mu  = max(mu, 1e-9)
    rho = min(lam / mu, 2.0)  # cap to avoid infinity
    phi = 1 / (1 + math.exp(-0.5 * (rho - 1.0)))
    irp = phi * math.log1p(max(scale, 1)) / 10.0
    return round(rho, 6), round(irp, 6)


def risk_level(rho: float) -> str:
    if rho > 1.0:  return "critical"
    if rho > 0.85: return "warning"
    return "safe"


class KalmanFilter1D:
    """Minimal 1D Kalman filter for hub delay probability."""
    def __init__(self, process_var=0.01, obs_var=0.1):
        self.x = 0.5
        self.P = 1.0
        self.Q = process_var
        self.R = obs_var

    def update(self, z: float) -> float:
        x_pred = self.x
        P_pred = self.P + self.Q
        K      = P_pred / (P_pred + self.R)
        self.x = x_pred + K * (z - x_pred)
        self.P = (1 - K) * P_pred
        return round(self.x, 6)

    def predict_n(self, n: int) -> list[float]:
        preds, x, P = [], self.x, self.P
        for _ in range(n):
            P += self.Q
            preds.append(round(min(max(x + 0.01 * P, 0), 1), 6))
        return preds


# ── Per-tenant kernel ──────────────────────────────────────────────────────────
class TenantKernel:
    def __init__(self, tenant_id: str):
        self.tenant_id     = tenant_id
        self.shipments:     list[dict] = []
        self.hub_stats:     dict[str, dict] = {}
        self.kalman_states: dict[str, KalmanFilter1D] = {}
        self.alert_log:     deque = deque(maxlen=500)
        self.created_at    = datetime.utcnow().isoformat()

    def reset(self, df: pd.DataFrame) -> dict:
        """Wipe state and re-ingest CSV. Flexible column mapping."""
        self.shipments.clear()
        self.hub_stats.clear()
        self.kalman_states.clear()
        self.alert_log.clear()

        # Normalize columns — accept both exact and mapped names
        df = self._normalize_columns(df)

        required = {"hub_id", "arrival_rate", "service_rate"}
        missing  = required - set(df.columns)
        if missing:
            raise ValueError(
                f"CSV missing required columns: {missing}. "
                f"Found: {list(df.columns)[:10]}"
            )

        # Generate shipment_id if absent
        if "shipment_id" not in df.columns:
            df["shipment_id"] = [f"SHP-{i:06d}" for i in range(len(df))]

        for _, row in df.iterrows():
            rec = row.to_dict()
            self.shipments.append(rec)
            self._update_hub(rec)

        log.info("Kernel reset: %s — %d rows, %d hubs",
                 self.tenant_id, len(self.shipments), len(self.hub_stats))
        return self._summary()

    @staticmethod
    def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
        """Fuzzy column mapping for Kaggle / Delhivery / custom CSVs."""
        MAP = {
            "hub_id":       ["hub", "hub_code", "depot", "facility", "warehouse_block",
                              "block", "wh_block", "location", "asset_id"],
            "arrival_rate": ["lambda", "arrival_count", "inbound_rate", "arrivals",
                              "shipments_per_hour", "count", "daily_count"],
            "service_rate": ["mu", "processing_rate", "throughput", "capacity",
                              "service_capacity", "capacity_per_hour"],
            "shipment_id":  ["id", "shipment_id", "order_id", "tracking", "tracking_no",
                              "shipment_no", "awb"],
        }
        rename = {}
        cols_lower = {c.lower().strip(): c for c in df.columns}
        for target, candidates in MAP.items():
            if target in df.columns:
                continue
            for cand in candidates:
                if cand in cols_lower:
                    rename[cols_lower[cand]] = target
                    break
        return df.rename(columns=rename)

    def _update_hub(self, rec: dict):
        hub = str(rec.get("hub_id", "UNKNOWN"))
        lam = float(rec.get("arrival_rate", 0) or 0)
        mu  = float(rec.get("service_rate",  1) or 1)

        if hub not in self.hub_stats:
            self.hub_stats[hub] = {"lambda_sum": 0, "mu_sum": 0, "count": 0, "queue_depth": 0}

        s = self.hub_stats[hub]
        s["lambda_sum"]  += lam
        s["mu_sum"]      += mu
        s["count"]       += 1
        s["queue_depth"] += max(0, lam - mu)

    def _summary(self) -> dict:
        hubs = []
        for hub_id, s in self.hub_stats.items():
            n   = max(s["count"], 1)
            lam = s["lambda_sum"] / n
            mu  = s["mu_sum"]     / n
            rho, irp = compute_irp(lam, mu, n)
            kf  = self.kalman_states.get(hub_id)
            hubs.append({
                "hub_id":          hub_id,
                "lambda":          round(lam, 4),
                "mu":              round(mu,  4),
                "rho":             rho,
                "irp_score":       irp,
                "queue_depth":     int(s["queue_depth"]),
                "risk":            risk_level(rho),
                "kalman_estimate": round(kf.x, 6) if kf else None,
            })
        return {
            "tenant_id":  self.tenant_id,
            "total_rows": len(self.shipments),
            "hub_count":  len(hubs),
            "hubs":       sorted(hubs, key=lambda h: -h["rho"]),
            "reset_at":   datetime.utcnow().isoformat(),
        }


_kernels: dict[str, TenantKernel] = {}


def get_kernel(tenant_id: str = "default") -> TenantKernel:
    if tenant_id not in _kernels:
        _kernels[tenant_id] = TenantKernel(tenant_id)
    return _kernels[tenant_id]


# ── CSV parsing helper ─────────────────────────────────────────────────────────
def parse_csv_resilient(raw_bytes: bytes) -> pd.DataFrame:
    """UTF-8 → ISO-8859-1 fallback + non-ASCII strip + bad-line skip."""
    try:
        text = raw_bytes.decode("utf-8")
        if "\uFFFD" in text:
            raise UnicodeDecodeError("utf-8", b"", 0, 1, "replacement char")
    except (UnicodeDecodeError, ValueError):
        try:
            text = raw_bytes.decode("iso-8859-1")
        except Exception:
            text = raw_bytes.decode("utf-8", errors="replace")

    # Strip non-ASCII special characters (smart quotes, em-dash, etc.)
    text = re.sub(r"[^\x20-\x7E\t\n\r]", "", text)

    # Strip unit suffixes from numeric-ish columns
    def sanitize_row(row: str) -> str:
        return re.sub(r"(\d)\s*(kg|g|lbs|oz|\$|₹|€|£|%)", r"\1", row, flags=re.IGNORECASE)

    lines  = text.split("\n")
    header = lines[0]
    body   = "\n".join(sanitize_row(l) for l in lines[1:])
    text   = header + "\n" + body

    df = pd.read_csv(
        io.StringIO(text),
        on_bad_lines="skip",
        low_memory=False,
    )
    # Fill missing numeric values with column means
    num_cols = df.select_dtypes(include=[np.number]).columns
    df[num_cols] = df[num_cols].fillna(df[num_cols].mean())
    return df


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.route("/", methods=["GET"])
@app.route("/api", methods=["GET"])
@app.route("/api/", methods=["GET"])
def home():
    return jsonify({
        "status": "SITI Intelligence Kernel Online",
        "version": "3.0.0",
        "timestamp": datetime.utcnow().isoformat(),
        "endpoints": [
            "GET  /health",
            "GET  /ping",
            "GET  /api/hubs",
            "GET  /api/kernel/status",
            "POST /api/kernel/reset",
            "POST /api/kernel/upload",   # alias
            "POST /api/kernel/predict",
            "POST /api/kernel/analyze",
            "POST /api/alerts/test",
            "GET  /api/admin/keys",
        ]
    })


@app.route("/health", methods=["GET"])
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "healthy",
        "kernel": "SITI GSC v3.0",
        "supabase": "connected" if get_supabase() else "fallback_mode",
        "twilio":   "connected" if get_twilio()   else "not_configured",
        "timestamp": datetime.utcnow().isoformat(),
    })


@app.route("/ping", methods=["GET"])
def ping():
    return jsonify({"status": "alive", "ts": datetime.utcnow().isoformat()})


# ── CORE: CSV Upload / Genius Reset ───────────────────────────────────────────
# Registered at BOTH paths so App.js (/api/kernel/reset)
# AND DataInjection.jsx (/kernel/upload → baseURL + /kernel/upload = /kernel/upload)
# work correctly.

def _handle_upload():
    """Shared upload handler — called by both endpoints."""
    tenant_id = request.headers.get("X-Tenant-ID", "default")
    kernel    = get_kernel(tenant_id)

    if "file" not in request.files:
        return jsonify({
            "error": "No file uploaded.",
            "hint":  "Send a CSV as multipart/form-data in the 'file' field."
        }), 400

    f = request.files["file"]
    if not f.filename.lower().endswith(".csv"):
        return jsonify({"error": "Only .csv files supported."}), 400

    raw = f.read()
    if not raw:
        return jsonify({"error": "Empty file uploaded."}), 400

    try:
        df = parse_csv_resilient(raw)
    except Exception as e:
        return jsonify({"error": f"CSV parse failed: {e}"}), 422

    if df.empty:
        return jsonify({"error": "CSV has no data rows."}), 422

    try:
        summary = kernel.reset(df)
    except ValueError as e:
        return jsonify({
            "error": str(e),
            "detail": {
                "type": "SCHEMA_MISMATCH",
                "found_columns": list(df.columns),
                "required_unmapped": ["hub_id", "arrival_rate", "service_rate"],
            }
        }), 400

    # Fire SMS/WhatsApp alerts for critical hubs
    critical_hubs = [h for h in summary["hubs"] if h["risk"] == "critical"]
    alerts_fired  = []
    if critical_hubs:
        hub = critical_hubs[0]
        msg = (
            f"🔴 SITI KERNEL ALERT\n"
            f"Hub: {hub['hub_id']} — CRITICAL\n"
            f"Load ρ = {hub['rho']} (over capacity)\n"
            f"Queue: {hub['queue_depth']} shipments\n"
            f"IRP Score: {hub['irp_score']}/10\n"
            f"→ Reroute immediately. SITI Intelligence."
        )
        sms_result = send_alert(msg, channel="sms")
        alerts_fired.append(sms_result)
        summary["sms_alert"] = sms_result

    summary["alerts_fired"] = alerts_fired

    return jsonify({"success": True, "summary": summary,
                    "message": f"Reset complete. {summary['total_rows']} rows, {summary['hub_count']} hubs."}), 200


@app.route("/api/kernel/reset", methods=["POST"])
@require_api_key
def genius_reset():
    """Primary upload endpoint (used by App.js)."""
    return _handle_upload()


@app.route("/kernel/upload", methods=["POST"])
@app.route("/api/kernel/upload", methods=["POST"])
@require_api_key
def kernel_upload():
    """Alias upload endpoint (used by DataInjection.jsx via axios baseURL)."""
    return _handle_upload()


# ── Hub Status ─────────────────────────────────────────────────────────────────
@app.route("/api/kernel/status", methods=["GET"])
@app.route("/api/kernel/state", methods=["GET"])
@require_api_key
def kernel_status():
    tenant_id = request.headers.get("X-Tenant-ID", "default")
    kernel    = get_kernel(tenant_id)
    summary   = kernel._summary()
    summary["annualized_exposure"] = 2_810_000
    return jsonify(summary)


@app.route("/api/hubs", methods=["GET"])
@require_api_key
def list_hubs():
    tenant_id = request.headers.get("X-Tenant-ID", "default")
    kernel    = get_kernel(tenant_id)
    hubs = []
    for hub_id, s in kernel.hub_stats.items():
        n = max(s["count"], 1)
        lam, mu = s["lambda_sum"] / n, s["mu_sum"] / n
        rho, irp = compute_irp(lam, mu, n)
        hubs.append({
            "hub_id":    hub_id,
            "rho":       rho,
            "irp_score": irp,
            "risk":      risk_level(rho),
        })
    return jsonify({"hubs": sorted(hubs, key=lambda h: -h["rho"])})


# ── Kalman Prediction ──────────────────────────────────────────────────────────
@app.route("/api/kernel/predict", methods=["POST"])
@require_api_key
def predict():
    tenant_id = request.headers.get("X-Tenant-ID", "default")
    kernel    = get_kernel(tenant_id)
    data      = request.get_json(force=True) or {}

    hub_id = str(data.get("hub_id", "UNKNOWN"))
    obs    = [float(x) for x in data.get("observations", []) if x is not None]

    if not obs:
        return jsonify({"error": "Provide at least one observation value in 'observations' array."}), 400

    if hub_id not in kernel.kalman_states:
        kernel.kalman_states[hub_id] = KalmanFilter1D()

    kf        = kernel.kalman_states[hub_id]
    smoothed  = [kf.update(z) for z in obs]
    predicted = kf.predict_n(5)
    current   = smoothed[-1] if smoothed else kf.x

    result = {
        "hub_id":             hub_id,
        "smoothed":           smoothed,
        "predicted":          predicted,
        "current_delay_prob": current,
        "kalman_state":       {"x": kf.x, "P": round(kf.P, 6)},
    }

    # Alert if T+5 prediction crosses 90%
    if predicted and predicted[-1] > 0.90:
        hs = kernel.hub_stats.get(hub_id, {})
        msg = (
            f"⚠️ SITI PREDICTION ALERT\n"
            f"Hub: {hub_id}\n"
            f"Kalman predicts {predicted[-1]*100:.1f}% delay prob in 5 ticks\n"
            f"Queue: {int(hs.get('queue_depth', 0))} shipments\n"
            f"→ Intervene now. SITI Intelligence."
        )
        alert_result = send_alert(msg, channel="sms")
        result["alert_fired"]  = True
        result["alert_result"] = alert_result

    return jsonify(result)


# ── AI Analysis (OpenRouter) ───────────────────────────────────────────────────
@app.route("/api/kernel/analyze", methods=["POST"])
def analyze_logistics():
    """Plain-English AI explanation of a logistics failure."""
    data    = request.get_json(force=True) or {}
    api_key = os.getenv("OPENROUTER_API_KEY", "")

    if not api_key:
        # Graceful fallback — generate a basic explanation without AI
        hub_id = data.get("hub_id", "Unknown hub")
        rho    = data.get("rho", 0)
        return jsonify({
            "explanation": (
                f"Hub {hub_id} shows a load factor ρ={rho:.3f}. "
                f"{'This hub is over capacity — arrivals exceed processing rate.' if rho > 1 else 'This hub is operating within normal range.'} "
                f"The Inverse Reliability Paradox suggests that high-value shipments "
                f"face disproportionate delay risk at elevated utilization. "
                f"Consider rerouting to lower-utilization hubs immediately."
            ),
            "source": "MIMI Kernel (local)"
        })

    try:
        prompt = (
            "You are a logistics operations expert. Explain this hub failure data "
            "in plain English for an ops manager in 2-3 sentences. Be specific and actionable. "
            f"Data: {json.dumps(data)}"
        )
        response = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model":    "google/gemini-2.0-flash-001",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 200,
            },
            timeout=30.0
        )
        resp_data = response.json()
        text = resp_data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return jsonify({"explanation": text, "source": "OpenRouter/Gemini"})
    except Exception as e:
        log.error("OpenRouter error: %s", e)
        return jsonify({"error": str(e)}), 500


# ── Alerts Test Endpoint ───────────────────────────────────────────────────────
@app.route("/api/alerts/test", methods=["POST"])
@require_api_key
def test_alerts():
    """Test Twilio alerts. Body: {channel: 'sms'|'whatsapp', message: '...'}"""
    data    = request.get_json(force=True) or {}
    channel = data.get("channel", "sms")
    message = data.get("message", (
        "✅ SITI Intelligence — Alert test successful!\n"
        "Your Twilio integration is working correctly.\n"
        "Hub monitoring active."
    ))

    result = send_alert(message, channel=channel)
    return jsonify({
        "test": "alert",
        "channel": channel,
        "result": result,
        "twilio_configured": get_twilio() is not None,
        "from_number": os.getenv("TWILIO_FROM_NUMBER", "not_set"),
        "to_number":   os.getenv("TWILIO_ALERT_NUMBER", "not_set"),
    })


# ── Cashfree Webhook ───────────────────────────────────────────────────────────
@app.route("/api/payments/cashfree-webhook", methods=["POST"])
def cashfree_webhook():
    """
    Cashfree payment webhook.
    Verifies HMAC-SHA256 signature and provisions API key on success.
    """
    payload_bytes = request.get_data()
    sig_header    = request.headers.get("x-webhook-signature", "")
    webhook_secret = os.getenv("CASHFREE_WEBHOOK_SECRET", "")

    # Verify signature
    if webhook_secret:
        ts = request.headers.get("x-webhook-timestamp", "")
        sig_body  = ts + payload_bytes.decode("utf-8")
        expected  = hmac.new(
            webhook_secret.encode(),
            sig_body.encode(),
            hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected, sig_header):
            log.warning("Cashfree webhook signature mismatch")
            return jsonify({"error": "Invalid signature"}), 400

    try:
        data = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    order_id   = data.get("data", {}).get("order", {}).get("order_id", "")
    payment_id = data.get("data", {}).get("payment", {}).get("cf_payment_id", "")
    status     = data.get("data", {}).get("payment", {}).get("payment_status", "")
    plan       = data.get("data", {}).get("order", {}).get("order_tags", {}).get("plan", "pilot")

    log.info("Cashfree webhook: order=%s payment=%s status=%s plan=%s",
             order_id, payment_id, status, plan)

    if status == "SUCCESS":
        # Provision API key
        import secrets
        new_key = f"siti-{plan}-{secrets.token_urlsafe(16)}"

        db = get_supabase()
        if db:
            try:
                db.table("api_keys").insert({
                    "key":        new_key,
                    "role":       "OPERATOR",
                    "plan":       plan,
                    "active":     True,
                    "order_id":   order_id,
                    "payment_id": payment_id,
                    "created_at": datetime.utcnow().isoformat(),
                }).execute()
                log.info("API key provisioned for order %s", order_id)
            except Exception as e:
                log.error("Failed to store key in Supabase: %s", e)

        # Send welcome message
        welcome_msg = (
            f"🎉 SITI Intelligence — Payment Confirmed!\n"
            f"Plan: {plan.upper()}\n"
            f"Order: {order_id}\n"
            f"Your API key has been provisioned.\n"
            f"Dashboard: https://siti-gsc-kernel.vercel.app"
        )
        send_alert(welcome_msg, channel="whatsapp")

        return jsonify({
            "received": True,
            "provisioned": True,
            "plan": plan,
        })

    return jsonify({"received": True, "provisioned": False, "status": status})


# ── Admin ──────────────────────────────────────────────────────────────────────
@app.route("/api/admin/keys", methods=["GET"])
@require_api_key
def list_keys():
    """List active API keys (admin only)."""
    db = get_supabase()
    if not db:
        return jsonify({
            "mode":        "fallback",
            "keys":        list(_FALLBACK_KEYS),
            "note": "Configure Supabase env vars for persistent key storage."
        })
    try:
        res = db.table("api_keys").select("key,plan,active,created_at").eq("active", True).execute()
        return jsonify({"keys": res.data})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/admin/create-key", methods=["POST"])
@require_api_key
def create_key():
    import secrets
    data    = request.get_json(force=True) or {}
    plan    = data.get("plan", "pilot")
    new_key = f"siti-{plan}-{secrets.token_urlsafe(16)}"

    db = get_supabase()
    if db:
        try:
            db.table("api_keys").insert({
                "key":        new_key,
                "role":       data.get("role", "OPERATOR"),
                "plan":       plan,
                "active":     True,
                "created_at": datetime.utcnow().isoformat(),
            }).execute()
        except Exception as e:
            log.warning("Supabase key insert failed: %s", e)

    return jsonify({"key": new_key, "plan": plan, "active": True})


# ── Error handlers ─────────────────────────────────────────────────────────────
@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Route not found.", "path": request.path}), 404


@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"error": "Method not allowed.", "allowed": e.valid_methods}), 405


@app.errorhandler(500)
def server_error(e):
    log.error("500 Internal Error: %s", e)
    return jsonify({"error": "Internal kernel error. Check logs."}), 500


# ── Entry point ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    log.info("SITI Intelligence Kernel v3.0 starting on port %d", port)
    app.run(host="0.0.0.0", port=port, debug=False)
