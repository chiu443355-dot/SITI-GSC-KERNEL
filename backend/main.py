"""
SITI Intelligence Kernel - GSC Production Backend
===================================================
Architecture: Stateless FastAPI + Supabase (PostgreSQL) persistence
Render Free Tier safe: no in-memory state, cold-start tolerant
Author: SITI Intelligence
Version: 2.0.0 (Unicorn-Ready Refactor)
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("siti.kernel")


# ---------------------------------------------------------------------------
# Lazy Supabase client  (fixes Render cold-start crash)
# ---------------------------------------------------------------------------
_supabase_client = None


def get_supabase():
    """Lazy-initialise the Supabase client.

    Called only when a request actually needs DB access, not at module import.
    This prevents the 'Exited with status 1' crash on Render free tier when
    env-vars are not yet injected at cold-start.
    """
    global _supabase_client
    if _supabase_client is None:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_KEY")
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_KEY must be set as environment variables."
            )
        from supabase import create_client  # deferred import
        _supabase_client = create_client(url, key)
        logger.info("Supabase client initialised.")
    return _supabase_client


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
CASHFREE_CLIENT_ID = os.environ.get("CASHFREE_CLIENT_ID", "")
CASHFREE_CLIENT_SECRET = os.environ.get("CASHFREE_CLIENT_SECRET", "")
CASHFREE_ENV = os.environ.get("CASHFREE_ENV", "TEST")  # TEST | PROD
CASHFREE_BASE = (
    "https://api.cashfree.com/pg"
    if CASHFREE_ENV == "PROD"
    else "https://sandbox.cashfree.com/pg"
)

TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.environ.get("TWILIO_FROM_NUMBER", "")


# ---------------------------------------------------------------------------
# App lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("SITI Kernel starting up...")
    yield
    logger.info("SITI Kernel shutting down.")


app = FastAPI(
    title="SITI Intelligence Kernel",
    version="2.0.0",
    description="Stateless logistics intelligence API for Indian regional 3PLs.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===========================================================================
# SECTION 1 — AUTHENTICATION (DB-first, 30-second cache)
# ===========================================================================

# We use a module-level dict as a simple TTL cache instead of lru_cache
# because lru_cache doesn't support TTL natively and we need invalidation.
_api_key_cache: dict[str, tuple[dict, float]] = {}
_API_KEY_TTL_SECONDS = 30


def _cache_get(key: str) -> dict | None:
    entry = _api_key_cache.get(key)
    if entry is None:
        return None
    payload, ts = entry
    if time.monotonic() - ts > _API_KEY_TTL_SECONDS:
        del _api_key_cache[key]
        return None
    return payload


def _cache_set(key: str, payload: dict) -> None:
    _api_key_cache[key] = (payload, time.monotonic())


def verify_api_key(
    x_api_key: str = Header(..., alias="X-API-Key"),
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
) -> dict:
    """Validate API key exclusively against the Supabase `api_keys` table.

    Security design:
    - NO fallback to env-var keys (the old 'siti-admin-key-001' backdoor is gone).
    - 30-second in-process TTL cache to absorb burst traffic without hammering DB.
    - Tenant ID is cross-checked so one tenant cannot use another's key.
    """
    cache_key = f"{x_tenant_id}:{x_api_key}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    try:
        sb = get_supabase()
        result = (
            sb.table("api_keys")
            .select("*")
            .eq("key_value", x_api_key)
            .eq("tenant_id", x_tenant_id)
            .eq("is_active", True)
            .execute()
        )
    except Exception as exc:
        logger.error("DB error during API key lookup: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service temporarily unavailable.",
        )

    rows = result.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API key for this tenant.",
        )

    tenant_ctx = rows[0]
    _cache_set(cache_key, tenant_ctx)
    return tenant_ctx


# ---------------------------------------------------------------------------
# Convenience type alias used in route signatures
# ---------------------------------------------------------------------------
TenantCtx = dict  # returned by verify_api_key


# ===========================================================================
# SECTION 2 — CORE MATH (Kalman Filter + M/M/1 Queue + Φ Decay + IRP)
# ===========================================================================

class KalmanFilter1D:
    """Univariate Kalman filter for shipment ETA smoothing.

    State: estimated transit time (hours)
    Observation: reported transit time from carrier scan
    """

    def __init__(
        self,
        process_variance: float = 1.0,
        measurement_variance: float = 4.0,
        initial_estimate: float = 0.0,
        initial_error: float = 1.0,
    ):
        self.q = process_variance       # process noise covariance
        self.r = measurement_variance   # measurement noise covariance
        self.x = initial_estimate       # state estimate
        self.p = initial_error          # error covariance

    def update(self, measurement: float) -> float:
        """Run one predict-update cycle and return the smoothed estimate."""
        # Predict
        self.p = self.p + self.q

        # Update (Kalman gain)
        k = self.p / (self.p + self.r)
        self.x = self.x + k * (measurement - self.x)
        self.p = (1 - k) * self.p

        return self.x

    def to_dict(self) -> dict:
        return {"x": self.x, "p": self.p, "q": self.q, "r": self.r}

    @classmethod
    def from_dict(cls, d: dict) -> "KalmanFilter1D":
        kf = cls(process_variance=d["q"], measurement_variance=d["r"])
        kf.x = d["x"]
        kf.p = d["p"]
        return kf


def mm1_queue_metrics(
    arrival_rate: float,  # λ — shipments per hour
    service_rate: float,  # μ — shipments processed per hour
) -> dict[str, float]:
    """M/M/1 queueing theory metrics for hub throughput analysis."""
    if service_rate <= 0:
        raise ValueError("service_rate must be positive.")
    if arrival_rate >= service_rate:
        # System is saturated — return sentinel values
        return {
            "utilisation": 1.0,
            "avg_queue_length": float("inf"),
            "avg_wait_hours": float("inf"),
            "avg_system_time_hours": float("inf"),
            "is_saturated": True,
        }

    rho = arrival_rate / service_rate  # utilisation
    lq = (rho ** 2) / (1 - rho)       # avg queue length (Lq)
    wq = lq / arrival_rate             # avg wait in queue (Wq)  — Little's Law
    w = wq + (1 / service_rate)        # avg time in system (W)

    return {
        "utilisation": round(rho, 4),
        "avg_queue_length": round(lq, 4),
        "avg_wait_hours": round(wq, 4),
        "avg_system_time_hours": round(w, 4),
        "is_saturated": False,
    }


def phi_sigmoidal_decay(
    base_reliability: float,  # R₀ ∈ (0, 1]
    age_days: float,          # days since last successful delivery
    steepness: float = 0.15,  # k — controls decay rate
    inflection_day: float = 7.0,  # d₀ — day of fastest decay
) -> float:
    """Φ Sigmoidal Decay — SITI's proprietary reliability scoring function.

    R(t) = R₀ / (1 + e^(k * (t - d₀)))

    Captures the non-linear trust erosion when a hub goes silent.
    """
    import math
    decay = 1.0 / (1.0 + math.exp(steepness * (age_days - inflection_day)))
    return round(base_reliability * decay, 6)


def detect_irp(
    shipment_count: int,
    on_time_count: int,
    reliability_score: float,
) -> dict:
    """Inverse Reliability Paradox (IRP) detection.

    IRP: A hub shows high on-time % but low absolute reliability when
    volume is suppressed (they cherry-pick easy shipments).
    Returns a risk flag and severity level.
    """
    if shipment_count == 0:
        return {"irp_detected": False, "severity": "none", "reason": "no data"}

    surface_otp = on_time_count / shipment_count

    # IRP condition: OTP looks good but Φ-score is collapsing
    irp_gap = surface_otp - reliability_score
    irp_detected = irp_gap > 0.25 and reliability_score < 0.6

    if not irp_detected:
        severity = "none"
    elif irp_gap > 0.5:
        severity = "critical"
    elif irp_gap > 0.35:
        severity = "high"
    else:
        severity = "medium"

    return {
        "irp_detected": irp_detected,
        "severity": severity,
        "surface_otp": round(surface_otp, 4),
        "reliability_score": round(reliability_score, 4),
        "irp_gap": round(irp_gap, 4),
    }


# ===========================================================================
# SECTION 3 — DATABASE HELPERS (stateless fetch-process-save pattern)
# ===========================================================================

def _tenant_guard(query, tenant_id: str):
    """Apply tenant_id filter to every Supabase query — prevents data leakage."""
    return query.eq("tenant_id", tenant_id)


def get_hub(tenant_id: str, hub_id: str) -> dict:
    """Fetch a single hub record, scoped to tenant."""
    sb = get_supabase()
    result = (
        _tenant_guard(sb.table("hubs").select("*").eq("hub_id", hub_id), tenant_id)
        .execute()
    )
    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=404, detail=f"Hub '{hub_id}' not found.")
    return rows[0]


def upsert_hub(tenant_id: str, hub_data: dict) -> dict:
    """Create or update a hub record."""
    hub_data["tenant_id"] = tenant_id
    hub_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    sb = get_supabase()
    result = sb.table("hubs").upsert(hub_data).execute()
    return result.data[0]


def get_shipment(tenant_id: str, shipment_id: str) -> dict:
    sb = get_supabase()
    result = (
        _tenant_guard(
            sb.table("shipments").select("*").eq("shipment_id", shipment_id),
            tenant_id,
        ).execute()
    )
    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=404, detail=f"Shipment '{shipment_id}' not found.")
    return rows[0]


def upsert_shipment(tenant_id: str, shipment_data: dict) -> dict:
    shipment_data["tenant_id"] = tenant_id
    shipment_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    sb = get_supabase()
    result = sb.table("shipments").upsert(shipment_data).execute()
    return result.data[0]


def list_shipments(tenant_id: str, hub_id: str | None = None) -> list[dict]:
    sb = get_supabase()
    query = _tenant_guard(sb.table("shipments").select("*"), tenant_id)
    if hub_id:
        query = query.eq("hub_id", hub_id)
    result = query.order("created_at", desc=True).limit(500).execute()
    return result.data or []


# ===========================================================================
# SECTION 4 — PYDANTIC SCHEMAS
# ===========================================================================

class ShipmentIngest(BaseModel):
    shipment_id: str
    hub_id: str
    carrier: str
    origin: str
    destination: str
    promised_transit_hours: float
    actual_transit_hours: float | None = None
    status: str = "in_transit"  # in_transit | delivered | exception


class HubConfig(BaseModel):
    hub_id: str
    hub_name: str
    city: str
    max_capacity_per_day: int = Field(ge=1)
    current_load: int = Field(ge=0, default=0)
    service_rate_per_hour: float = Field(gt=0)
    arrival_rate_per_hour: float = Field(gt=0)


class AlertRequest(BaseModel):
    phone_number: str  # E.164 format e.g. +919876543210
    message: str


class CashfreeWebhookPayload(BaseModel):
    """Minimal fields we need from Cashfree's webhook."""
    order_id: str
    order_status: str  # PAID | ACTIVE | EXPIRED
    customer_details: dict[str, Any] | None = None
    order_meta: dict[str, Any] | None = None


# ===========================================================================
# SECTION 5 — ROUTES
# ===========================================================================

# ---------------------------------------------------------------------------
# 5.1  Health Check (DB-verified — satisfies Render's health probe)
# ---------------------------------------------------------------------------
@app.get("/ping", tags=["infra"])
async def health_check():
    """Lightweight liveness probe — no auth required."""
    return {"status": "alive", "ts": datetime.now(timezone.utc).isoformat()}


@app.get("/health", tags=["infra"])
async def deep_health_check():
    """Deep health check that verifies Supabase connectivity.

    Render uses this to decide if the deployment succeeded.
    Returns 200 only when the DB is reachable.
    """
    try:
        sb = get_supabase()
        # Minimal query — just prove the connection works
        sb.table("api_keys").select("key_value").limit(1).execute()
        db_status = "connected"
    except Exception as exc:
        logger.error("Health check DB failure: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "degraded", "db": "unreachable", "error": str(exc)},
        )

    return {
        "status": "healthy",
        "db": db_status,
        "version": "2.0.0",
        "ts": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# 5.2  Shipment Ingest + Kalman Update
# ---------------------------------------------------------------------------
@app.post("/shipments/ingest", tags=["shipments"])
async def ingest_shipment(
    payload: ShipmentIngest,
    tenant: TenantCtx = Depends(verify_api_key),
):
    """Ingest a shipment scan event.

    If actual_transit_hours is provided, runs a Kalman filter update cycle
    and persists the smoothed ETA estimate back to Supabase.
    """
    tenant_id = tenant["tenant_id"]

    # Load existing shipment state (or build fresh)
    try:
        existing = get_shipment(tenant_id, payload.shipment_id)
        kf_state = existing.get("kalman_state") or {}
    except HTTPException:
        existing = None
        kf_state = {}

    kf = KalmanFilter1D.from_dict(kf_state) if kf_state else KalmanFilter1D(
        initial_estimate=payload.promised_transit_hours
    )

    smoothed_eta = None
    if payload.actual_transit_hours is not None:
        smoothed_eta = kf.update(payload.actual_transit_hours)

    record = {
        "shipment_id": payload.shipment_id,
        "hub_id": payload.hub_id,
        "carrier": payload.carrier,
        "origin": payload.origin,
        "destination": payload.destination,
        "promised_transit_hours": payload.promised_transit_hours,
        "actual_transit_hours": payload.actual_transit_hours,
        "smoothed_eta_hours": smoothed_eta,
        "status": payload.status,
        "kalman_state": kf.to_dict(),
    }
    saved = upsert_shipment(tenant_id, record)

    return {
        "ok": True,
        "shipment_id": payload.shipment_id,
        "smoothed_eta_hours": smoothed_eta,
        "kalman_state": kf.to_dict(),
        "saved": saved,
    }


# ---------------------------------------------------------------------------
# 5.3  Hub Analytics — M/M/1 + Φ Decay + IRP
# ---------------------------------------------------------------------------
@app.post("/hubs/configure", tags=["hubs"])
async def configure_hub(
    payload: HubConfig,
    tenant: TenantCtx = Depends(verify_api_key),
):
    """Create or update a hub configuration."""
    tenant_id = tenant["tenant_id"]
    record = payload.model_dump()
    saved = upsert_hub(tenant_id, record)
    return {"ok": True, "hub": saved}


@app.get("/hubs/{hub_id}/analytics", tags=["hubs"])
async def hub_analytics(
    hub_id: str,
    tenant: TenantCtx = Depends(verify_api_key),
):
    """Run full analytics pipeline for a hub:
    1. M/M/1 queue metrics
    2. Φ Sigmoidal reliability score
    3. IRP detection
    """
    tenant_id = tenant["tenant_id"]
    hub = get_hub(tenant_id, hub_id)
    shipments = list_shipments(tenant_id, hub_id=hub_id)

    # M/M/1
    queue = mm1_queue_metrics(
        arrival_rate=hub.get("arrival_rate_per_hour", 1.0),
        service_rate=hub.get("service_rate_per_hour", 2.0),
    )

    # Φ Decay — days since last delivered shipment
    delivered = [s for s in shipments if s.get("status") == "delivered"]
    if delivered:
        last_ts_str = max(s["updated_at"] for s in delivered)
        last_ts = datetime.fromisoformat(last_ts_str.replace("Z", "+00:00"))
        age_days = (datetime.now(timezone.utc) - last_ts).total_seconds() / 86400
    else:
        age_days = 30.0  # assume worst case if no data

    base_reliability = hub.get("base_reliability", 0.95)
    phi_score = phi_sigmoidal_decay(base_reliability, age_days)

    # IRP
    on_time = sum(
        1
        for s in delivered
        if s.get("actual_transit_hours") is not None
        and s.get("promised_transit_hours") is not None
        and s["actual_transit_hours"] <= s["promised_transit_hours"]
    )
    irp = detect_irp(len(delivered), on_time, phi_score)

    return {
        "hub_id": hub_id,
        "queue_metrics": queue,
        "phi_reliability_score": phi_score,
        "age_days_since_last_delivery": round(age_days, 2),
        "irp": irp,
        "total_shipments_tracked": len(shipments),
        "delivered_count": len(delivered),
    }


# ---------------------------------------------------------------------------
# 5.4  SMS Alerts via Twilio
# ---------------------------------------------------------------------------
@app.post("/alerts/sms", tags=["alerts"])
async def send_sms_alert(
    payload: AlertRequest,
    tenant: TenantCtx = Depends(verify_api_key),
):
    """Send an SMS alert via Twilio.  Uses httpx (no requests library)."""
    if not all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER]):
        raise HTTPException(
            status_code=503,
            detail="Twilio credentials not configured on this deployment.",
        )

    url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json"
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
            data={
                "From": TWILIO_FROM_NUMBER,
                "To": payload.phone_number,
                "Body": payload.message,
            },
        )

    if resp.status_code not in (200, 201):
        logger.error("Twilio error: %s — %s", resp.status_code, resp.text)
        raise HTTPException(status_code=502, detail="SMS dispatch failed.")

    sid = resp.json().get("sid")
    logger.info("SMS sent | tenant=%s | sid=%s", tenant["tenant_id"], sid)
    return {"ok": True, "twilio_sid": sid}


# ===========================================================================
# SECTION 6 — PAYMENT PIPELINE (Cashfree full automation)
# ===========================================================================

@app.post("/payments/create-order", tags=["payments"])
async def create_cashfree_order(
    request: Request,
    tenant: TenantCtx = Depends(verify_api_key),
):
    """Create a Cashfree payment order and return the payment session ID.

    The frontend uses this session ID to open Cashfree's payment SDK.
    On success, Cashfree calls our /payments/webhook endpoint.
    """
    body = await request.json()
    order_amount = body.get("amount")  # INR, e.g. 4999
    customer_phone = body.get("phone")
    customer_email = body.get("email")
    customer_name = body.get("name", "SITI Client")

    if not all([order_amount, customer_phone, customer_email]):
        raise HTTPException(status_code=422, detail="amount, phone, email required.")

    tenant_id = tenant["tenant_id"]
    order_id = f"SITI-{tenant_id[:8].upper()}-{int(time.time())}"

    payload = {
        "order_id": order_id,
        "order_amount": float(order_amount),
        "order_currency": "INR",
        "customer_details": {
            "customer_id": tenant_id,
            "customer_name": customer_name,
            "customer_email": customer_email,
            "customer_phone": customer_phone,
        },
        "order_meta": {
            "tenant_id": tenant_id,
            "notify_url": os.environ.get("CASHFREE_WEBHOOK_URL", ""),
        },
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{CASHFREE_BASE}/orders",
            json=payload,
            headers={
                "x-client-id": CASHFREE_CLIENT_ID,
                "x-client-secret": CASHFREE_CLIENT_SECRET,
                "x-api-version": "2023-08-01",
                "Content-Type": "application/json",
            },
        )

    if resp.status_code not in (200, 201):
        logger.error("Cashfree order creation failed: %s", resp.text)
        raise HTTPException(status_code=502, detail="Payment gateway error.")

    cf_data = resp.json()
    return {
        "ok": True,
        "order_id": order_id,
        "payment_session_id": cf_data.get("payment_session_id"),
        "cf_order_id": cf_data.get("cf_order_id"),
    }


@app.post("/payments/webhook", tags=["payments"])
async def cashfree_webhook(request: Request):
    """Cashfree webhook handler — ZERO manual intervention.

    On PAID status:
    1. Verify signature (HMAC-SHA256).
    2. Extract tenant_id from order_meta.
    3. Auto-provision an API key in the `api_keys` table.
    4. (Optional) Send welcome SMS via Twilio.

    This endpoint is PUBLIC — no API key auth required.
    Security is provided by Cashfree's HMAC signature.
    """
    raw_body = await request.body()
    cf_signature = request.headers.get("x-webhook-signature", "")
    cf_timestamp = request.headers.get("x-webhook-timestamp", "")

    # --- Signature Verification ---
    webhook_secret = os.environ.get("CASHFREE_WEBHOOK_SECRET", "")
    if webhook_secret:
        expected = hmac.new(
            webhook_secret.encode(),
            (cf_timestamp + raw_body.decode()).encode(),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, cf_signature):
            logger.warning("Cashfree webhook: invalid signature — request rejected.")
            raise HTTPException(status_code=400, detail="Invalid webhook signature.")
    else:
        logger.warning("CASHFREE_WEBHOOK_SECRET not set — skipping signature check.")

    import json
    data = json.loads(raw_body)

    order_status = data.get("data", {}).get("order", {}).get("order_status", "")
    order_id = data.get("data", {}).get("order", {}).get("order_id", "")
    order_meta = data.get("data", {}).get("order", {}).get("order_meta", {}) or {}
    customer = data.get("data", {}).get("customer_details", {}) or {}
    tenant_id = order_meta.get("tenant_id", "")

    logger.info(
        "Cashfree webhook | order=%s | status=%s | tenant=%s",
        order_id,
        order_status,
        tenant_id,
    )

    if order_status != "PAID":
        return {"received": True, "action": "none", "order_status": order_status}

    if not tenant_id:
        logger.error("Cashfree PAID webhook missing tenant_id in order_meta.")
        return {"received": True, "action": "error", "detail": "missing tenant_id"}

    # --- Auto-provision API Key ---
    import secrets
    new_key = f"siti_{secrets.token_urlsafe(32)}"
    key_record = {
        "tenant_id": tenant_id,
        "key_value": new_key,
        "is_active": True,
        "created_from_order": order_id,
        "customer_email": customer.get("customer_email", ""),
        "customer_phone": customer.get("customer_phone", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        sb = get_supabase()
        sb.table("api_keys").insert(key_record).execute()
        logger.info("API key provisioned | tenant=%s | order=%s", tenant_id, order_id)
    except Exception as exc:
        logger.error("Failed to provision API key: %s", exc)
        return {"received": True, "action": "error", "detail": str(exc)}

    # --- Optional welcome SMS ---
    phone = customer.get("customer_phone")
    if phone and all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER]):
        msg = (
            f"Welcome to SITI Intelligence! Your API key: {new_key}\n"
            f"Docs: https://siti-gsc-kernel.onrender.com/docs\n"
            f"Keep this safe. Support: siti@yourdomain.com"
        )
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json",
                    auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
                    data={"From": TWILIO_FROM_NUMBER, "To": phone, "Body": msg},
                )
        except Exception as exc:
            logger.warning("Welcome SMS failed (non-fatal): %s", exc)

    return {
        "received": True,
        "action": "key_provisioned",
        "tenant_id": tenant_id,
        "order_id": order_id,
    }


# ===========================================================================
# SECTION 7 — ADMIN
# ===========================================================================

@app.get("/admin/tenants", tags=["admin"])
async def list_tenants(
    x_admin_secret: str = Header(..., alias="X-Admin-Secret"),
):
    """List all active tenants.  Protected by a separate admin secret,
    not a tenant API key.
    """
    expected = os.environ.get("SITI_ADMIN_SECRET", "")
    if not expected or not hmac.compare_digest(x_admin_secret, expected):
        raise HTTPException(status_code=401, detail="Invalid admin secret.")

    sb = get_supabase()
    result = sb.table("api_keys").select("tenant_id, customer_email, created_at, is_active").execute()
    return {"tenants": result.data or []}
