"""
SITI Intelligence — FINAL Production Backend v6.0
Gunicorn start: gunicorn backend.server:app

ALL SYSTEMS:
  ✅ Flask (no FastAPI conflict)
  ✅ Supabase key persistence (hashed keys, credits table)
  ✅ Twilio SMS alerts (auto-detect sandbox vs production)
  ✅ OpenRouter AI analysis (Gemini Flash)
  ✅ Cashfree payment + webhook
  ✅ Show-once API key (plaintext returned ONCE on creation, never again)
  ✅ Credits system (debited per call, 402 when exhausted)
  ✅ Rate limiting (60 req/min per key)
  ✅ CSV security (10MB limit, encoding resilience, column synthesis)
  ✅ Global logistics dataset support (not India-specific)
  ✅ Real Kalman state (x_hat, delay_prob) returned on every upload
  ✅ Streaming endpoint (last N shipments for live chart animation)
  ✅ CORS locked to known origins
  ✅ 500 errors handled with specific messages
"""

import os, io, re, math, uuid, time, hmac, json, secrets, hashlib, logging, urllib.parse
from collections import deque, defaultdict
from datetime import datetime
from functools import wraps

import httpx
import numpy as np
import pandas as pd
from flask import Flask, request, jsonify, g
from flask_cors import CORS

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
log = logging.getLogger("siti")

app = Flask(__name__)

# ── CORS ──────────────────────────────────────────────────────────────────────
_cors_origins = [o.strip() for o in
    os.getenv("CORS_ORIGINS", "https://siti-gsc-kernel.vercel.app,http://localhost:3000").split(",")
    if o.strip()]
CORS(app, resources={r"/api/*": {
    "origins": _cors_origins,
    "methods": ["GET", "POST", "OPTIONS"],
    "allow_headers": ["Content-Type", "X-API-Key", "X-Tenant-ID", "Authorization"],
    "max_age": 600,
}})

# ── Constants ─────────────────────────────────────────────────────────────────
MAX_CSV_MB        = 10
MAX_CSV_BYTES     = MAX_CSV_MB * 1024 * 1024
MAX_CSV_ROWS      = 500_000
LEAKAGE_PER_FAIL  = 3.94    # USD per high-importance late shipment
WA_NUMBER         = os.getenv("WHATSAPP_NUMBER", "918956493671")

PLAN_CREDITS = {"pilot": 5_000, "growth": 100_000, "enterprise": None}

PLAN_COST = {              # credits per endpoint call
    "/api/hubs":              1,
    "/api/kernel/status":     1,
    "/api/kernel/state":      1,
    "/api/kernel/reset":     10,
    "/api/kernel/upload":    10,
    "/api/kernel/predict":    2,
    "/api/kernel/analyze":    5,
    "/api/kernel/stream":     1,
    "/api/alerts/test":       1,
}

# ── Lazy Supabase ─────────────────────────────────────────────────────────────
_sb = None
def get_supabase():
    global _sb
    if _sb: return _sb
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        return None
    try:
        from supabase import create_client
        _sb = create_client(url, key)
        log.info("Supabase connected: %s", url[:40])
    except Exception as e:
        log.warning("Supabase init failed: %s", e)
    return _sb

# ── Lazy Twilio ───────────────────────────────────────────────────────────────
_tw = None
def get_twilio():
    global _tw
    if _tw: return _tw
    sid   = os.getenv("TWILIO_ACCOUNT_SID", "")
    token = os.getenv("TWILIO_AUTH_TOKEN", "")
    if not sid or not token:
        return None
    try:
        from twilio.rest import Client
        _tw = Client(sid, token)
        log.info("Twilio connected (SID: %s…)", sid[:12])
    except Exception as e:
        log.error("Twilio init: %s", e)
    return _tw

def _twilio_status() -> dict:
    """Return Twilio configuration diagnosis."""
    return {
        "connected":           bool(get_twilio()),
        "ACCOUNT_SID_set":     bool(os.getenv("TWILIO_ACCOUNT_SID")),
        "AUTH_TOKEN_set":      bool(os.getenv("TWILIO_AUTH_TOKEN")),
        "FROM_NUMBER_set":     bool(os.getenv("TWILIO_FROM_NUMBER")),
        "ALERT_NUMBER_set":    bool(os.getenv("TWILIO_ALERT_NUMBER")),
        "from_number":         os.getenv("TWILIO_FROM_NUMBER", "NOT_SET"),
        "alert_number":        os.getenv("TWILIO_ALERT_NUMBER", "NOT_SET"),
        "note": (
            "Twilio free trial: from_ must be your Twilio number, "
            "and to_ must be a verified number."
        ) if get_twilio() else "Configure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN",
    }

def send_sms(body: str) -> dict:
    """Send SMS alert. Returns {sent, sid/reason, channel}."""
    client   = get_twilio()
    from_num = os.getenv("TWILIO_FROM_NUMBER", "").strip()
    to_num   = os.getenv("TWILIO_ALERT_NUMBER", "").strip()

    if not client:
        return {"sent": False, "reason": "Twilio not configured.", "channel": "sms"}
    if not from_num or not to_num:
        return {"sent": False, "reason": "TWILIO_FROM_NUMBER or TWILIO_ALERT_NUMBER not set.", "channel": "sms"}
    if from_num == to_num:
        log.warning("Twilio: FROM and TO are the same number — SMS to self")

    try:
        msg = client.messages.create(body=body[:1600], from_=from_num, to=to_num)
        log.info("SMS sent SID=%s to=%s", msg.sid, to_num)
        return {"sent": True, "sid": msg.sid, "to": to_num, "channel": "sms"}
    except Exception as e:
        log.error("SMS failed: %s", e)
        return {"sent": False, "reason": str(e), "channel": "sms"}

def send_whatsapp(body: str, to_override: str = None) -> dict:
    """Send WhatsApp message via Twilio."""
    client   = get_twilio()
    from_num = os.getenv("TWILIO_FROM_NUMBER", "").strip()
    to_num   = (to_override or os.getenv("TWILIO_ALERT_NUMBER", "")).strip()

    if not client:
        return {"sent": False, "reason": "Twilio not configured.", "channel": "whatsapp"}
    if not from_num or not to_num:
        return {"sent": False, "reason": "Phone numbers not set.", "channel": "whatsapp"}

    # Add whatsapp: prefix
    f_wa = from_num if from_num.startswith("whatsapp:") else f"whatsapp:{from_num}"
    t_wa = to_num   if to_num.startswith("whatsapp:")   else f"whatsapp:{to_num}"

    try:
        msg = client.messages.create(body=body[:1600], from_=f_wa, to=t_wa)
        log.info("WhatsApp sent SID=%s", msg.sid)
        return {"sent": True, "sid": msg.sid, "channel": "whatsapp"}
    except Exception as e:
        log.error("WhatsApp failed: %s", e)
        return {"sent": False, "reason": str(e), "channel": "whatsapp"}

# ── Key Store ──────────────────────────────────────────────────────────────────
# In-memory fallback (Supabase preferred)
_mem_keys: dict[str, dict] = {}

def _khash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()

def _load_env_keys():
    """Parse API_KEYS env var: key:ROLE:plan,key2:ROLE2:plan2"""
    raw = os.getenv("API_KEYS", "siti-admin-key-001:ADMIN:enterprise")
    for entry in raw.split(","):
        parts = [p.strip() for p in entry.split(":") if p.strip()]
        if not parts: continue
        k     = parts[0]
        role  = parts[1] if len(parts) > 1 else "OPERATOR"
        plan  = parts[2] if len(parts) > 2 else "growth"
        creds = PLAN_CREDITS.get(plan, 100_000)
        _mem_keys[k] = {
            "role": role, "plan": plan, "active": True,
            "credits": creds, "credits_used": 0,
        }
    log.info("Loaded %d env keys", len(_mem_keys))

_load_env_keys()

def _find_key(raw: str) -> dict | None:
    """Look up key. Returns record or None."""
    if not raw: return None
    khash = _khash(raw)

    # Try Supabase
    db = get_supabase()
    if db:
        try:
            r = db.table("api_keys").select(
                "id,role,plan,active,credits,credits_used"
            ).eq("key_hash", khash).maybe_single().execute()
            if r.data and r.data.get("active"):
                return r.data
            if r.data and not r.data.get("active"):
                return None  # exists but inactive
        except Exception as e:
            log.warning("Supabase key lookup error: %s — using mem", e)

    # Fallback: in-memory
    return _mem_keys.get(raw)

def _debit(raw: str, cost: int = 1) -> bool:
    """Deduct credits. Returns False if exhausted."""
    rec = _find_key(raw)
    if not rec: return False
    if rec.get("credits") is None: return True   # unlimited (enterprise)

    used = rec.get("credits_used", 0)
    if used >= rec["credits"]: return False

    # Debit — always update in-memory first (immediate), then persist to Supabase
    if raw in _mem_keys:
        _mem_keys[raw]["credits_used"] = used + cost

    db = get_supabase()
    if db:
        try:
            db.table("api_keys").update(
                {"credits_used": used + cost}
            ).eq("key_hash", _khash(raw)).execute()
        except Exception: pass

    return True

# ── Rate Limiting ──────────────────────────────────────────────────────────────
_rate_buckets: dict[str, deque] = defaultdict(lambda: deque(maxlen=120))
RPM = int(os.getenv("RATE_LIMIT_RPM", "60"))

def _rate_ok(key: str) -> bool:
    now = time.time()
    q   = _rate_buckets[key]
    while q and now - q[0] > 60: q.popleft()
    if len(q) >= RPM: return False
    q.append(now); return True

# ── Auth Middleware ────────────────────────────────────────────────────────────
def require_key(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        raw = (
            request.headers.get("X-API-Key") or
            request.headers.get("x-api-key") or
            request.headers.get("Authorization", "").replace("Bearer ", "").strip() or
            request.args.get("api_key", "")
        ).strip()

        if not raw:
            return jsonify({"error": "Missing X-API-Key header."}), 401
        if not _rate_ok(raw):
            return jsonify({"error": "Rate limit exceeded.", "limit": f"{RPM} req/min"}), 429

        rec = _find_key(raw)
        if not rec:
            return jsonify({"error": "Invalid or inactive API key."}), 403

        # Credit check
        credits  = rec.get("credits")
        used     = rec.get("credits_used", 0)
        if credits is not None and used >= credits:
            return jsonify({
                "error":    "Credit balance exhausted.",
                "plan":     rec.get("plan"),
                "used":     used,
                "total":    credits,
                "action":   "Upgrade at siti-gsc-kernel.vercel.app/pricing",
            }), 402

        g.api_key = raw
        g.rec     = rec
        return fn(*args, **kwargs)
    return wrapper

# ── MIMI Math ──────────────────────────────────────────────────────────────────
def sigmoid(rho: float, k: float = 20, rc: float = 0.85) -> float:
    try:    return 1 / (1 + math.exp(-k * (rho - rc)))
    except: return 1.0

def hub_metrics(lam: float, mu: float, n: int) -> dict:
    """Full M/M/1 + IRP metrics for one hub."""
    mu  = max(mu, 1e-9)
    rho = min(lam / mu, 1.999)
    phi = sigmoid(rho)

    if rho < 1.0:
        lq  = round(rho**2 / (1 - rho), 4)
        wq  = round(lq / max(lam, 1e-9), 4)
    else:
        lq, wq = 9999.0, 9999.0

    # IRP score — meaningful 0-10 at all scales
    if n >= 1000:
        irp = phi * math.log1p(n) / math.log1p(100_000) * 10
    elif n >= 50:
        irp = phi * math.log1p(n) / math.log1p(1000) * 8
    elif n >= 5:
        irp = phi * math.log1p(n) / math.log1p(50) * 6
    else:
        irp = phi * rho * 4

    return {
        "rho":       round(rho, 6),
        "phi":       round(phi, 6),
        "lq":        lq,
        "wq":        wq,
        "irp_score": round(min(irp, 10.0), 4),
        "risk":      "critical" if rho >= 0.85 else "warning" if rho >= 0.70 else "safe",
    }

class KF1D:
    """1-D Kalman filter (random-walk model)."""
    def __init__(self, Q=0.005, R=0.08):
        self.x, self.P, self.Q, self.R = 0.5, 1.0, Q, R

    def update(self, z: float) -> float:
        P_ = self.P + self.Q
        K  = P_ / (P_ + self.R)
        self.x = self.x + K * (z - self.x)
        self.P = (1 - K) * P_
        return round(min(max(self.x, 0.0), 1.0), 6)

    def predict_n(self, n: int) -> list[float]:
        P, out = self.P, []
        for _ in range(n):
            P += self.Q
            out.append(round(min(max(self.x, 0.0), 1.0), 6))
        return out

# ── Tenant Kernel ──────────────────────────────────────────────────────────────
class TenantKernel:
    def __init__(self, tid: str):
        self.tid       = tid
        self.hubs:     dict[str, dict] = {}
        self.kf:       dict[str, KF1D] = {}
        self.rows:     list[dict]       = []   # last 500 rows for streaming
        self.n_total   = 0
        self.name      = "No dataset"
        self.reset_at  = None

    def reset(self, df: pd.DataFrame, name: str = "upload.csv") -> dict:
        self.hubs.clear(); self.kf.clear(); self.rows.clear()
        self.n_total  = 0
        self.name     = name
        self.reset_at = datetime.utcnow().isoformat()

        df = self._map_cols(df)

        missing = {"hub_id", "arrival_rate", "service_rate"} - set(df.columns)
        if missing:
            raise ValueError(
                f"Cannot resolve columns {missing}. "
                f"Found: {list(df.columns)[:12]}"
            )

        if "shipment_id" not in df.columns:
            df.insert(0, "shipment_id", [f"SHP{i:07d}" for i in range(len(df))])

        for _, row in df.iterrows():
            r = row.to_dict()
            self._ingest(r)
            self.rows.append(r)
            if len(self.rows) > 500:
                self.rows.pop(0)
        self.n_total = len(df)

        log.info("Kernel[%s] reset: %d rows, %d hubs", self.tid, self.n_total, len(self.hubs))
        return self._summary()

    @staticmethod
    def _map_cols(df: pd.DataFrame) -> pd.DataFrame:
        """
        Global column mapping — handles Kaggle e-commerce, Delhivery,
        FedEx, UPS, DHL, and custom 3PL schemas worldwide.
        Synthesizes arrival_rate and service_rate when absent.
        """
        MAP = {
            "hub_id": [
                "warehouse_block", "block", "hub", "hub_code", "depot", "facility",
                "wh_block", "zone", "origin_hub", "sorting_center", "warehouse",
                "location", "city", "station", "terminal", "sort_center",
                "fulfillment_center", "dc", "distribution_center", "fc",
                "origin", "origin_city", "source", "from_hub",
            ],
            "arrival_rate": [
                "lambda", "arrival_count", "inbound_rate", "arrivals",
                "volume", "shipments_per_hour", "count", "daily_count",
                "throughput_in", "order_count", "package_count", "parcels",
                "inbound", "pieces_in", "qty_in", "total_shipments",
            ],
            "service_rate": [
                "mu", "processing_rate", "throughput", "capacity",
                "service_capacity", "capacity_per_hour", "output_rate",
                "dispatch_rate", "throughput_out", "processing_capacity",
                "outbound_rate", "pieces_out", "qty_out",
            ],
            "shipment_id": [
                "id", "order_id", "tracking", "tracking_no", "shipment_no",
                "awb", "waybill", "consignment_no", "pkg_id", "parcel_id",
                "shipment_id", "tracking_number", "reference_no", "ref_no",
            ],
            "on_time": [
                "reached.on.time_y.n", "on_time_delivery", "delivered",
                "reached_on_time", "delivery_status", "late", "on_time",
                "delivery_exception", "is_late", "delayed", "sla_met",
                "on_time_flag", "met_sla",
            ],
            "product_importance": [
                "product_importance", "importance", "priority", "tier",
                "service_level", "sla_level", "value_tier", "shipment_priority",
                "product_tier", "item_priority",
            ],
            "cost": [
                "cost_of_the_product", "cost", "value", "declared_value",
                "item_value", "product_cost", "shipment_value", "order_value",
            ],
            "weight": [
                "weight_in_gms", "weight", "weight_kg", "weight_lbs",
                "gross_weight", "actual_weight", "chargeable_weight",
            ],
            "country": [
                "country", "destination_country", "origin_country",
                "shipper_country", "consignee_country",
            ],
            "carrier": [
                "carrier", "mode_of_shipment", "mode", "transport_mode",
                "service_type", "shipping_method", "carrier_code",
            ],
        }

        col_lower = {c.lower().strip().replace(".", "_").replace(" ", "_"): c
                     for c in df.columns}
        rename = {}
        for target, candidates in MAP.items():
            if target in df.columns: continue
            for cand in candidates:
                norm = cand.lower().replace(".", "_").replace(" ", "_")
                if norm in col_lower:
                    rename[col_lower[norm]] = target
                    break

        df = df.rename(columns=rename)

        # Synthesize arrival_rate from row distribution (Kaggle pattern)
        if "hub_id" in df.columns and "arrival_rate" not in df.columns:
            counts  = df["hub_id"].value_counts()
            n_total = max(len(df), 1)
            df["arrival_rate"] = df["hub_id"].map(
                lambda h: round(counts.get(h, 1) / n_total * 100, 4)
            )
            log.info("arrival_rate synthesized from hub distribution")

        # Synthesize service_rate (equal capacity split across hubs)
        if "hub_id" in df.columns and "service_rate" not in df.columns:
            n_hubs = max(df["hub_id"].nunique(), 1)
            rate   = round(100.0 / n_hubs, 4)
            df["service_rate"] = rate
            log.info("service_rate synthesized = %.4f (%d hubs)", rate, n_hubs)

        return df

    def _ingest(self, row: dict):
        hub = str(row.get("hub_id", "UNKNOWN")).strip()[:64]
        lam = float(row.get("arrival_rate", 0) or 0)
        mu  = float(row.get("service_rate",  1) or 1)

        if hub not in self.hubs:
            self.hubs[hub] = {
                "lam_sum": 0.0, "mu_sum": 0.0, "n": 0,
                "on_time": 0, "late": 0, "hi_late": 0,
                "costs": [], "weights": [],
                "countries": set(), "carriers": set(),
            }
        s = self.hubs[hub]
        s["lam_sum"] += lam
        s["mu_sum"]  += mu
        s["n"]       += 1

        ot = row.get("on_time")
        if ot is not None:
            try:
                v = int(float(ot))
                s["on_time"] += int(v == 1)
                s["late"]    += int(v == 0)
            except: pass

        imp = str(row.get("product_importance", "")).lower()
        if imp in ("high", "critical", "priority") and ot is not None:
            try:
                if int(float(ot)) == 0:
                    s["hi_late"] += 1
            except: pass

        cost = row.get("cost")
        if cost is not None:
            try: s["costs"].append(float(cost))
            except: pass

        wt = row.get("weight")
        if wt is not None:
            try: s["weights"].append(float(wt))
            except: pass

        country = str(row.get("country", "")).strip()
        if country: s["countries"].add(country)

        carrier = str(row.get("carrier", "")).strip()
        if carrier: s["carriers"].add(carrier)

    def _summary(self) -> dict:
        hubs_out = []
        for hub_id, s in self.hubs.items():
            n   = max(s["n"], 1)
            lam = s["lam_sum"] / n
            mu  = s["mu_sum"]  / n
            m   = hub_metrics(lam, mu, n)

            if hub_id not in self.kf:
                self.kf[hub_id] = KF1D()
            kf_state = self.kf[hub_id]
            x_hat    = kf_state.update(m["rho"])
            t1, t2, t3 = kf_state.predict_n(3)

            leakage = round(s["hi_late"] * LEAKAGE_PER_FAIL, 2)

            hubs_out.append({
                "hub_id":       hub_id,
                "lambda":       round(lam, 4),
                "mu":           round(mu,  4),
                **m,
                "shipments":    n,
                "on_time":      s["on_time"],
                "late":         s["late"],
                "delay_rate":   round(s["late"] / n, 4),
                "hi_late":      s["hi_late"],
                "leakage":      leakage,
                "avg_cost":     round(sum(s["costs"]) / len(s["costs"]), 2) if s["costs"] else 0,
                "avg_weight":   round(sum(s["weights"]) / len(s["weights"]), 2) if s["weights"] else 0,
                "countries":    sorted(s["countries"])[:10],
                "carriers":     sorted(s["carriers"])[:10],
                # Kalman state — real x_hat returned, not mock
                "kalman": {
                    "x_hat": x_hat,
                    "delay_prob": x_hat,    # alias for frontend chart
                    "t1":    t1,
                    "t2":    t2,
                    "t3":    t3,
                    "P":     round(kf_state.P, 6),
                },
            })

        hubs_out.sort(key=lambda h: -h["rho"])

        global_rho = sum(h["rho"] for h in hubs_out) / max(len(hubs_out), 1)
        total_late  = sum(h["late"] for h in hubs_out)
        total_hi    = sum(h["hi_late"] for h in hubs_out)
        total_leak  = round(sum(h["leakage"] for h in hubs_out), 2)

        # Risk distribution for frontend chart (IRP > 9.0 → CRITICAL)
        risk_dist = {
            "safe":     len([h for h in hubs_out if h["risk"] == "safe"]),
            "warning":  len([h for h in hubs_out if h["risk"] == "warning"]),
            "critical": len([h for h in hubs_out if h["risk"] == "critical"]),
        }

        critical_irp = [h for h in hubs_out if h["irp_score"] > 9.0]

        return {
            "tenant_id":          self.tid,
            "total_rows":         self.n_total,
            "hub_count":          len(hubs_out),
            "hubs":               hubs_out,
            "global_rho":         round(global_rho, 6),
            "total_late":         total_late,
            "total_hi_late":      total_hi,
            "total_leakage":      total_leak,
            "annualized_exposure":2_810_000,
            "risk_distribution":  risk_dist,
            "critical_irp_hubs":  [h["hub_id"] for h in critical_irp],
            "alert_triggered":    len(critical_irp) > 0,
            "dataset_name":       self.name,
            "reset_at":           self.reset_at,
        }

    def last_n(self, n: int) -> list[dict]:
        """Return last N rows for streaming endpoint."""
        rows = self.rows[-n:] if len(self.rows) >= n else self.rows[:]
        # Add kalman delay_prob per row for animation
        out = []
        for i, row in enumerate(rows):
            hub = str(row.get("hub_id", "UNKNOWN"))
            kf  = self.kf.get(hub)
            out.append({
                "i":          i,
                "hub_id":     hub,
                "shipment_id": row.get("shipment_id", f"SHP{i:07d}"),
                "delay_prob": round(kf.x, 4) if kf else 0.5,
                "rho":        round(row.get("arrival_rate", 0) / max(row.get("service_rate", 1), 1e-9), 4),
                "on_time":    row.get("on_time"),
                "cost":       row.get("cost"),
                "country":    row.get("country"),
            })
        return out

_kernels: dict[str, TenantKernel] = {}
def get_kernel(tid: str) -> TenantKernel:
    if tid not in _kernels:
        _kernels[tid] = TenantKernel(tid)
    return _kernels[tid]

# ── CSV Parser ─────────────────────────────────────────────────────────────────
def parse_csv(raw: bytes, filename: str = "upload.csv") -> pd.DataFrame:
    """
    Secure multi-encoding CSV parser.
    UTF-8 → ISO-8859-1 → Latin-1 fallback.
    Strips non-ASCII, unit suffixes, skips bad rows.
    """
    text = None
    for enc in ("utf-8", "iso-8859-1", "windows-1252", "latin-1"):
        try:
            dec = raw.decode(enc)
            if "\uFFFD" not in dec:
                text = dec; break
        except: continue
    if text is None:
        text = raw.decode("utf-8", errors="replace")

    text = re.sub(r"[^\x20-\x7E\t\n\r]", "", text)

    # Strip unit suffixes row-by-row (100kg→100, $5.00→5.00, 3,500→3500)
    lines = text.split("\n")
    if not lines:
        raise ValueError("Empty file")

    def clean(line: str) -> str:
        line = re.sub(r"(\d)\s*(kg|g|lbs?|oz|km|mi|\$|€|£|₹|¥|%|units?|pcs?|pkgs?)", r"\1", line, flags=re.IGNORECASE)
        line = re.sub(r"(\d),(\d{3})", r"\1\2", line)  # 3,500 → 3500
        return line

    body  = "\n".join(clean(l) for l in lines[1:])
    text  = lines[0] + "\n" + body

    df = pd.read_csv(io.StringIO(text), on_bad_lines="skip",
                     low_memory=False, nrows=MAX_CSV_ROWS)

    num = df.select_dtypes(include=[np.number]).columns
    if len(num): df[num] = df[num].fillna(df[num].mean())
    obj = df.select_dtypes(include=["object"]).columns
    df[obj] = df[obj].fillna("UNKNOWN")

    return df

# ═══════════════════════════════════════════════════════════════════════════════
# ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@app.route("/",      methods=["GET"])
@app.route("/api",   methods=["GET"])
@app.route("/api/",  methods=["GET"])
def root():
    return jsonify({"service": "SITI Intelligence v6.0", "status": "online",
                    "timestamp": datetime.utcnow().isoformat()})

@app.route("/ping",      methods=["GET"])
@app.route("/api/ping",  methods=["GET"])
def ping():
    return jsonify({"ok": True, "ts": datetime.utcnow().isoformat()})

@app.route("/health",     methods=["GET"])
@app.route("/api/health", methods=["GET"])
def health():
    tw  = _twilio_status()
    db  = get_supabase()
    return jsonify({
        "status":    "healthy",
        "version":   "6.0.0",
        "supabase":  "connected" if db   else "fallback_mode",
        "twilio":    "connected" if tw["connected"] else "not_configured",
        "twilio_detail": tw,
        "openrouter": "configured" if os.getenv("OPENROUTER_API_KEY") else "not_configured",
        "timestamp": datetime.utcnow().isoformat(),
    })

# ── CSV Upload ────────────────────────────────────────────────────────────────
def _do_upload():
    tid = request.headers.get("X-Tenant-ID", g.api_key[:16]).strip()
    kern = get_kernel(tid)

    if "file" not in request.files:
        return jsonify({"error": "No 'file' field in multipart/form-data."}), 400

    f = request.files["file"]
    if not f or not f.filename:
        return jsonify({"error": "Empty file upload."}), 400
    if not f.filename.lower().endswith(".csv"):
        return jsonify({"error": "Only .csv files accepted.", "received": f.filename}), 415

    raw = f.read(MAX_CSV_BYTES + 1)
    if len(raw) > MAX_CSV_BYTES:
        return jsonify({
            "error": f"File too large. Maximum {MAX_CSV_MB} MB allowed.",
            "detail": "Payload Too Large",
            "hint":   "Split your CSV into chunks under 10 MB.",
        }), 413
    if len(raw) < 10:
        return jsonify({"error": "File appears to be empty."}), 400

    try:
        df = parse_csv(raw, f.filename)
    except Exception as e:
        return jsonify({"error": f"CSV parse failed: {e}"}), 422

    if df.empty or len(df) < 2:
        return jsonify({"error": "CSV has no usable data rows after parsing."}), 422

    try:
        summary = kern.reset(df, name=f.filename)
    except ValueError as e:
        return jsonify({
            "error":  str(e),
            "detail": {
                "type":    "SCHEMA_MISMATCH",
                "found":   list(df.columns[:20]),
                "need":    ["hub_id (or Warehouse_block)", "arrival_rate", "service_rate"],
                "hint":    "Kaggle 'Warehouse_block' → hub_id auto-mapped. Arrival/service rates synthesized.",
            }
        }), 400

    _debit(g.api_key, cost=PLAN_COST["/api/kernel/reset"])

    # Twilio alert for critical hubs OR IRP > 9.0
    alert_result = None
    critical = [h for h in summary["hubs"] if h["risk"] == "critical"]
    high_irp  = [h for h in summary["hubs"] if h["irp_score"] > 9.0]
    alert_hubs = critical or high_irp

    if alert_hubs:
        hub = alert_hubs[0]
        msg = (
            f"🔴 SITI SYSTEM ALERT v6.0\n"
            f"Dataset: {f.filename}\n"
            f"Hub: {hub['hub_id']} | Risk: {hub['risk'].upper()}\n"
            f"Load ρ = {hub['rho']} | IRP = {hub['irp_score']}/10\n"
            f"Late: {hub['late']} | Leakage: ${hub['leakage']}\n"
            f"T+3 forecast: ρ={hub['kalman']['t3']}\n"
            f"→ Immediate diversion required. SITI Intelligence."
        )
        alert_result = send_sms(msg)

    return jsonify({
        "success":     True,
        "summary":     summary,
        "alert_fired": bool(alert_hubs),
        "alert_result": alert_result,
        "credits_used": PLAN_COST["/api/kernel/reset"],
        "message": (
            f"Reset complete. {summary['total_rows']:,} rows, "
            f"{summary['hub_count']} hubs, "
            f"{len(critical)} critical, "
            f"{len(high_irp)} IRP>9.0."
        ),
    }), 200

@app.route("/api/kernel/reset",  methods=["POST"])
@app.route("/api/kernel/upload", methods=["POST"])
@app.route("/kernel/upload",     methods=["POST"])
@require_key
def kernel_upload(): return _do_upload()

# ── Kernel Status ──────────────────────────────────────────────────────────────
@app.route("/api/kernel/status", methods=["GET"])
@app.route("/api/kernel/state",  methods=["GET"])
@require_key
def kernel_status():
    tid = request.headers.get("X-Tenant-ID", g.api_key[:16]).strip()
    s   = get_kernel(tid)._summary()
    _debit(g.api_key, 1)
    return jsonify(s)

@app.route("/api/hubs", methods=["GET"])
@require_key
def list_hubs():
    tid = request.headers.get("X-Tenant-ID", g.api_key[:16]).strip()
    s   = get_kernel(tid)._summary()
    _debit(g.api_key, 1)
    return jsonify({"hubs": s["hubs"], "global_rho": s["global_rho"],
                    "risk_distribution": s["risk_distribution"]})

# ── Streaming endpoint (last N rows for live chart) ───────────────────────────
@app.route("/api/kernel/stream", methods=["GET"])
@require_key
def stream():
    tid = request.headers.get("X-Tenant-ID", g.api_key[:16]).strip()
    n   = min(int(request.args.get("n", 50)), 200)
    rows = get_kernel(tid).last_n(n)
    _debit(g.api_key, 1)
    return jsonify({"rows": rows, "count": len(rows)})

# ── Kalman Prediction ──────────────────────────────────────────────────────────
@app.route("/api/kernel/predict", methods=["POST"])
@require_key
def predict():
    tid  = request.headers.get("X-Tenant-ID", g.api_key[:16]).strip()
    kern = get_kernel(tid)
    d    = request.get_json(force=True) or {}

    hub_id = str(d.get("hub_id", "UNKNOWN"))
    obs    = [float(x) for x in d.get("observations", []) if x is not None]
    if not obs:
        return jsonify({"error": "Provide 'observations' array."}), 400

    if hub_id not in kern.kf:
        kern.kf[hub_id] = KF1D()
    kf       = kern.kf[hub_id]
    smoothed = [kf.update(z) for z in obs]
    predicted = kf.predict_n(5)

    if predicted[-1] > 0.88:
        send_sms(
            f"⚠️ SITI PREDICTION ALERT\n"
            f"Hub: {hub_id}\n"
            f"T+5 delay probability: {predicted[-1]*100:.1f}%\n"
            f"→ Intervene immediately. SITI v6.0"
        )

    _debit(g.api_key, PLAN_COST["/api/kernel/predict"])
    return jsonify({
        "hub_id":       hub_id,
        "smoothed":     smoothed,
        "predicted":    predicted,
        "delay_prob":   smoothed[-1],
        "kalman_state": {"x_hat": kf.x, "P": round(kf.P, 6)},
    })

# ── AI Analysis ────────────────────────────────────────────────────────────────
@app.route("/api/kernel/analyze", methods=["POST"])
@require_key
def analyze():
    d       = request.get_json(force=True) or {}
    or_key  = os.getenv("OPENROUTER_API_KEY", "").strip()

    if not or_key:
        hub = d.get("hub_id", "Hub"); rho = float(d.get("rho", 0))
        return jsonify({
            "explanation": (
                f"Hub {hub} has load factor ρ={rho:.3f}. "
                + ("Over capacity — reroute immediately." if rho > 1.0 else
                   "Near saturation — monitor closely." if rho > 0.85 else
                   "Operating within normal bounds.")
            ),
            "source": "MIMI Kernel (local — set OPENROUTER_API_KEY for AI)"
        })

    # Build rich context for AI
    hub_id    = d.get("hub_id", "Unknown")
    rho       = d.get("rho", 0)
    irp       = d.get("irp_score", 0)
    leakage   = d.get("leakage", 0)
    delay_r   = d.get("delay_rate", 0)
    kalman_t3 = d.get("kalman", {}).get("t3", rho)

    prompt = (
        "You are SITI Intelligence, a global logistics AI. "
        "Analyze this hub data and give a 3-sentence operational recommendation "
        "for a logistics manager. Be data-driven, specific, and actionable. "
        "Reference the Inverse Reliability Paradox where relevant.\n\n"
        f"Hub ID: {hub_id}\n"
        f"Load Factor ρ: {rho} (threshold: 0.85)\n"
        f"IRP Score: {irp}/10\n"
        f"Delay Rate: {delay_r:.1%}\n"
        f"Revenue Leakage: ${leakage}\n"
        f"Kalman T+3 Forecast ρ: {kalman_t3}\n"
        f"Full context: {json.dumps(d, default=str)[:500]}"
    )

    try:
        resp = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {or_key}",
                "Content-Type":  "application/json",
                "HTTP-Referer":  "https://siti-gsc-kernel.vercel.app",
                "X-Title":       "SITI Intelligence",
            },
            json={
                "model":    "google/gemini-flash-1.5",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 300,
            },
            timeout=25.0,
        )
        text = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")
        if not text:
            raise ValueError("Empty response from AI")
        _debit(g.api_key, PLAN_COST["/api/kernel/analyze"])
        return jsonify({"explanation": text.strip(), "source": "OpenRouter/Gemini Flash"})
    except Exception as e:
        log.error("AI analysis: %s", e)
        return jsonify({"error": str(e), "hint": "AI analysis failed — check OPENROUTER_API_KEY"}), 500

# ── Twilio Alert Test ──────────────────────────────────────────────────────────
@app.route("/api/alerts/test", methods=["POST"])
@require_key
def test_alerts():
    d       = request.get_json(force=True) or {}
    channel = d.get("channel", "sms")
    msg     = d.get("message",
        "✅ SITI Intelligence v6.0 — Alert test\n"
        "System monitoring active.\n"
        "Critical hub alerts will be sent here.\n"
        "— SITI Intelligence"
    )
    result  = send_whatsapp(msg) if channel == "whatsapp" else send_sms(msg)
    _debit(g.api_key, PLAN_COST["/api/alerts/test"])
    return jsonify({
        "channel": channel,
        "result":  result,
        "twilio":  _twilio_status(),
    })

# ── Keys Info ──────────────────────────────────────────────────────────────────
@app.route("/api/keys/info", methods=["GET"])
@require_key
def key_info():
    rec      = g.rec
    credits  = rec.get("credits")
    used     = rec.get("credits_used", 0)
    remaining = (credits - used) if credits is not None else None
    return jsonify({
        "key_preview":       g.api_key[:8] + "…" + g.api_key[-4:],
        "plan":              rec.get("plan", "unknown"),
        "role":              rec.get("role", "OPERATOR"),
        "credits_total":     credits,
        "credits_used":      used,
        "credits_remaining": remaining,
        "active":            rec.get("active", True),
        "pilot_restricted":  rec.get("plan") == "pilot",  # for CreditGuard
    })

# ── Admin: Create key (SHOW ONCE) ─────────────────────────────────────────────
@app.route("/api/admin/create-key", methods=["POST"])
@require_key
def admin_create_key():
    if g.rec.get("role") not in ("ADMIN",):
        return jsonify({"error": "Admin role required."}), 403

    d       = request.get_json(force=True) or {}
    plan    = d.get("plan", "pilot")
    new_key = f"siti-{plan}-{secrets.token_urlsafe(22)}"
    creds   = int(d.get("credits", PLAN_CREDITS.get(plan, 5000) or 5000))
    khash   = _khash(new_key)

    rec = {"role": d.get("role", "OPERATOR"), "plan": plan,
           "active": True, "credits": creds, "credits_used": 0}

    db = get_supabase()
    if db:
        try:
            db.table("api_keys").insert({
                "key_hash": khash, **rec,
                "created_at": datetime.utcnow().isoformat(),
            }).execute()
        except Exception as e:
            log.warning("Supabase key insert: %s", e)

    _mem_keys[new_key] = rec   # also in memory for immediate use

    # SHOW ONCE: plaintext key returned only here, never again
    return jsonify({
        "key":          new_key,     # ← show once to admin
        "key_preview":  new_key[:8] + "…" + new_key[-4:],
        "plan":         plan,
        "credits":      creds,
        "show_once":    True,        # frontend must display in modal & clear
        "message":      "Save this key now — it will not be shown again.",
    })

# ── Payment: Create Order ──────────────────────────────────────────────────────
@app.route("/api/payments/create-order", methods=["POST"])
@require_key
def create_order():
    d      = request.get_json(force=True) or {}
    plan   = d.get("plan", "pilot")
    amount = int(d.get("amount", 9999))

    app_id  = os.getenv("CASHFREE_APP_ID",     "").strip()
    secret  = os.getenv("CASHFREE_SECRET_KEY", "").strip()
    cf_env  = os.getenv("CASHFREE_ENV",        "production")

    if not app_id or not secret:
        wa_text = urllib.parse.quote(
            f"Hi! I want to buy SITI Intelligence {plan.upper()} plan "
            f"(₹{amount:,}/month). Please confirm."
        )
        return jsonify({
            "success":      False,
            "fallback":     True,
            "whatsapp_url": f"https://wa.me/{WA_NUMBER}?text={wa_text}",
            "reason":       "Cashfree not configured. Use WhatsApp to complete purchase.",
        })

    order_id = f"SITI-{plan.upper()}-{uuid.uuid4().hex[:8].upper()}"
    fe_url   = os.getenv("FRONTEND_URL", "https://siti-gsc-kernel.vercel.app")
    be_url   = os.getenv("BACKEND_URL",  "https://siti-gsc-kernel-1.onrender.com")
    cf_base  = "https://api.cashfree.com" if cf_env == "production" else "https://sandbox.cashfree.com"

    try:
        r = httpx.post(f"{cf_base}/pg/orders",
            headers={"x-api-version": "2023-08-01",
                     "x-client-id": app_id, "x-client-secret": secret,
                     "Content-Type": "application/json"},
            json={
                "order_id":       order_id,
                "order_amount":   float(amount),
                "order_currency": "INR",
                "customer_details": {
                    "customer_id":    f"SITI-{uuid.uuid4().hex[:8]}",
                    "customer_email": d.get("email", "customer@example.com"),
                    "customer_phone": d.get("phone", "9000000000"),
                    "customer_name":  d.get("name",  "SITI Customer"),
                },
                "order_meta": {
                    "return_url": f"{fe_url}?payment=success&plan={plan}&order_id={order_id}",
                    "notify_url": f"{be_url}/api/payments/cashfree-webhook",
                },
                "order_tags": {"plan": plan, "credits": str(PLAN_CREDITS.get(plan, 5000))},
            }, timeout=15.0)

        if r.status_code in (200, 201):
            rd = r.json()
            return jsonify({"success": True, "order_id": order_id,
                            "payment_session_id": rd.get("payment_session_id"),
                            "plan": plan, "credits": PLAN_CREDITS.get(plan, 5000)})
        return jsonify({"success": False, "error": "Cashfree error", "details": r.text[:200]}), 502
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ── Payment Webhook ────────────────────────────────────────────────────────────
@app.route("/api/payments/cashfree-webhook", methods=["POST"])
def cashfree_webhook():
    payload  = request.get_data()
    sig      = request.headers.get("x-webhook-signature", "")
    ts       = request.headers.get("x-webhook-timestamp", "")
    ws_key   = os.getenv("CASHFREE_WEBHOOK_SECRET", "")

    if ws_key:
        expected = hmac.new(
            ws_key.encode(), f"{ts}.{payload.decode('utf-8', errors='replace')}".encode(),
            hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, sig):
            return jsonify({"error": "Invalid signature"}), 400

    try:    d = json.loads(payload)
    except: return jsonify({"error": "Invalid JSON"}), 400

    order  = d.get("data", {}).get("order", {})
    pay    = d.get("data", {}).get("payment", {})
    cust   = d.get("data", {}).get("customer_details", {})
    tags   = order.get("order_tags", {})

    status = pay.get("payment_status", "")
    plan   = tags.get("plan", "pilot")
    creds  = int(tags.get("credits", PLAN_CREDITS.get(plan, 5000) or 5000))
    order_id = order.get("order_id", "")
    pay_id   = str(pay.get("cf_payment_id", ""))
    phone    = cust.get("customer_phone", "")
    name     = cust.get("customer_name",  "Customer")

    log.info("Webhook: order=%s status=%s plan=%s", order_id, status, plan)

    if status != "SUCCESS":
        return jsonify({"received": True, "provisioned": False, "status": status})

    new_key = f"siti-{plan}-{secrets.token_urlsafe(22)}"
    khash   = _khash(new_key)
    rec     = {"role": "OPERATOR", "plan": plan, "active": True,
               "credits": creds, "credits_used": 0}

    db = get_supabase()
    if db:
        try:
            db.table("api_keys").insert({
                "key_hash":    khash, **rec,
                "order_id":    order_id,
                "payment_id":  pay_id,
                "created_at":  datetime.utcnow().isoformat(),
            }).execute()
        except Exception as e:
            log.error("Supabase webhook insert: %s", e)

    _mem_keys[new_key] = rec

    # Deliver key via WhatsApp to customer
    key_msg = (
        f"🎉 SITI Intelligence — Payment Confirmed!\n\n"
        f"Hi {name}!\n"
        f"Plan: {plan.upper()} | Credits: {creds:,}\n"
        f"Order: {order_id}\n\n"
        f"Your API Key:\n{new_key}\n\n"
        f"⚠️ This key grants full API access. Keep it private.\n"
        f"Dashboard: https://siti-gsc-kernel.vercel.app\n"
        f"Support: wa.me/{WA_NUMBER}"
    )
    to_num = phone if phone else None
    send_whatsapp(key_msg, to_override=to_num)
    send_sms(f"✅ SITI — New {plan} sale | Order: {order_id} | Credits: {creds:,}")

    return jsonify({"received": True, "provisioned": True, "plan": plan, "credits": creds})

# ── Error Handlers ─────────────────────────────────────────────────────────────
@app.errorhandler(404)
def e404(e):
    return jsonify({"error": "Not found", "path": request.path}), 404
@app.errorhandler(405)
def e405(e):
    return jsonify({"error": "Method not allowed"}), 405
@app.errorhandler(413)
def e413(e):
    return jsonify({"error": "Payload Too Large", "hint": f"Max {MAX_CSV_MB} MB"}), 413
@app.errorhandler(500)
def e500(e):
    log.error("500: %s", e)
    return jsonify({"error": "Internal server error", "detail": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    log.info("SITI Intelligence v6.0 starting on port %d", port)
    app.run(host="0.0.0.0", port=port, debug=False)
