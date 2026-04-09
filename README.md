# SITI Intelligence Kernel v2.0 — Unicorn-Ready Refactor

## What Changed (and Why)

| Problem | v1 Behaviour | v2 Fix |
|---|---|---|
| State lost on sleep | `_kernels` dict in RAM | All state in Supabase (PostgreSQL) |
| Auth security hole | `siti-admin-key-001` env fallback | DB-only lookup, no hardcoded fallback |
| Render crash loop | Eager Supabase import at startup | `get_supabase()` lazy init |
| Manual payment flow | Fell back to WhatsApp | Cashfree webhook auto-provisions API key |
| Data leakage risk | No tenant filter audit | Every query uses `_tenant_guard()` |

---

## Quickstart (5 Steps)

### Step 1 — Run the Schema
Open Supabase Dashboard → SQL Editor → paste `schema.sql` → Run.

### Step 2 — Set Render Environment Variables
In your Render service → Environment:

```
SUPABASE_URL        = https://xxxx.supabase.co
SUPABASE_KEY        = eyJhbGci...  (service role key, NOT anon key)
SITI_ADMIN_SECRET   = generate with: python -c "import secrets; print(secrets.token_urlsafe(32))"
CASHFREE_CLIENT_ID  = from Cashfree dashboard
CASHFREE_CLIENT_SECRET = from Cashfree dashboard
CASHFREE_WEBHOOK_SECRET = from Cashfree dashboard → Webhooks
CASHFREE_WEBHOOK_URL = https://your-render-url.onrender.com/payments/webhook
CASHFREE_ENV        = TEST  (change to PROD when live)
TWILIO_ACCOUNT_SID  = from Twilio console
TWILIO_AUTH_TOKEN   = from Twilio console
TWILIO_FROM_NUMBER  = +1415XXXXXXX
```

### Step 3 — UptimeRobot (Prevent Cold Sleep)
Add a new monitor:
- URL: `https://your-render-url.onrender.com/ping`
- Interval: 10 minutes
- This keeps Render's free tier awake during business hours.

### Step 4 — Create First Tenant (Manual, One-Time)
```sql
-- In Supabase SQL Editor:
INSERT INTO api_keys (tenant_id, key_value, is_active, customer_email)
VALUES (
    'tenant_spoton_001',
    'siti_' || encode(gen_random_bytes(24), 'base64'),
    true,
    'ops@spoton.in'
);
```

### Step 5 — Test the API
```bash
# Health check (no auth)
curl https://your-render-url.onrender.com/health

# Ingest a shipment (with auth)
curl -X POST https://your-render-url.onrender.com/shipments/ingest \
  -H "X-API-Key: siti_YOUR_KEY_HERE" \
  -H "X-Tenant-ID: tenant_spoton_001" \
  -H "Content-Type: application/json" \
  -d '{
    "shipment_id": "AWB123456",
    "hub_id": "hub_mumbai_01",
    "carrier": "Spoton",
    "origin": "Mumbai",
    "destination": "Nagpur",
    "promised_transit_hours": 24,
    "actual_transit_hours": 27.5
  }'

# Hub analytics
curl https://your-render-url.onrender.com/hubs/hub_mumbai_01/analytics \
  -H "X-API-Key: siti_YOUR_KEY_HERE" \
  -H "X-Tenant-ID: tenant_spoton_001"
```

---

## Architecture Decisions

### Why stateless?
Render Free Tier spins down after 15 mins. Any Python dict dies. Supabase
PostgreSQL is the only persistent layer. Every request is `fetch → compute → save`.

### Why `get_supabase()` lazy init?
Render injects env-vars AFTER the process starts. Eager module-level init
(`supabase = create_client(os.environ["SUPABASE_URL"], ...)`) crashes before
the env is set. Lazy init defers the call to first request time.

### Why no `lru_cache` for API key lookup?
`lru_cache` has no TTL. We use a manual dict with `time.monotonic()` comparison
for a 30-second sliding window. This absorbs burst traffic (100 req/sec from
the same tenant = 1 DB hit per 30s) without stale keys living forever.

### Core IP preserved
- `KalmanFilter1D` — Kalman 1960, state stored as JSONB in `shipments.kalman_state`
- `mm1_queue_metrics` — M/M/1 queueing theory, runs per-request
- `phi_sigmoidal_decay` — Smiti's Φ function, parameterised
- `detect_irp` — Inverse Reliability Paradox flag

---

## Payment Flow (Cashfree)

```
Client → POST /payments/create-order → Cashfree API → payment_session_id
                                                            ↓
                                               Customer pays on Cashfree UI
                                                            ↓
Cashfree → POST /payments/webhook (HMAC verified) → INSERT api_keys → SMS to customer
```

Zero manual intervention. Zero WhatsApp messages needed.
