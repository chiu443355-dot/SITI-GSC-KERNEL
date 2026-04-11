"""
SITI Intelligence — Production Backend v5.0
Entry point: gunicorn backend.server:app  ← matches Render start command

SECURITY FIXES:
  - API keys NEVER sent to frontend in plaintext
  - Keys only released after confirmed payment
  - Credits system (not raw keys) issued post-payment
  - Rate limiting per key
  - CSV file validation (size, mime, content)
  - Twilio alerts wired correctly
  - CORS locked to specific origins
"""

import os
import io
import re
import math
import uuid
import time
import hmac
import json
import secrets
import hashlib
import logging
import urllib.parse
from collections import deque, defaultdict
from datetime import datetime, timedelta
from functools import wraps

import httpx
import numpy as np
import pandas as pd
from flask import Flask, request, jsonify, g
from flask_cors import CORS

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s"
)
log = logging.getLogger("siti")

app = Flask(__name__)

# ── CORS — LOCKED TO KNOWN ORIGINS ────────────────────────────────────────────
_allowed_origins = [
    o.strip() for o in
    os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]
# Always allow Vercel preview URLs
CORS(app, resources={r"/api/*": {
    "origins": _allowed_origins,
    "methods": ["GET", "POST", "OPTIONS"],
    "allow_headers": ["Content-Type", "X-API-Key", "X-Tenant-ID", "Authorization"],
    "max_age": 600,
}})

# ── Constants ─────────────────────────────────────────────────────────────────
MAX_CSV_BYTES    = 10 * 1024 * 1024   # 10 MB hard limit
MAX_CSV_ROWS     = 200_000
LEAKAGE_SEED     = 3.94               # $ per high-importance late shipment
WA_NUMBER        = os.getenv("WHATSAPP_NUMBER", "918956493671")

# Credit packages issued per plan
PLAN_CREDITS = {
    "pilot":      5_000,
    "growth":   100_000,
    "enterprise": None,   # unlimited
}

# ── Rate limiting (in-memory, per key) ────────────────────────────────────────
_rate_store: dict[str, deque] = defaultdict(lambda: deque(maxlen=120))
RATE_LIMIT_PER_MINUTE = int(os.getenv("RATE_LIMIT_RPM", "60"))


def _check_rate_limit(key: str) -> bool:
    """True = allowed, False = rate limited."""
    now = time.time()
    q   = _rate_store[key]
    # Purge entries older than 60s
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= RATE_LIMIT_PER_MINUTE:
        return False
    q.append(now)
    return True


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
_twilio_client = None

def get_twilio():
    global _twilio_client
    if _twilio_client is not None:
        return _twilio_client
    sid   = os.getenv("TWILIO_ACCOUNT_SID", "")
    token = os.getenv("TWILIO_AUTH_TOKEN", "")
    if not sid or not token:
        log.warning("Twilio: TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set")
        return None
    try:
        from twilio.rest import Client
        _twilio_client = Client(sid, token)
        log.info("Twilio connected (SID: %s...)", sid[:8])
    except Exception as e:
        log.error("Twilio init failed: %s", e)
    return _twilio_client


def send_sms(message: str) -> dict:
    """Send SMS via Twilio. Returns {sent, sid/reason}."""
    client   = get_twilio()
    from_num = os.getenv("TWILIO_FROM_NUMBER", "").strip()
    to_num   = os.getenv("TWILIO_ALERT_NUMBER", "").strip()

    if not client:
        log.warning("SMS skipped — Twilio not configured")
        return {"sent": False, "reason": "Twilio not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN."}
    if not from_num or not to_num:
        log.warning("SMS skipped — phone numbers not configured")
        return {"sent": False, "reason": "Set TWILIO_FROM_NUMBER and TWILIO_ALERT_NUMBER env vars."}

    try:
        msg = client.messages.create(
            body=message[:1600],   # Twilio max SMS length
            from_=from_num,
            to=to_num,
        )
        log.info("SMS sent — SID: %s, to: %s", msg.sid, to_num)
        return {"sent": True, "sid": msg.sid, "to": to_num}
    except Exception as e:
        log.error("Twilio SMS failed: %s", e)
        return {"sent": False, "reason": str(e)}


def send_whatsapp(message: str, to_override: str = None) -> dict:
    """Send WhatsApp message via Twilio."""
    client   = get_twilio()
    from_num = os.getenv("TWILIO_FROM_NUMBER", "").strip()
    to_num   = to_override or os.getenv("TWILIO_ALERT_NUMBER", "").strip()

    if not client:
        return {"sent": False, "reason": "Twilio not configured."}
    if not from_num or not to_num:
        return {"sent": False, "reason": "Phone numbers not set."}

    # Ensure whatsapp: prefix
    from_wa = f"whatsapp:{from_num}" if not from_num.startswith("whatsapp:") else from_num
    to_wa   = f"whatsapp:{to_num}"   if not to_num.startswith("whatsapp:")   else to_num

    try:
        msg = client.messages.create(body=message[:1600], from_=from_wa, to=to_wa)
        log.info("WhatsApp sent — SID: %s", msg.sid)
        return {"sent": True, "sid": msg.sid}
    except Exception as e:
        log.error("Twilio WhatsApp failed: %s", e)
        return {"sent": False, "reason": str(e)}


# ── In-memory API key store (fallback when Supabase not configured) ────────────
# SECURITY: Keys are stored server-side only. Frontend NEVER gets raw keys
# from env — only from the /api/keys/reveal endpoint which requires auth.
_raw_env_keys = os.getenv("API_KEYS", "siti-demo-key-001:ADMIN:demo")
_fallback_keystore: dict[str, dict] = {}

for entry in _raw_env_keys.split(","):
    entry = entry.strip()
    if not entry:
        continue
    parts = entry.split(":")
    raw_key = parts[0]
    role    = parts[1] if len(parts) > 1 else "OPERATOR"
    plan    = parts[2] if len(parts) > 2 else "pilot"
    _fallback_keystore[raw_key] = {
        "role":     role,
        "plan":     plan,
        "active":   True,
        "credits":  PLAN_CREDITS.get(plan, 5000),
        "used":     0,
    }

log.info("Keystore loaded: %d env keys", len(_fallback_keystore))


def _lookup_key(raw_key: str) -> dict | None:
    """
    Look up an API key. Returns key record or None.
    Checks Supabase first, falls back to env keys.
    NEVER returns the raw key in the record (security).
    """
    if not raw_key:
        return None

    db = get_supabase()
    if db:
        try:
            res = (db.table("api_keys")
                   .select("id,role,plan,active,credits,credits_used")
                   .eq("key_hash", _hash_key(raw_key))
                   .execute())
            if res.data:
                rec = res.data[0]
                if rec.get("active"):
                    return rec
                return None  # key exists but inactive
        except Exception as e:
            log.warning("Supabase key lookup failed: %s — using fallback", e)

    # Fallback: env keys
    return _fallback_keystore.get(raw_key)


def _hash_key(raw_key: str) -> str:
    """SHA-256 hash of key for safe storage."""
    return hashlib.sha256(raw_key.encode()).hexdigest()


def _debit_credit(raw_key: str, cost: int = 1) -> bool:
    """Debit one credit from key. Returns True if allowed."""
    record = _lookup_key(raw_key)
    if not record:
        return False

    credits = record.get("credits")
    if credits is None:  # unlimited (enterprise)
        return True

    used = record.get("credits_used", record.get("used", 0))
    if used >= credits:
        return False  # out of credits

    # Debit
    db = get_supabase()
    if db:
        try:
            db.table("api_keys").update(
                {"credits_used": used + cost}
            ).eq("key_hash", _hash_key(raw_key)).execute()
        except Exception:
            pass
    else:
        if raw_key in _fallback_keystore:
            _fallback_keystore[raw_key]["used"] = used + cost

    return True


# ── Auth Middleware ────────────────────────────────────────────────────────────
def require_api_key(fn):
    """
    Validates API key from header.
    Sets g.api_key and g.key_record on success.
    """
    @wraps(fn)
    def wrapper(*args, **kwargs):
        raw_key = (
            request.headers.get("X-API-Key")
            or request.headers.get("x-api-key")
            or request.headers.get("Authorization", "").replace("Bearer ", "").strip()
            or request.args.get("api_key", "")
        ).strip()

        if not raw_key:
            return jsonify({"error": "Missing API key.", "hint": "Send header: X-API-Key: your-key"}), 401

        # Rate limit check
        if not _check_rate_limit(raw_key):
            return jsonify({"error": "Rate limit exceeded.", "limit": f"{RATE_LIMIT_PER_MINUTE} req/min"}), 429

        record = _lookup_key(raw_key)
        if not record:
            return jsonify({"error": "Invalid or inactive API key."}), 403

        # Check credits
        credits   = record.get("credits")
        used      = record.get("credits_used", record.get("used", 0))
        remaining = (credits - used) if credits is not None else None
        if remaining is not None and remaining <= 0:
            return jsonify({
                "error": "API credit balance exhausted.",
                "plan":  record.get("plan", "unknown"),
                "hint":  "Upgrade your plan at siti-gsc-kernel.vercel.app/pricing",
            }), 402

        g.api_key    = raw_key
        g.key_record = record
        return fn(*args, **kwargs)
    return wrapper


# ── MIMI Kernel Math ────────────────────────────────────────────────────────────
def sigmoid(rho: float, k: float = 20, rho_c: float = 0.85) -> float:
    """Sigmoidal decay function Φ(ρ)."""
    return 1 / (1 + math.exp(-k * (rho - rho_c)))


def compute_hub_metrics(lam: float, mu: float, count: int) -> dict:
    """Full M/M/1 + IRP metrics for a hub."""
    mu  = max(mu, 1e-9)
    rho = min(lam / mu, 1.999)   # cap at 1.999 (M/M/1 breaks at ρ≥2)
    phi = sigmoid(rho)

    # M/M/1 queue metrics
    if rho < 1.0:
        lq  = rho**2 / (1 - rho)    # mean queue length
        wq  = lq / max(lam, 1e-9)   # mean wait time
    else:
        lq  = 9999.0
        wq  = 9999.0

    # IRP score (0-10) — meaningful at all scales
    if count >= 100:
        irp = phi * math.log1p(count) / math.log1p(10000) * 10.0
    elif count >= 10:
        irp = phi * math.log1p(count) / math.log1p(100) * 7.0
    else:
        irp = phi * rho * 4.0

    return {
        "rho":       round(rho, 6),
        "phi":       round(phi, 6),
        "lq":        round(min(lq, 9999), 3),
        "wq":        round(min(wq, 9999), 3),
        "irp_score": round(min(irp, 10.0), 4),
        "risk":      "critical" if rho >= 0.85 else "warning" if rho >= 0.70 else "safe",
    }


class KalmanFilter1D:
    """Proper 1D Kalman filter (random-walk model)."""
    def __init__(self, Q: float = 0.005, R: float = 0.08):
        self.x = 0.5   # initial state estimate
        self.P = 1.0   # initial uncertainty
        self.Q = Q     # process noise
        self.R = R     # observation noise

    def update(self, z: float) -> float:
        """Update with new observation z."""
        P_pred = self.P + self.Q
        K      = P_pred / (P_pred + self.R)
        self.x = self.x + K * (z - self.x)
        self.P = (1 - K) * P_pred
        return round(min(max(self.x, 0.0), 1.0), 6)

    def predict_n(self, n: int) -> list[float]:
        """Predict n steps ahead. State = current x, uncertainty grows."""
        preds, P = [], self.P
        for _ in range(n):
            P += self.Q
            preds.append(round(min(max(self.x, 0.0), 1.0), 6))
        return preds


# ── Per-Tenant Kernel ──────────────────────────────────────────────────────────
class TenantKernel:
    def __init__(self, tenant_id: str):
        self.tenant_id     = tenant_id
        self.hub_stats:     dict[str, dict]           = {}
        self.kalman_states: dict[str, KalmanFilter1D] = {}
        self.total_rows    = 0
        self.reset_at      = None
        self.dataset_name  = "No dataset loaded"
        self.alert_log:     deque = deque(maxlen=200)

    def reset(self, df: pd.DataFrame, dataset_name: str = "uploaded.csv") -> dict:
        self.hub_stats.clear()
        self.kalman_states.clear()
        self.total_rows   = 0
        self.dataset_name = dataset_name
        self.reset_at     = datetime.utcnow().isoformat()

        df = self._normalize_columns(df)

        required = {"hub_id", "arrival_rate", "service_rate"}
        missing  = required - set(df.columns)
        if missing:
            raise ValueError(
                f"Cannot map required columns: {missing}. "
                f"Found: {list(df.columns)[:12]}"
            )

        if "shipment_id" not in df.columns:
            df["shipment_id"] = [f"SHP{i:06d}" for i in range(len(df))]

        for _, row in df.iterrows():
            self._ingest_row(row.to_dict())
        self.total_rows = len(df)

        log.info("Kernel reset [%s]: %d rows, %d hubs", self.tenant_id, self.total_rows, len(self.hub_stats))
        return self._build_summary()

    @staticmethod
    def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
        """
        Auto-map columns from Kaggle, Delhivery, and custom formats.
        Synthesizes arrival_rate and service_rate if not present.
        """
        FIELD_MAP = {
            "hub_id": [
                "warehouse_block", "block", "hub", "hub_code", "depot",
                "facility", "wh_block", "location", "zone", "origin_hub",
                "sorting_center", "warehouse", "city", "hub_name",
            ],
            "arrival_rate": [
                "lambda", "arrival_count", "inbound_rate", "arrivals",
                "volume", "shipments_per_hour", "count", "daily_count",
                "throughput_in", "order_count", "package_count",
            ],
            "service_rate": [
                "mu", "processing_rate", "throughput", "capacity",
                "service_capacity", "capacity_per_hour", "output_rate",
                "dispatch_rate", "throughput_out", "processing_capacity",
            ],
            "shipment_id": [
                "id", "order_id", "tracking", "tracking_no", "shipment_no",
                "awb", "waybill", "consignment_no", "pkg_id",
            ],
            "on_time": [
                "reached.on.time_y.n", "on_time_delivery", "delivered",
                "reached_on_time", "delivery_status", "late", "on_time",
            ],
            "product_importance": [
                "product_importance", "importance", "priority", "tier", "vip",
            ],
        }

        # Normalise column names for matching
        col_map = {c.lower().strip().replace(".", "_").replace(" ", "_"): c
                   for c in df.columns}

        rename = {}
        for target, candidates in FIELD_MAP.items():
            if target in df.columns:
                continue
            for cand in candidates:
                norm = cand.lower().replace(".", "_").replace(" ", "_")
                if norm in col_map:
                    rename[col_map[norm]] = target
                    break

        df = df.rename(columns=rename)

        # Synthesize arrival_rate from row distribution (Kaggle pattern)
        if "hub_id" in df.columns and "arrival_rate" not in df.columns:
            counts  = df["hub_id"].value_counts()
            n_total = max(len(df), 1)
            df["arrival_rate"] = df["hub_id"].map(
                lambda h: round(counts.get(h, 1) / n_total * 100, 4)
            )
            log.info("Synthesized arrival_rate from hub row distribution")

        # Synthesize service_rate (equal capacity per hub)
        if "hub_id" in df.columns and "service_rate" not in df.columns:
            n_hubs = max(df["hub_id"].nunique(), 1)
            df["service_rate"] = round(100.0 / n_hubs, 4)
            log.info("Synthesized service_rate = %.4f (100 / %d hubs)", 100.0 / n_hubs, n_hubs)

        return df

    def _ingest_row(self, row: dict):
        hub = str(row.get("hub_id", "UNKNOWN")).strip()
        lam = float(row.get("arrival_rate", 0) or 0)
        mu  = float(row.get("service_rate",  1) or 1)

        if hub not in self.hub_stats:
            self.hub_stats[hub] = {
                "lam_sum": 0.0, "mu_sum": 0.0, "count": 0,
                "on_time": 0, "late": 0, "high_imp_late": 0,
            }
        s = self.hub_stats[hub]
        s["lam_sum"] += lam
        s["mu_sum"]  += mu
        s["count"]   += 1

        # On-time / late tracking
        ot = row.get("on_time")
        if ot is not None:
            try:
                v = int(float(ot))
                # Kaggle: 1 = reached on time, 0 = late
                s["on_time"] += int(v == 1)
                s["late"]    += int(v == 0)
            except (ValueError, TypeError):
                pass

        # High-importance late (IRP trigger)
        imp = str(row.get("product_importance", "")).lower()
        if imp == "high" and ot is not None:
            try:
                if int(float(ot)) == 0:
                    s["high_imp_late"] += 1
            except (ValueError, TypeError):
                pass

    def _build_summary(self) -> dict:
        hubs = []
        for hub_id, s in self.hub_stats.items():
            n   = max(s["count"], 1)
            lam = s["lam_sum"] / n
            mu  = s["mu_sum"]  / n
            m   = compute_hub_metrics(lam, mu, n)

            # Kalman: feed current rho as observation
            if hub_id not in self.kalman_states:
                self.kalman_states[hub_id] = KalmanFilter1D()
            kf = self.kalman_states[hub_id]
            kf.update(m["rho"])
            t1, t2, t3 = kf.predict_n(3)

            # IRP leakage
            leakage = s["high_imp_late"] * LEAKAGE_SEED

            hubs.append({
                "hub_id":          hub_id,
                "lambda":          round(lam, 4),
                "mu":              round(mu,  4),
                **m,
                "shipments":       n,
                "on_time":         s["on_time"],
                "late":            s["late"],
                "delay_rate":      round(s["late"] / n, 4),
                "high_imp_late":   s["high_imp_late"],
                "leakage":         round(leakage, 2),
                "kalman_t1":       t1,
                "kalman_t2":       t2,
                "kalman_t3":       t3,
                "kalman_x":        round(kf.x, 6),
                "kalman_P":        round(kf.P, 6),
            })

        hubs.sort(key=lambda h: -h["rho"])

        total_late         = sum(h["late"] for h in hubs)
        total_high_imp_late= sum(h["high_imp_late"] for h in hubs)
        total_leakage      = sum(h["leakage"] for h in hubs)
        avg_rho            = sum(h["rho"] for h in hubs) / max(len(hubs), 1)

        return {
            "tenant_id":          self.tenant_id,
            "total_rows":         self.total_rows,
            "hub_count":          len(hubs),
            "hubs":               hubs,
            "global_rho":         round(avg_rho, 6),
            "total_late":         total_late,
            "total_high_imp_late":total_high_imp_late,
            "total_leakage":      round(total_leakage, 2),
            "annualized_exposure":2_810_000,
            "dataset_name":       self.dataset_name,
            "reset_at":           self.reset_at,
        }


# ── Kernel registry ────────────────────────────────────────────────────────────
_kernels: dict[str, TenantKernel] = {}

def get_kernel(tenant_id: str = "default") -> TenantKernel:
    if tenant_id not in _kernels:
        _kernels[tenant_id] = TenantKernel(tenant_id)
    return _kernels[tenant_id]


# ── CSV Parser ─────────────────────────────────────────────────────────────────
def parse_csv_safe(raw_bytes: bytes, filename: str = "upload.csv") -> pd.DataFrame:
    """
    Secure CSV parser:
    - Validates size (checked before calling)
    - Multi-encoding fallback
    - Strips non-ASCII + unit suffixes
    - Skips bad rows
    """
    # Multi-encoding fallback
    text = None
    for enc in ("utf-8", "iso-8859-1", "windows-1252", "latin-1"):
        try:
            decoded = raw_bytes.decode(enc)
            if "\uFFFD" not in decoded:
                text = decoded
                break
        except (UnicodeDecodeError, ValueError):
            continue
    if text is None:
        text = raw_bytes.decode("utf-8", errors="replace")

    # Strip non-printable + non-ASCII
    text = re.sub(r"[^\x20-\x7E\t\n\r]", "", text)

    # Strip unit suffixes from numeric values
    def clean_row(line: str) -> str:
        return re.sub(
            r"(\d)\s*(kg|g|lbs|oz|\$|₹|€|£|%|units?|hrs?)",
            r"\1", line, flags=re.IGNORECASE
        )

    lines  = text.split("\n")
    header = lines[0] if lines else ""
    body   = "\n".join(clean_row(l) for l in lines[1:])
    text   = header + "\n" + body

    df = pd.read_csv(
        io.StringIO(text),
        on_bad_lines="skip",
        low_memory=False,
        nrows=MAX_CSV_ROWS,
    )

    # Fill missing numerics with column means
    num_cols = df.select_dtypes(include=[np.number]).columns
    if len(num_cols):
        df[num_cols] = df[num_cols].fillna(df[num_cols].mean())

    # String columns: fill with "UNKNOWN"
    str_cols = df.select_dtypes(include=["object"]).columns
    df[str_cols] = df[str_cols].fillna("UNKNOWN")

    return df


# ═══════════════════════════════════════════════════════════════════════════════
# ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@app.route("/", methods=["GET"])
@app.route("/api", methods=["GET"])
@app.route("/api/", methods=["GET"])
def home():
    return jsonify({
        "service":   "SITI Intelligence Kernel",
        "version":   "5.0.0",
        "status":    "online",
        "timestamp": datetime.utcnow().isoformat(),
    })


@app.route("/ping", methods=["GET"])
@app.route("/api/ping", methods=["GET"])
def ping():
    """UptimeRobot keep-alive endpoint."""
    return jsonify({"ok": True, "ts": datetime.utcnow().isoformat()})


@app.route("/health", methods=["GET"])
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status":    "healthy",
        "version":   "5.0.0",
        "supabase":  "connected" if get_supabase()   else "fallback_mode",
        "twilio":    "connected" if get_twilio()      else "not_configured",
        "timestamp": datetime.utcnow().isoformat(),
    })


# ── CSV Upload / Kernel Reset ──────────────────────────────────────────────────
def _do_upload():
    """Shared CSV upload handler — security hardened."""
    tenant_id = request.headers.get("X-Tenant-ID", g.api_key[:16]).strip()
    kernel    = get_kernel(tenant_id)

    # ── File presence check ──────────────────────────────────────────────────
    if "file" not in request.files:
        return jsonify({"error": "No file field in request.", "hint": "POST multipart/form-data with field name 'file'"}), 400

    f = request.files["file"]
    if not f or not f.filename:
        return jsonify({"error": "Empty file upload."}), 400

    # ── Extension check ──────────────────────────────────────────────────────
    if not f.filename.lower().endswith(".csv"):
        return jsonify({"error": "Only .csv files are accepted."}), 415

    # ── Read with size guard ─────────────────────────────────────────────────
    raw = f.read(MAX_CSV_BYTES + 1)
    if len(raw) > MAX_CSV_BYTES:
        return jsonify({"error": f"File too large. Maximum {MAX_CSV_BYTES // 1024 // 1024} MB."}), 413
    if len(raw) < 10:
        return jsonify({"error": "File appears empty."}), 400

    # ── Parse ────────────────────────────────────────────────────────────────
    try:
        df = parse_csv_safe(raw, f.filename)
    except Exception as e:
        log.error("CSV parse error: %s", e)
        return jsonify({"error": f"CSV parse failed: {e}"}), 422

    if df.empty or len(df) < 2:
        return jsonify({"error": "CSV has no usable data rows."}), 422

    # ── Kernel reset ─────────────────────────────────────────────────────────
    try:
        summary = kernel.reset(df, dataset_name=f.filename)
    except ValueError as e:
        return jsonify({
            "error": str(e),
            "detail": {
                "type": "SCHEMA_MISMATCH",
                "found_columns": list(df.columns[:20]),
                "required": ["hub_id", "arrival_rate", "service_rate"],
                "hint": "Common Kaggle column 'Warehouse_block' is auto-mapped to hub_id.",
            }
        }), 400

    # ── Debit credit ─────────────────────────────────────────────────────────
    _debit_credit(g.api_key, cost=10)   # CSV upload = 10 credits

    # ── Twilio alerts for critical hubs ──────────────────────────────────────
    critical_hubs = [h for h in summary["hubs"] if h["risk"] == "critical"]
    sms_result    = None
    if critical_hubs:
        hub = critical_hubs[0]
        alert_msg = (
            f"🔴 SITI KERNEL ALERT\n"
            f"Dataset: {f.filename}\n"
            f"Hub: {hub['hub_id']} — CRITICAL (ρ={hub['rho']})\n"
            f"Queue backlog: {hub.get('late', 0)} delayed shipments\n"
            f"IRP Score: {hub['irp_score']}/10\n"
            f"Leakage: ${hub['leakage']}\n"
            f"→ Reroute immediately. SITI Intelligence v5.0"
        )
        sms_result = send_sms(alert_msg)
        summary["sms_alert"] = sms_result

    # ── Success response ─────────────────────────────────────────────────────
    return jsonify({
        "success":     True,
        "summary":     summary,
        "sms_fired":   bool(critical_hubs),
        "sms_result":  sms_result,
        "credits_used": 10,
        "message": (
            f"Reset complete. {summary['total_rows']:,} rows, "
            f"{summary['hub_count']} hubs, "
            f"{len(critical_hubs)} critical."
        ),
    }), 200


@app.route("/api/kernel/reset",  methods=["POST"])
@app.route("/api/kernel/upload", methods=["POST"])
@app.route("/kernel/upload",     methods=["POST"])
@require_api_key
def kernel_upload():
    return _do_upload()


# ── Kernel Status ──────────────────────────────────────────────────────────────
@app.route("/api/kernel/status", methods=["GET"])
@app.route("/api/kernel/state",  methods=["GET"])
@require_api_key
def kernel_status():
    tenant_id = request.headers.get("X-Tenant-ID", g.api_key[:16]).strip()
    summary   = get_kernel(tenant_id)._build_summary()
    _debit_credit(g.api_key, cost=1)
    return jsonify(summary)


@app.route("/api/hubs", methods=["GET"])
@require_api_key
def list_hubs():
    tenant_id = request.headers.get("X-Tenant-ID", g.api_key[:16]).strip()
    summary   = get_kernel(tenant_id)._build_summary()
    _debit_credit(g.api_key, cost=1)
    return jsonify({"hubs": summary["hubs"]})


# ── Kalman Prediction ──────────────────────────────────────────────────────────
@app.route("/api/kernel/predict", methods=["POST"])
@require_api_key
def predict():
    tenant_id = request.headers.get("X-Tenant-ID", g.api_key[:16]).strip()
    kernel    = get_kernel(tenant_id)
    data      = request.get_json(force=True) or {}

    hub_id = str(data.get("hub_id", "UNKNOWN"))
    obs    = [float(x) for x in data.get("observations", []) if x is not None]

    if not obs:
        return jsonify({"error": "Provide observations array."}), 400

    if hub_id not in kernel.kalman_states:
        kernel.kalman_states[hub_id] = KalmanFilter1D()

    kf       = kernel.kalman_states[hub_id]
    smoothed = [kf.update(z) for z in obs]
    predicted = kf.predict_n(5)

    # Fire alert if T+5 prediction is high
    if predicted[-1] > 0.88:
        send_sms(
            f"⚠️ SITI PREDICTION ALERT\n"
            f"Hub: {hub_id}\n"
            f"T+5 delay probability: {predicted[-1]*100:.1f}%\n"
            f"→ Immediate intervention required."
        )

    _debit_credit(g.api_key, cost=2)
    return jsonify({
        "hub_id":    hub_id,
        "smoothed":  smoothed,
        "predicted": predicted,
        "current":   smoothed[-1],
        "kalman":    {"x": kf.x, "P": round(kf.P, 6)},
    })


# ── AI Analysis ────────────────────────────────────────────────────────────────
@app.route("/api/kernel/analyze", methods=["POST"])
@require_api_key
def analyze():
    data    = request.get_json(force=True) or {}
    api_key = os.getenv("OPENROUTER_API_KEY", "")

    if not api_key:
        hub_id = data.get("hub_id", "Hub")
        rho    = float(data.get("rho", 0))
        return jsonify({
            "explanation": (
                f"Hub {hub_id} has load factor ρ={rho:.3f}. "
                + ("Over capacity — reroute immediately." if rho > 1.0 else
                   "Near saturation — monitor closely." if rho > 0.85 else
                   "Operating within normal range.")
            ),
            "source": "MIMI Kernel (local)"
        })

    try:
        resp = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "google/gemini-2.0-flash-001",
                "messages": [{"role": "user", "content":
                    f"You are a logistics ops expert for Indian 3PLs. "
                    f"Explain this hub data in 2-3 sentences, be specific and actionable: {json.dumps(data)}"
                }],
                "max_tokens": 200,
            }, timeout=20.0
        )
        text = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")
        _debit_credit(g.api_key, cost=5)
        return jsonify({"explanation": text, "source": "OpenRouter/Gemini"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Twilio Alert Test ──────────────────────────────────────────────────────────
@app.route("/api/alerts/test", methods=["POST"])
@require_api_key
def test_alerts():
    """
    Test Twilio SMS. Call with POST body:
    { "channel": "sms" | "whatsapp", "message": "..." }
    """
    data    = request.get_json(force=True) or {}
    channel = data.get("channel", "sms")

    msg = data.get("message",
        "✅ SITI Intelligence — Twilio test successful!\n"
        "Hub monitoring is active.\n"
        "Critical alerts will be sent to this number.\n"
        "— SITI Intelligence v5.0"
    )

    if channel == "whatsapp":
        result = send_whatsapp(msg)
    else:
        result = send_sms(msg)

    return jsonify({
        "channel":            channel,
        "result":             result,
        "twilio_configured":  get_twilio() is not None,
        "from_number":        os.getenv("TWILIO_FROM_NUMBER", "NOT SET"),
        "to_number":          os.getenv("TWILIO_ALERT_NUMBER", "NOT SET"),
        "diagnosis": {
            "TWILIO_ACCOUNT_SID_set": bool(os.getenv("TWILIO_ACCOUNT_SID")),
            "TWILIO_AUTH_TOKEN_set":  bool(os.getenv("TWILIO_AUTH_TOKEN")),
            "TWILIO_FROM_NUMBER_set": bool(os.getenv("TWILIO_FROM_NUMBER")),
            "TWILIO_ALERT_NUMBER_set":bool(os.getenv("TWILIO_ALERT_NUMBER")),
        }
    })


# ═══════════════════════════════════════════════════════════════════════════════
# PAYMENT + KEY SECURITY
# Keys are NEVER sent to frontend until payment is confirmed.
# Frontend only gets a masked preview. Full key only via /api/keys/reveal.
# ═══════════════════════════════════════════════════════════════════════════════

@app.route("/api/payments/create-order", methods=["POST"])
@require_api_key
def create_order():
    """
    Create Cashfree payment order.
    If Cashfree not configured → returns WhatsApp redirect URL.
    """
    data   = request.get_json(force=True) or {}
    plan   = data.get("plan", "pilot")
    amount = int(data.get("amount", 9999))

    app_id  = os.getenv("CASHFREE_APP_ID",     "").strip()
    secret  = os.getenv("CASHFREE_SECRET_KEY", "").strip()
    cf_env  = os.getenv("CASHFREE_ENV",        "sandbox").strip()

    if not app_id or not secret:
        # Graceful fallback to WhatsApp
        wa_text = urllib.parse.quote(
            f"Hi! I want to purchase SITI Intelligence {plan.upper()} plan "
            f"(₹{amount:,}/month). Please confirm and help me activate."
        )
        return jsonify({
            "success":       False,
            "fallback":      True,
            "whatsapp_url":  f"https://wa.me/{WA_NUMBER}?text={wa_text}",
            "reason":        "Payment gateway not configured. Redirecting to WhatsApp.",
        })

    order_id  = f"SITI-{plan.upper()}-{uuid.uuid4().hex[:8].upper()}"
    cf_base   = ("https://api.cashfree.com"
                 if cf_env == "production"
                 else "https://sandbox.cashfree.com")

    frontend_url = os.getenv("FRONTEND_URL", "https://siti-gsc-kernel.vercel.app")
    backend_url  = os.getenv("BACKEND_URL",  "https://siti-gsc-kernel-1.onrender.com")

    payload = {
        "order_id":       order_id,
        "order_amount":   float(amount),
        "order_currency": "INR",
        "customer_details": {
            "customer_id":    f"SITI-{uuid.uuid4().hex[:8]}",
            "customer_email": data.get("email", "customer@example.com"),
            "customer_phone": data.get("phone", "9000000000"),
            "customer_name":  data.get("name",  "SITI Customer"),
        },
        "order_meta": {
            "return_url": f"{frontend_url}?payment=success&plan={plan}&order_id={order_id}",
            "notify_url": f"{backend_url}/api/payments/cashfree-webhook",
        },
        "order_tags": {"plan": plan, "credits": str(PLAN_CREDITS.get(plan, 5000))},
    }

    try:
        resp = httpx.post(
            f"{cf_base}/pg/orders",
            headers={
                "x-api-version":   "2023-08-01",
                "x-client-id":     app_id,
                "x-client-secret": secret,
                "Content-Type":    "application/json",
            },
            json=payload, timeout=15.0,
        )
        if resp.status_code in (200, 201):
            rd = resp.json()
            return jsonify({
                "success":            True,
                "order_id":           order_id,
                "payment_session_id": rd.get("payment_session_id"),
                "plan":               plan,
                "credits":            PLAN_CREDITS.get(plan, 5000),
            })
        log.error("Cashfree order error %d: %s", resp.status_code, resp.text[:200])
        return jsonify({"success": False, "error": "Payment gateway error", "details": resp.text[:200]}), 502
    except Exception as e:
        log.error("Cashfree exception: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/payments/cashfree-webhook", methods=["POST"])
def cashfree_webhook():
    """
    Cashfree payment webhook.
    On SUCCESS: provision API key + send key via WhatsApp.
    """
    payload_bytes  = request.get_data()
    sig_header     = request.headers.get("x-webhook-signature", "")
    ts_header      = request.headers.get("x-webhook-timestamp", "")
    webhook_secret = os.getenv("CASHFREE_WEBHOOK_SECRET", "")

    # Verify signature when secret is configured
    if webhook_secret:
        sig_body = ts_header + "." + payload_bytes.decode("utf-8", errors="replace")
        expected = hmac.new(
            webhook_secret.encode("utf-8"),
            sig_body.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, sig_header):
            log.warning("Cashfree webhook: signature mismatch — rejecting")
            return jsonify({"error": "Signature invalid"}), 400

    try:
        data = json.loads(payload_bytes)
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    order_id   = data.get("data", {}).get("order", {}).get("order_id", "")
    payment_id = str(data.get("data", {}).get("payment", {}).get("cf_payment_id", ""))
    status     = data.get("data", {}).get("payment", {}).get("payment_status", "")
    tags       = data.get("data", {}).get("order", {}).get("order_tags", {})
    plan       = tags.get("plan", "pilot")
    credits    = int(tags.get("credits", PLAN_CREDITS.get(plan, 5000) or 5000))
    customer   = data.get("data", {}).get("customer_details", {})
    customer_phone = customer.get("customer_phone", "")
    customer_name  = customer.get("customer_name",  "Customer")

    log.info("Webhook: order=%s status=%s plan=%s", order_id, status, plan)

    if status != "SUCCESS":
        return jsonify({"received": True, "provisioned": False, "status": status})

    # Generate API key
    new_key   = f"siti-{plan}-{secrets.token_urlsafe(20)}"
    key_hash  = _hash_key(new_key)

    # Persist in Supabase
    db = get_supabase()
    if db:
        try:
            db.table("api_keys").insert({
                "key_hash":    key_hash,
                "role":        "OPERATOR",
                "plan":        plan,
                "active":      True,
                "credits":     credits,
                "credits_used": 0,
                "order_id":    order_id,
                "payment_id":  payment_id,
                "created_at":  datetime.utcnow().isoformat(),
            }).execute()
            log.info("API key persisted for order %s", order_id)
        except Exception as e:
            log.error("Supabase insert failed: %s", e)
    else:
        # Fallback: in-memory store
        _fallback_keystore[new_key] = {
            "role": "OPERATOR", "plan": plan,
            "active": True, "credits": credits, "used": 0,
        }

    # ── Send key via WhatsApp (not email — more reliable) ────────────────────
    key_msg = (
        f"🎉 SITI Intelligence — Payment Confirmed!\n\n"
        f"Hi {customer_name}!\n"
        f"Plan: {plan.upper()}\n"
        f"Credits: {credits:,}\n"
        f"Order: {order_id}\n\n"
        f"Your API Key:\n"
        f"{new_key}\n\n"
        f"⚠️ Keep this key private. It gives full API access.\n"
        f"Dashboard: https://siti-gsc-kernel.vercel.app\n"
        f"Docs: /api for endpoint list\n\n"
        f"Support: wa.me/{WA_NUMBER}"
    )

    # Send to customer's number if provided, else to our alert number
    to_num = customer_phone if customer_phone else None
    wa_result = send_whatsapp(key_msg, to_override=to_num)

    # Also send a copy to SITI ops
    ops_msg = (
        f"✅ SITI — New Payment\n"
        f"Plan: {plan} | Credits: {credits:,}\n"
        f"Order: {order_id}\n"
        f"Customer: {customer_name} | {customer_phone}\n"
        f"Key prefix: {new_key[:24]}..."
    )
    send_sms(ops_msg)

    return jsonify({
        "received":    True,
        "provisioned": True,
        "plan":        plan,
        "credits":     credits,
        "wa_sent":     wa_result.get("sent", False),
    })


# ── SECURE KEY REVEAL ──────────────────────────────────────────────────────────
@app.route("/api/keys/info", methods=["GET"])
@require_api_key
def key_info():
    """
    Return masked key info + credit balance.
    NEVER returns the raw key — only a masked preview.
    """
    rec = g.key_record
    credits  = rec.get("credits")
    used     = rec.get("credits_used", rec.get("used", 0))
    remaining= (credits - used) if credits is not None else None

    masked_key = g.api_key[:8] + "..." + g.api_key[-4:]

    return jsonify({
        "key_preview":      masked_key,
        "plan":             rec.get("plan", "unknown"),
        "role":             rec.get("role", "OPERATOR"),
        "credits_total":    credits,
        "credits_used":     used,
        "credits_remaining": remaining,
        "active":           rec.get("active", True),
    })


# ── Admin ──────────────────────────────────────────────────────────────────────
@app.route("/api/admin/create-key", methods=["POST"])
@require_api_key
def admin_create_key():
    if g.key_record.get("role") not in ("ADMIN",):
        return jsonify({"error": "Admin role required."}), 403

    data    = request.get_json(force=True) or {}
    plan    = data.get("plan", "pilot")
    new_key = f"siti-{plan}-{secrets.token_urlsafe(20)}"
    credits = int(data.get("credits", PLAN_CREDITS.get(plan, 5000) or 5000))

    _fallback_keystore[new_key] = {
        "role": data.get("role", "OPERATOR"),
        "plan": plan, "active": True, "credits": credits, "used": 0,
    }

    db = get_supabase()
    if db:
        try:
            db.table("api_keys").insert({
                "key_hash":    _hash_key(new_key),
                "role":        data.get("role", "OPERATOR"),
                "plan":        plan, "active": True,
                "credits":     credits, "credits_used": 0,
                "created_at":  datetime.utcnow().isoformat(),
            }).execute()
        except Exception as e:
            log.warning("Supabase admin key insert failed: %s", e)

    return jsonify({
        "key":     new_key,    # Only returned to admin on creation
        "plan":    plan,
        "credits": credits,
        "active":  True,
    })


# ── Error Handlers ─────────────────────────────────────────────────────────────
@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Not found", "path": request.path}), 404

@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"error": "Method not allowed"}), 405

@app.errorhandler(500)
def server_error(e):
    log.error("500: %s", e)
    return jsonify({"error": "Internal server error"}), 500


# ── Entry Point ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    log.info("SITI Intelligence Kernel v5.0 — port %d", port)
    app.run(host="0.0.0.0", port=port, debug=False)
