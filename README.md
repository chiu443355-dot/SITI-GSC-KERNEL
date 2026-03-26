# SITI Intelligence — MIMI Kernel

**B2B logistics SaaS. Detects supply chain leakage using Kalman Filter + Inverse Reliability Paradox mathematics.**

## Quick Start

### Backend (Fly.io — free, no card)

```bash
cd SITI_SOVEREIGN/backend
flyctl launch --no-deploy
flyctl secrets set \
  MONGO_URL="mongodb+srv://user:pass@cluster.mongodb.net/?appName=SITI-Main" \
  DB_NAME="siti_production" \
  API_KEYS="your-admin-key:ADMIN" \
  JWT_SECRET="$(python3 -c 'import secrets; print(secrets.token_hex(32))')" \
  FRONTEND_URL="https://your-app.vercel.app" \
  RAZORPAY_WEBHOOK_SECRET="your-razorpay-secret" \
  SENDGRID_KEY="SG.your-sendgrid-key"
flyctl deploy
```

### Frontend (Vercel — free)

Set in Vercel dashboard:
```
REACT_APP_BACKEND_URL = https://your-app.fly.dev
REACT_APP_API_KEY     = your-admin-key  (optional — users can log in instead)
```

## Architecture

- **Backend**: FastAPI + Motor (async MongoDB) + Kalman Filter (2D state space) + M/M/1 queueing
- **Frontend**: React 19, Bloomberg Terminal dark aesthetic
- **Auth**: API key (RBAC: ADMIN/OPERATOR/INTEGRATOR/READONLY) + JWT sessions
- **Payments**: Razorpay webhook → auto-provision + SendGrid email delivery

## Environment Variables

Copy `backend/.env.example` and fill in values. **Never commit a real `.env` file.**

| Variable | Required | Description |
|---|---|---|
| `MONGO_URL` | ✅ | MongoDB Atlas connection string |
| `DB_NAME` | ✅ | Database name |
| `API_KEYS` | ✅ | `key:ROLE` pairs, comma-separated |
| `JWT_SECRET` | ✅ | 32-byte hex secret |
| `FRONTEND_URL` | ✅ | Vercel URL (for CORS) |
| `RAZORPAY_WEBHOOK_SECRET` | Billing | From Razorpay dashboard |
| `SENDGRID_KEY` | Email | `SG.xxx` key |
| `TWILIO_SID/TOKEN/TO` | WhatsApp alerts | Optional |

## Key Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/kernel/state` | Full MIMI kernel state (Kalman, IRP, hubs) |
| `POST` | `/api/kernel/upload` | Upload client CSV dataset |
| `POST` | `/api/v1/intercept` | Real-time shipment interception |
| `POST` | `/api/admin/create-key` | Provision new client API key |
| `POST` | `/api/payments/razorpay-webhook` | Payment → auto-provision |

## Research

IEEE Case #02028317 · Wankhede (2026) · Inverse Reliability Paradox
