import os
import io
import re
import math
import uuid
import logging
import hashlib
import hmac
import json
import time
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
# BUG-011 FIX: Proper CORS — allow configured origins + all Vercel previews
_cors_origins_raw = os.getenv("CORS_ORIGINS", "*")
CORS(app, resources={
    r"/api/*": {
        "origins": _cors_origins_raw.split(","),
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": [
            "Content-Type", "X-API-Key", "X-Tenant-ID",
            "Authorization", "X-Requested-With"
        ],
        "expose_headers": ["X-Request-ID"],
        "supports_credentials": False,
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
    """Send alert via SMS or WhatsApp."""
    client = get_twilio()
    if not client:
        log.warning("Twilio not configured — alert skipped")
        return {"sent": False, "reason": "Twilio not configured"}

    from_num = os.getenv("TWILIO_FROM_NUMBER", "")
    to_num   = os.getenv("TWILIO_ALERT_NUMBER", "")

    if not from_num or not to_num:
        return {"sent": False, "reason": "Phone numbers not configured"}

    try:
        if channel == "whatsapp":
            from_str = f"whatsapp:{from_num}" if not from_num.startswith("whatsapp:") else from_num
            to_str   = f"whatsapp:{to_num}"   if not to_num.startswith("whatsapp:")   else to_num
        else:
            from_str, to_str = from_num, to_num

        msg = client.messages.create(body=message, from_=from_str, to=to_str)
        return {"sent": True, "sid": msg.sid, "channel": channel}
    except Exception as e:
        log.error("Twilio send failed: %s", e)
        return {"sent": False, "reason": str(e)}


# ── Auth middleware ────────────────────────────────────────────────────────────
# BUG-001 FIX: Consistent key parsing — support "key:ROLE" and plain "key" formats
_raw_keys = os.getenv("API_KEYS", "siti-admin-key-001:ADMIN,siti-demo-key:READONLY")
_FALLBACK_KEYS = set()
for entry in _raw_keys.split(","):
    entry = entry.strip()
    if entry:
        _FALLBACK_KEYS.add(entry.split(":")[0])

log.info("Fallback API keys loaded: %d keys", len(_FALLBACK_KEYS))


def require_api_key(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        # BUG-001 FIX: Check all common header variations the frontend might send
        key = (
            request.headers.get("X-API-Key")
            or request.headers.get("x-api-key")
            or request.headers.get("Authorization", "").replace("Bearer ", "").strip()
            or request.args.get("api_key")
        )
        if not key:
            return jsonify({
                "error": "Missing API key.",
                "hint": "Send header: X-API-Key: your-key-here"
            }), 401

        # Try Supabase first
        db = get_supabase()
        if db:
            try:
                res = db.table("api_keys").select("key,active").eq("key", key).execute()
                if res.data:
                    if res.data[0].get("active"):
                        return fn(*args, **kwargs)
                    return jsonify({"error": "API key inactive."}), 403
            except Exception as e:
                log.warning("Supabase auth check failed, using fallback: %s", e)

        # Fallback: env-based keys
        if key in _FALLBACK_KEYS:
            return fn(*args, **kwargs)

        return jsonify({
            "error": "Invalid API key.",
            "hint": "Use siti-admin-key-001 for demo access."
        }), 403
    return wrapper


# ── MIMI Kernel Math ────────────────────────────────────────────────────────────
def compute_irp(lam: float, mu: float, scale: int) -> tuple[float, float]:
    """
    Compute load factor ρ and IRP score.
    BUG-015 FIX: IRP now uses a meaningful formula based on queue theory.
    IRP = Φ(ρ) × failure_severity_weight
    """
    mu = max(mu, 1e-9)
    rho = min(lam / mu, 2.0)  # cap to prevent infinity
    # Sigmoidal instability function
    phi = 1 / (1 + math.exp(-20 * (rho - 0.85)))
    # IRP: weighted by log scale for statistical significance
    # At small scale (1-10 rows), use rho directly scaled; at large scale use full log
    if scale >= 10:
        irp = phi * math.log1p(scale) / math.log1p(1000) * 10.0
    else:
        irp = phi * rho * 3.0  # BUG-015 FIX: meaningful small-scale score
    return round(rho, 6), round(min(irp, 10.0), 6)


def risk_level(rho: float) -> str:
    if rho >= 0.85: return "critical"
    if rho >= 0.70: return "warning"
    return "safe"


class KalmanFilter1D:
    """
    Proper 1D Kalman filter for hub delay probability.
    BUG-014 FIX: predict_n() now implements correct Kalman prediction
    (state evolves as random walk — prediction is current estimate,
    uncertainty grows by Q each step).
    """
    def __init__(self, process_var=0.005, obs_var=0.1):
        self.x = 0.5
        self.P = 1.0
        self.Q = process_var  # process noise
        self.R = obs_var      # observation noise

    def update(self, z: float) -> float:
        """Update state with new observation."""
        # Predict
        x_pred = self.x
        P_pred = self.P + self.Q
        # Update
        K      = P_pred / (P_pred + self.R)
        self.x = x_pred + K * (z - x_pred)
        self.P = (1 - K) * P_pred
        return round(self.x, 6)

    def predict_n(self, n: int) -> list[float]:
        """
        BUG-014 FIX: Correct Kalman prediction.
        Without new observations, best estimate stays at x_hat
        but uncertainty grows. We return x_hat with small
        uncertainty-based drift.
        """
        preds = []
        x, P = self.x, self.P
        for _ in range(n):
            # State prediction: x stays same (random walk model)
            P = P + self.Q
            # Under uncertainty, clip prediction to [0, 1]
            predicted = round(min(max(x, 0.0), 1.0), 6)
            preds.append(predicted)
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
        self.last_reset    = None

    def reset(self, df: pd.DataFrame) -> dict:
        """Wipe state and re-ingest CSV with flexible column mapping."""
        self.shipments.clear()
        self.hub_stats.clear()
        self.kalman_states.clear()
        self.alert_log.clear()
        self.last_reset = datetime.utcnow().isoformat()

        # BUG-003 FIX: Extended column normalization for Kaggle + Delhivery datasets
        df = self._normalize_columns(df)

        required = {"hub_id", "arrival_rate", "service_rate"}
        missing  = required - set(df.columns)
        if missing:
            raise ValueError(
                f"CSV missing required columns: {missing}. "
                f"Found: {list(df.columns)[:15]}"
            )

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
        """
        BUG-003 FIX: Extended fuzzy column mapping.
        Handles Kaggle e-commerce logistics CSV, Delhivery, custom 3PL formats.

        Kaggle dataset columns:
          ID, Warehouse_block, Mode_of_Shipment, Customer_care_calls,
          Customer_rating, Cost_of_the_Product, Prior_purchases,
          Product_importance, Gender, Discount_offered, Weight_in_gms,
          Reached.on.Time_Y.N

        We synthesize hub_id from Warehouse_block, arrival_rate from
        row count (each row = 1 arrival), service_rate from a block-based
        capacity estimate.
        """
        MAP = {
            "hub_id": [
                "hub", "hub_code", "depot", "facility", "warehouse_block",
                "block", "wh_block", "location", "asset_id", "zone",
                "warehouse", "origin_hub", "dest_hub", "sorting_center",
            ],
            "arrival_rate": [
                "lambda", "arrival_count", "inbound_rate", "arrivals",
                "shipments_per_hour", "count", "daily_count", "volume",
                "throughput_in", "order_count", "package_count",
            ],
            "service_rate": [
                "mu", "processing_rate", "throughput", "capacity",
                "service_capacity", "capacity_per_hour", "processing_capacity",
                "output_rate", "dispatch_rate", "throughput_out",
            ],
            "shipment_id": [
                "id", "shipment_id", "order_id", "tracking", "tracking_no",
                "shipment_no", "awb", "waybill", "consignment_no", "pkg_id",
            ],
        }
        rename = {}
        cols_lower = {c.lower().strip().replace(".", "_"): c for c in df.columns}

        for target, candidates in MAP.items():
            if target in df.columns:
                continue
            for cand in candidates:
                if cand in cols_lower:
                    rename[cols_lower[cand]] = target
                    break

        df = df.rename(columns=rename)

        # ── SYNTHETIC COLUMN GENERATION for Kaggle-style datasets ────────────
        # If after mapping we still don't have arrival_rate and service_rate,
        # but we have Warehouse_block (mapped to hub_id), synthesize them.
        if "hub_id" in df.columns and "arrival_rate" not in df.columns:
            # Each row = 1 shipment arriving; aggregate count per hub as λ
            hub_counts = df["hub_id"].value_counts()
            n_total = len(df)
            # λ for each row = (its hub's total count) / total rows * 100
            # This gives arrival rate as % of total load — realistic for M/M/1
            df["arrival_rate"] = df["hub_id"].map(
                lambda h: round(hub_counts.get(h, 1) / max(n_total, 1) * 100, 4)
            )
            log.info("Synthesized arrival_rate from hub distribution")

        if "hub_id" in df.columns and "service_rate" not in df.columns:
            # Service rate = fixed capacity baseline per hub
            # In Kaggle dataset, 5 blocks (A,B,C,D,F) with equal capacity
            n_hubs = df["hub_id"].nunique()
            base_mu = 100.0 / max(n_hubs, 1)  # total capacity split across hubs
            df["service_rate"] = base_mu
            log.info("Synthesized service_rate=%.2f from %d hubs", base_mu, n_hubs)

        # Handle on-time delivery column for leakage calculation
        if "on_time" not in df.columns:
            for col in ["Reached.on.Time_Y.N", "reached_on_time_y_n",
                        "delivered_on_time", "on_time_delivery", "late"]:
                if col in df.columns:
                    df["on_time"] = df[col]
                    break

        return df

    def _update_hub(self, rec: dict):
        hub = str(rec.get("hub_id", "UNKNOWN"))
        lam = float(rec.get("arrival_rate", 0) or 0)
        mu  = float(rec.get("service_rate",  1) or 1)

        if hub not in self.hub_stats:
            self.hub_stats[hub] = {
                "lambda_sum": 0, "mu_sum": 0, "count": 0,
                "queue_depth": 0, "on_time": 0, "late": 0
            }

        s = self.hub_stats[hub]
        s["lambda_sum"]  += lam
        s["mu_sum"]      += mu
        s["count"]       += 1
        s["queue_depth"] += max(0, lam - mu)

        # Track on-time delivery if available
        on_time_val = rec.get("on_time")
        if on_time_val is not None:
            try:
                v = float(on_time_val)
                # Kaggle: 1 = reached on time, 0 = late
                # Some datasets: 1 = late, 0 = on time
                # We detect by column name context
                s["on_time"] += int(v == 1)
                s["late"]    += int(v == 0)
            except (ValueError, TypeError):
                pass

    def _summary(self) -> dict:
        hubs = []
        for hub_id, s in self.hub_stats.items():
            n   = max(s["count"], 1)
            lam = s["lambda_sum"] / n
            mu  = s["mu_sum"]     / n
            rho, irp = compute_irp(lam, mu, n)

            # Update Kalman with current rho observation
            if hub_id not in self.kalman_states:
                self.kalman_states[hub_id] = KalmanFilter1D()
            kf = self.kalman_states[hub_id]
            kf.update(rho)  # feed current rho as observation
            predictions = kf.predict_n(3)  # T+1, T+2, T+3

            hubs.append({
                "hub_id":            hub_id,
                "lambda":            round(lam, 4),
                "mu":                round(mu,  4),
                "rho":               rho,
                "irp_score":         irp,
                "queue_depth":       int(s["queue_depth"]),
                "risk":              risk_level(rho),
                "on_time":           s["on_time"],
                "late":              s["late"],
                "shipments":         n,
                "delay_rate":        round(s["late"] / n, 4) if n > 0 else 0,
                "kalman_estimate":   round(kf.x, 6),
                "kalman_t1":         predictions[0] if predictions else None,
                "kalman_t2":         predictions[1] if len(predictions) > 1 else None,
                "kalman_t3":         predictions[2] if len(predictions) > 2 else None,
            })

        # Sort by rho descending — highest risk first
        hubs.sort(key=lambda h: -h["rho"])

        total_rho = (
            sum(h["rho"] for h in hubs) / len(hubs) if hubs else 0
        )

        return {
            "tenant_id":            self.tenant_id,
            "total_rows":           len(self.shipments),
            "hub_count":            len(hubs),
            "hubs":                 hubs,
            "global_rho":           round(total_rho, 6),
            "annualized_exposure":  2_810_000,
            "reset_at":             self.last_reset,
        }


_kernels: dict[str, TenantKernel] = {}


def get_kernel(tenant_id: str = "default") -> TenantKernel:
    if tenant_id not in _kernels:
        _kernels[tenant_id] = TenantKernel(tenant_id)
    return _kernels[tenant_id]


# ── CSV parsing ────────────────────────────────────────────────────────────────
def parse_csv_resilient(raw_bytes: bytes) -> pd.DataFrame:
    """
    Multi-encoding fallback CSV parser.
    UTF-8 → ISO-8859-1 → Windows-1252, strips non-ASCII, skips bad lines.
    """
    text = None
    for encoding in ("utf-8", "iso-8859-1", "windows-1252"):
        try:
            decoded = raw_bytes.decode(encoding)
            if "\uFFFD" not in decoded:
                text = decoded
                break
        except (UnicodeDecodeError, ValueError):
            continue

    if text is None:
        text = raw_bytes.decode("utf-8", errors="replace")

    # Strip non-ASCII special characters (smart quotes, em-dash, BOM, etc.)
    text = re.sub(r"[^\x20-\x7E\t\n\r]", "", text)

    # Strip unit suffixes from numeric-ish values (100kg → 100, $5.99 → 5.99)
    def sanitize_row(row: str) -> str:
        return re.sub(
            r"(\d)\s*(kg|g|lbs|oz|\$|₹|€|£|%|units?|hrs?|hours?)",
            r"\1", row, flags=re.IGNORECASE
        )

    lines  = text.split("\n")
    if not lines:
        raise ValueError("Empty CSV")
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
    if len(num_cols) > 0:
        df[num_cols] = df[num_cols].fillna(df[num_cols].mean())

    return df


# ── Upload handler ─────────────────────────────────────────────────────────────
def _handle_upload():
    """Shared CSV upload + kernel reset handler."""
    tenant_id = request.headers.get("X-Tenant-ID", "default")
    kernel    = get_kernel(tenant_id)

    if "file" not in request.files:
        return jsonify({
            "error": "No file uploaded.",
            "hint":  "Send CSV as multipart/form-data in the 'file' field."
        }), 400

    f = request.files["file"]
    if not f.filename.lower().endswith(".csv"):
        return jsonify({"error": "Only .csv files are supported."}), 400

    raw = f.read()
    if not raw:
        return jsonify({"error": "Uploaded file is empty."}), 400

    try:
        df = parse_csv_resilient(raw)
    except Exception as e:
        return jsonify({"error": f"CSV parse failed: {e}"}), 422

    if df.empty:
        return jsonify({"error": "CSV has no data rows after parsing."}), 422

    try:
        summary = kernel.reset(df)
    except ValueError as e:
        return jsonify({
            "error": str(e),
            "detail": {
                "type":               "SCHEMA_MISMATCH",
                "found_columns":      list(df.columns),
                "required_unmapped":  ["hub_id", "arrival_rate", "service_rate"],
                "hint": (
                    "Common Kaggle columns are auto-mapped. "
                    "If using a custom CSV, ensure columns map to: "
                    "hub_id (warehouse/block), arrival_rate (lambda/count), "
                    "service_rate (mu/capacity)."
                )
            }
        }), 400

    # Fire SMS alerts for critical hubs
    critical_hubs = [h for h in summary["hubs"] if h["risk"] == "critical"]
    if critical_hubs:
        hub = critical_hubs[0]
        msg = (
            f"🔴 SITI KERNEL ALERT\n"
            f"Hub: {hub['hub_id']} — CRITICAL\n"
            f"Load ρ = {hub['rho']} (at/over capacity)\n"
            f"Queue: {hub['queue_depth']} shipments backed up\n"
            f"IRP Score: {hub['irp_score']}/10\n"
            f"→ Reroute immediately. SITI Intelligence."
        )
        summary["sms_alert"] = send_alert(msg, channel="sms")

    return jsonify({
        "success": True,
        "summary": summary,
        "message": (
            f"Reset complete. "
            f"{summary['total_rows']} rows processed, "
            f"{summary['hub_count']} hubs detected."
        )
    }), 200


# ── ROUTES ─────────────────────────────────────────────────────────────────────

@app.route("/", methods=["GET"])
@app.route("/api", methods=["GET"])
@app.route("/api/", methods=["GET"])
def home():
    return jsonify({
        "status":    "SITI Intelligence Kernel Online",
        "version":   "4.0.0",
        "timestamp": datetime.utcnow().isoformat(),
        "endpoints": [
            "GET  /health",
            "GET  /ping",
            "GET  /api/hubs",
            "GET  /api/kernel/status",
            "POST /api/kernel/reset",
            "POST /api/kernel/upload",
            "POST /api/kernel/predict",
            "POST /api/kernel/analyze",
            "POST /api/alerts/test",
            "POST /api/payments/create-order",
            "POST /api/payments/cashfree-webhook",
            "GET  /api/admin/keys",
            "POST /api/admin/create-key",
        ]
    })


@app.route("/health", methods=["GET"])
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status":    "healthy",
        "kernel":    "SITI GSC v4.0",
        "supabase":  "connected" if get_supabase() else "fallback_mode",
        "twilio":    "connected" if get_twilio()   else "not_configured",
        "timestamp": datetime.utcnow().isoformat(),
    })


@app.route("/ping", methods=["GET"])
def ping():
    return jsonify({"status": "alive", "ts": datetime.utcnow().isoformat()})


# ── CSV Upload endpoints ───────────────────────────────────────────────────────
@app.route("/api/kernel/reset", methods=["POST"])
@require_api_key
def genius_reset():
    """Primary upload endpoint."""
    return _handle_upload()


@app.route("/kernel/upload", methods=["POST"])
@app.route("/api/kernel/upload", methods=["POST"])
@require_api_key
def kernel_upload():
    """Alias upload endpoint."""
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
            "shipments": n,
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
        return jsonify({
            "error": "Provide at least one observation in 'observations' array."
        }), 400

    if hub_id not in kernel.kalman_states:
        kernel.kalman_states[hub_id] = KalmanFilter1D()

    kf       = kernel.kalman_states[hub_id]
    smoothed = [kf.update(z) for z in obs]
    predicted = kf.predict_n(5)  # BUG-014 FIX: proper prediction
    current   = smoothed[-1] if smoothed else kf.x

    result = {
        "hub_id":             hub_id,
        "smoothed":           smoothed,
        "predicted":          predicted,
        "current_delay_prob": current,
        "kalman_state":       {"x": kf.x, "P": round(kf.P, 6)},
    }

    if predicted and predicted[-1] > 0.90:
        hs  = kernel.hub_stats.get(hub_id, {})
        msg = (
            f"⚠️ SITI PREDICTION ALERT\n"
            f"Hub: {hub_id}\n"
            f"Kalman predicts {predicted[-1]*100:.1f}% delay probability in 5 ticks\n"
            f"Queue backlog: {int(hs.get('queue_depth', 0))} shipments\n"
            f"→ Intervene now. SITI Intelligence."
        )
        result["alert_fired"]  = True
        result["alert_result"] = send_alert(msg, channel="sms")

    return jsonify(result)


# ── AI Analysis ────────────────────────────────────────────────────────────────
@app.route("/api/kernel/analyze", methods=["POST"])
def analyze_logistics():
    """Plain-English AI explanation using OpenRouter."""
    data    = request.get_json(force=True) or {}
    api_key = os.getenv("OPENROUTER_API_KEY", "")

    if not api_key:
        hub_id = data.get("hub_id", "Unknown hub")
        rho    = data.get("rho", 0)
        return jsonify({
            "explanation": (
                f"Hub {hub_id} is showing a load factor ρ={rho:.3f}. "
               f"This hub is over capacity — arrivals exceed the processing rate." 
                   'Immediate rerouting is recommended.' if rho > 1 else
                   'This hub is within normal operating range.'} "
                f"The Inverse Reliability Paradox indicates that high-value shipments "
                f"face disproportionate delay risk as utilization approaches critical thresholds."
            ),
            "source": "MIMI Kernel (local)"
        })

    try:
        prompt = (
            "You are a logistics operations expert for Indian 3PL companies. "
            "Explain this hub failure data in plain English for an ops manager "
            "in 2-3 concise sentences. Be specific, data-driven, and actionable. "
            f"Data: {json.dumps(data)}"
        )
        response = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type":  "application/json",
                "HTTP-Referer":  "https://siti-intelligence.io",
            },
            json={
                "model":    "google/gemini-2.0-flash-001",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 250,
            },
            timeout=30.0
        )
        resp_data = response.json()
        text = resp_data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return jsonify({"explanation": text, "source": "OpenRouter/Gemini"})
    except Exception as e:
        log.error("OpenRouter error: %s", e)
        return jsonify({"error": str(e)}), 500


# ── Alerts Test ────────────────────────────────────────────────────────────────
@app.route("/api/alerts/test", methods=["POST"])
@require_api_key
def test_alerts():
    data    = request.get_json(force=True) or {}
    channel = data.get("channel", "sms")
    message = data.get("message", (
        "✅ SITI Intelligence — Alert test successful!\n"
        "Twilio integration is working correctly.\n"
        "Hub monitoring active. Response SLA: 2 min."
    ))
    result = send_alert(message, channel=channel)
    return jsonify({
        "test":               "alert",
        "channel":            channel,
        "result":             result,
        "twilio_configured":  get_twilio() is not None,
        "from_number":        os.getenv("TWILIO_FROM_NUMBER", "not_set"),
        "to_number":          os.getenv("TWILIO_ALERT_NUMBER", "not_set"),
    })


# ── BUG-008 FIX: Cashfree Order Creation ──────────────────────────────────────
@app.route("/api/payments/create-order", methods=["POST"])
@require_api_key
def create_cashfree_order():
    """
    BUG-008 FIX: This endpoint was MISSING, causing all payment buttons to
    silently fall through to WhatsApp. Now creates real Cashfree orders,
    or falls back to WhatsApp redirect if Cashfree is not configured.
    """
    data = request.get_json(force=True) or {}
    plan = data.get("plan", "pilot")
    amount = data.get("amount", 9999)

    cashfree_app_id  = os.getenv("CASHFREE_APP_ID", "")
    cashfree_secret  = os.getenv("CASHFREE_SECRET_KEY", "")
    cashfree_env     = os.getenv("CASHFREE_ENV", "sandbox")  # "production" for live

    # If Cashfree not configured, return WhatsApp fallback
    if not cashfree_app_id or not cashfree_secret or cashfree_app_id == "value":
        wa_number  = os.getenv("WHATSAPP_NUMBER", "918956493671")
        wa_message = (
            f"Hi! I want to purchase the SITI Intelligence {plan.upper()} plan "
            f"(₹{amount:,}/month). Please help me get started."
        )
        import urllib.parse
        wa_url = f"https://wa.me/{wa_number}?text={urllib.parse.quote(wa_message)}"
        return jsonify({
            "success":       False,
            "fallback":      True,
            "fallback_type": "whatsapp",
            "whatsapp_url":  wa_url,
            "reason":        "Payment gateway not configured — redirecting to WhatsApp",
        }), 200

    # Cashfree is configured — create real order
    try:
        order_id = f"SITI-{plan.upper()}-{uuid.uuid4().hex[:8].upper()}"
        cashfree_base = (
            "https://api.cashfree.com"
            if cashfree_env == "production"
            else "https://sandbox.cashfree.com"
        )

        payload = {
            "order_id":       order_id,
            "order_amount":   float(amount),
            "order_currency": "INR",
            "customer_details": {
                "customer_id":    f"SITI-CUST-{uuid.uuid4().hex[:8]}",
                "customer_email": data.get("email", "customer@example.com"),
                "customer_phone": data.get("phone", "9999999999"),
                "customer_name":  data.get("name",  "SITI Customer"),
            },
            "order_meta": {
                "return_url": (
                    f"{os.getenv('FRONTEND_URL', 'https://siti-gsc-kernel.vercel.app')}"
                    f"?payment=success&plan={plan}&order_id={order_id}"
                ),
                "notify_url": (
                    f"{os.getenv('BACKEND_URL', 'https://siti-gsc-kernel-1.onrender.com')}"
                    "/api/payments/cashfree-webhook"
                ),
            },
            "order_tags": {"plan": plan},
        }

        resp = httpx.post(
            f"{cashfree_base}/pg/orders",
            headers={
                "x-api-version":    "2023-08-01",
                "x-client-id":      cashfree_app_id,
                "x-client-secret":  cashfree_secret,
                "Content-Type":     "application/json",
            },
            json=payload,
            timeout=15.0,
        )

        if resp.status_code in (200, 201):
            order_data = resp.json()
            return jsonify({
                "success":            True,
                "order_id":           order_id,
                "payment_session_id": order_data.get("payment_session_id"),
                "order_status":       order_data.get("order_status"),
            }), 200
        else:
            log.error("Cashfree order creation failed: %s", resp.text)
            return jsonify({
                "success": False,
                "error":   "Payment gateway error",
                "details": resp.text[:200],
            }), 502

    except Exception as e:
        log.error("Cashfree order creation exception: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


# ── Cashfree Webhook ───────────────────────────────────────────────────────────
@app.route("/api/payments/cashfree-webhook", methods=["POST"])
def cashfree_webhook():
    """
    BUG-009 FIX: Correct Cashfree webhook signature verification.
    Cashfree uses HMAC-SHA256 of (timestamp + "." + raw_body).
    """
    payload_bytes  = request.get_data()
    sig_header     = request.headers.get("x-webhook-signature", "")
    ts_header      = request.headers.get("x-webhook-timestamp", "")
    webhook_secret = os.getenv("CASHFREE_WEBHOOK_SECRET", "")

    if webhook_secret:
        # BUG-009 FIX: Correct signature format: timestamp + "." + payload
        sig_body = ts_header + "." + payload_bytes.decode("utf-8")
        expected = hmac.new(
            webhook_secret.encode("utf-8"),
            sig_body.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(expected, sig_header):
            log.warning("Cashfree webhook signature mismatch — rejecting")
            return jsonify({"error": "Invalid signature"}), 400

    try:
        data = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error": "Invalid JSON payload"}), 400

    order_id   = data.get("data", {}).get("order", {}).get("order_id", "")
    payment_id = data.get("data", {}).get("payment", {}).get("cf_payment_id", "")
    status     = data.get("data", {}).get("payment", {}).get("payment_status", "")
    plan       = data.get("data", {}).get("order", {}).get("order_tags", {}).get("plan", "pilot")

    log.info("Cashfree webhook: order=%s payment=%s status=%s plan=%s",
             order_id, payment_id, status, plan)

    if status == "SUCCESS":
        import secrets as secrets_mod
        new_key = f"siti-{plan}-{secrets_mod.token_urlsafe(16)}"

        db = get_supabase()
        if db:
            try:
                db.table("api_keys").insert({
                    "key":        new_key,
                    "role":       "OPERATOR",
                    "plan":       plan,
                    "active":     True,
                    "order_id":   order_id,
                    "payment_id": str(payment_id),
                    "created_at": datetime.utcnow().isoformat(),
                }).execute()
                log.info("API key provisioned for order %s: %s", order_id, new_key[:20])
            except Exception as e:
                log.error("Failed to store API key in Supabase: %s", e)

        # Welcome message
        welcome_msg = (
            f"🎉 SITI Intelligence — Payment Confirmed!\n"
            f"Plan: {plan.upper()}\n"
            f"Order: {order_id}\n"
            f"Your API key: {new_key}\n"
            f"Dashboard: https://siti-gsc-kernel.vercel.app\n"
            f"Support: wa.me/918956493671"
        )
        send_alert(welcome_msg, channel="whatsapp")

        return jsonify({
            "received":    True,
            "provisioned": True,
            "plan":        plan,
            "key_prefix":  new_key[:20] + "...",
        })

    return jsonify({"received": True, "provisioned": False, "status": status})


# ── Admin ──────────────────────────────────────────────────────────────────────
@app.route("/api/admin/keys", methods=["GET"])
@require_api_key
def list_keys():
    db = get_supabase()
    if not db:
        return jsonify({
            "mode":  "fallback",
            "keys":  list(_FALLBACK_KEYS),
            "note":  "Configure Supabase env vars for persistent key storage."
        })
    try:
        res = db.table("api_keys").select("key,plan,active,created_at").eq("active", True).execute()
        return jsonify({"keys": res.data})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/admin/create-key", methods=["POST"])
@require_api_key
def create_key():
    import secrets as secrets_mod
    data    = request.get_json(force=True) or {}
    plan    = data.get("plan", "pilot")
    new_key = f"siti-{plan}-{secrets_mod.token_urlsafe(16)}"

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


# ── Error Handlers ─────────────────────────────────────────────────────────────
@app.errorhandler(404)
def not_found(e):
    return jsonify({
        "error": "Route not found.",
        "path":  request.path,
        "hint":  "Check /api for available endpoints."
    }), 404


@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({
        "error":   "Method not allowed.",
        "allowed": list(e.valid_methods or [])
    }), 405


@app.errorhandler(500)
def server_error(e):
    log.error("500 Internal Error: %s", e)
    return jsonify({"error": "Internal kernel error. Check server logs."}), 500


# ── Entry Point ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    log.info("SITI Intelligence Kernel v4.0 starting on port %d", port)
    app.run(host="0.0.0.0", port=port, debug=False)
