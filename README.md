# SITI Intelligence — MIMI Kernel

**B2B logistics SaaS. Detects supply chain leakage using Kalman Filter + Inverse Reliability Paradox mathematics.**

## Quick Start

## Backend (Render - Production)
1. Link this GitHub repo to your Render Web Service.
2. Ensure **Runtime** is set to `Python 3`.
3. **Build Command:** `pip install -r requirements.txt`
4. **Start Command:** `gunicorn backend.app:app`
5. **Environment Variables:** Set your `MONGO_URL`, `JWT_SECRET`, etc., in the Render Dashboard.

### Frontend (Vercel — free)

Set in Vercel dashboard:
```
REACT_APP_BACKEND_URL = https://siti-gsc-kernel-1.onrender.com
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

 Inverse Reliability Paradox
