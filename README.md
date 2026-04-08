# SITI Intelligence — MIMI Kernel v4.0

**B2B logistics SaaS. Detects supply chain leakage using Kalman Filter + Inverse Reliability Paradox mathematics.**

---

## 🚨 CRITICAL DEPLOYMENT FIXES (v4.0)

These bugs were breaking the entire production deployment:

| Bug | Symptom | Fix |
|-----|---------|-----|
| Wrong gunicorn entry point | Backend dead on Render | `gunicorn backend.main:app` |
| Missing Cashfree create-order | All payments silently WhatsApp-only | Added `/api/payments/create-order` |
| Kaggle CSV column mismatch | Every CSV upload failed | Auto-synthesis of arrival_rate/service_rate |
| Kalman prediction wrong | T+3 forecast was meaningless | Proper random-walk Kalman model |
| IRP score = 0 at small scale | IRP always showed 0 for small datasets | Fixed scale-aware formula |

---

## Backend (Render)

1. Link this GitHub repo to your Render Web Service.
2. Set **Runtime**: Python 3.11
3. **Build Command**: `pip install -r backend/requirements.txt`
4. **⚠️ Start Command** (CRITICAL FIX): `gunicorn backend.main:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120`
5. Set Environment Variables in Render Dashboard (see below).

> **Why `backend.main:app`?** The Flask app is in `backend/main.py`. The old README said `backend.app:app` which pointed to a non-existent file — this caused a crash on every cold start.

### Required Environment Variables

| Variable | Required | Description |
|---|---|---|
| `CORS_ORIGINS` | ✅ | Your Vercel URL: `https://siti-gsc-kernel.vercel.app` |
| `API_KEYS` | ✅ | `siti-admin-key-001:ADMIN,siti-ops-key:OPERATOR` |
| `FRONTEND_URL` | ✅ | `https://siti-gsc-kernel.vercel.app` |
| `BACKEND_URL` | ✅ | `https://siti-gsc-kernel-1.onrender.com` |
| `CASHFREE_APP_ID` | Payments | From Cashfree dashboard |
| `CASHFREE_SECRET_KEY` | Payments | From Cashfree dashboard |
| `CASHFREE_ENV` | Payments | `production` or `sandbox` |
| `CASHFREE_WEBHOOK_SECRET` | Payments | From Cashfree webhook settings |
| `SUPABASE_URL` | API Keys | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | API Keys | Supabase service key |
| `TWILIO_ACCOUNT_SID` | Alerts | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Alerts | Twilio auth token |
| `TWILIO_FROM_NUMBER` | Alerts | Your Twilio number |
| `TWILIO_ALERT_NUMBER` | Alerts | Number to receive alerts |
| `OPENROUTER_API_KEY` | AI | OpenRouter key for AI analysis |
| `WHATSAPP_NUMBER` | Payments | `918956493671` |

### Without Cashfree (WhatsApp Fallback)
If `CASHFREE_APP_ID` is not set, all payment buttons redirect to WhatsApp with pre-filled message. Set `WHATSAPP_NUMBER` to your business number.

---

## Frontend (Vercel)

```bash
# Install
cd frontend && npm install

# Dev
npm start

# Build
npm run build
```

### Vercel Environment Variables

```
REACT_APP_BACKEND_URL=https://siti-gsc-kernel-1.onrender.com
REACT_APP_API_KEY=siti-admin-key-001
```

---

## Architecture

- **Backend**: Flask + Supabase (optional) + Kalman Filter (1D) + M/M/1 queueing
- **Frontend**: React 19, dark purple/teal/coral aesthetic
- **Auth**: API key (RBAC) with Supabase persistence + env-based fallback
- **Payments**: Cashfree webhook → auto-provision API key + SendGrid/WhatsApp delivery

## Key Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Health check for Render |
| `GET` | `/ping` | None | UptimeRobot keep-alive |
| `GET` | `/api/kernel/status` | Key | Full MIMI kernel state |
| `POST` | `/api/kernel/reset` | Key | Upload CSV (auto-maps columns) |
| `POST` | `/api/kernel/upload` | Key | Alias for reset |
| `POST` | `/api/kernel/predict` | Key | Kalman T+3 prediction |
| `POST` | `/api/kernel/analyze` | None | AI explanation |
| `POST` | `/api/payments/create-order` | Key | **NEW** Cashfree order |
| `POST` | `/api/payments/cashfree-webhook` | Sig | Payment webhook |
| `POST` | `/api/alerts/test` | Key | Test Twilio SMS |
| `GET` | `/api/admin/keys` | Key | List API keys |
| `POST` | `/api/admin/create-key` | Key | Create API key |

## CSV Compatibility

SITI v4.0 auto-maps columns from any logistics CSV:

| SITI Field | Kaggle | Delhivery | Custom |
|---|---|---|---|
| `hub_id` | `Warehouse_block` | `origin_hub` | `block`, `depot`, `zone` |
| `arrival_rate` | *auto-synthesized from row distribution* | `arrival_count` | `lambda` |
| `service_rate` | *auto-synthesized from hub count* | `throughput` | `mu`, `capacity` |
| `shipment_id` | `ID` | `waybill` | `order_id`, `awb` |

If your CSV uses `Warehouse_block` (Kaggle e-commerce dataset), SITI automatically:
1. Maps `Warehouse_block → hub_id`
2. Computes `arrival_rate` as the proportion of shipments per hub × 100
3. Sets `service_rate` as equal capacity across all hubs

## Keep-Alive (Render Free Tier)

Set up UptimeRobot to ping `https://siti-gsc-kernel-1.onrender.com/ping` every 10 minutes to prevent cold starts.

## Cashfree Webhook Setup

1. Cashfree Dashboard → Developers → Webhooks → Add Webhook
2. URL: `https://siti-gsc-kernel-1.onrender.com/api/payments/cashfree-webhook`
3. Events: `PAYMENT_SUCCESS`
4. Copy the Webhook Secret → Render env var `CASHFREE_WEBHOOK_SECRET`
