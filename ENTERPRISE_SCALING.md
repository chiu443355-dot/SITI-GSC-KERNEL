# SITI Intelligence — Enterprise Scaling Guide

## Current Architecture Capabilities

| Tier | Volume | Config | Cost |
|------|--------|--------|------|
| **Demo / Pilot** | 20 tenants, 100K rows/upload | Fly.io free, Atlas M0 | $0/mo |
| **SME** (Safexpress, regional 3PL) | 100 tenants, 500K rows | Fly.io 1GB, Atlas M10 | ~$65/mo |
| **Mid-Market** (Blue Dart, Ecom Express) | 300 tenants, 2M rows | Fly.io 4GB, Atlas M30, Redis | ~$275/mo |
| **Enterprise** (Delhivery, 1.5M/day) | 1000+ tenants, streaming | K8s + Atlas M50 + Redis cluster | ~$2K/mo |

---

## What's Production-Ready Right Now

- ✅ **Kalman state persisted** — server restart resumes warm predictions immediately
- ✅ **LR fit non-blocking** — runs in thread pool; ticks/state continue serving during 8s fit
- ✅ **Prometheus `/metrics`** — scrape with Datadog, Grafana, or any CNCF stack
- ✅ **JSON structured logs** — ingest directly into CloudWatch, Datadog, Loki
- ✅ **Request correlation IDs** — `X-Request-ID` on every response for distributed tracing
- ✅ **Circuit breaker** — MongoDB outage triggers 30s cooldown, not cascading failures
- ✅ **μ auto-calibration** — no manual tuning needed; derived from client upload data
- ✅ **Audit log** — every key create/revoke/settings change in `audit_log` collection
- ✅ **/health endpoint** — DB connectivity check for load balancer health probes
- ✅ **CSV row cap (100K)** — warns on large files, won't OOM the server

---

## Scaling to Delhivery (1.5M shipments/day)

### Step 1: Redis for session state (~1 week)

```bash
flyctl secrets set REDIS_URL="redis://your-redis:6379"
```

Replace `_sessions: dict` with Redis-backed sessions using `aioredis`. This enables:
- Multiple server instances (horizontal scaling)
- Session persistence across deploys
- Zero-downtime rolling updates

### Step 2: Upgrade compute

```toml
# fly.toml
[[vm]]
  memory = "4096mb"
  cpu_kind = "performance"
  cpus = 2
```

And increase CSV row cap:
```python
_MAX_CSV_ROWS = 500_000  # in server.py
```

### Step 3: Atlas M30+ with connection string

```bash
flyctl secrets set MONGO_URL="mongodb+srv://user:pass@cluster.mongodb.net/?appName=SITI&maxPoolSize=100"
```

### Step 4: For 1M+ shipments/day — separate LR worker

The LR fit (currently in thread pool) should become a Celery task:

```python
# celery_worker.py (separate process)
@celery.task
def fit_lr_task(tenant_key: str, df_parquet: bytes):
    df = pd.read_parquet(io.BytesIO(df_parquet))
    kernel = MIMIKernel(df)
    kernel.fit_lr(checkpoint=True)
    # Notify server via Redis pub/sub
```

This keeps the API server at <50ms p99 regardless of dataset size.

---

## Prometheus Alert Rules (copy into your alertmanager config)

```yaml
groups:
  - name: siti_alerts
    rules:
      - alert: HighIRPGap
        expr: siti_irp_gap_pp > 15
        for: 5m
        annotations:
          summary: "IRP gap {{ $value }}pp — high-value shipment failure rate rising"

      - alert: SlowRequests
        expr: histogram_quantile(0.99, siti_http_request_duration_seconds_bucket) > 2
        for: 2m
        annotations:
          summary: "p99 latency {{ $value }}s — investigate DB connection pool"

      - alert: TooManySessions
        expr: siti_active_sessions > 180
        for: 1m
        annotations:
          summary: "Session count {{ $value }} approaching LRU eviction threshold (200)"
```

---

## Environment Variables for Enterprise Deployment

```bash
# Required
MONGO_URL=mongodb+srv://...
DB_NAME=siti_production
API_KEYS=key1:ADMIN,key2:OPERATOR
JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
FRONTEND_URL=https://your-domain.com
RAZORPAY_WEBHOOK_SECRET=...
SENDGRID_KEY=SG.xxx

# Enterprise additions
REDIS_URL=redis://your-redis:6379          # enables horizontal scaling
LOG_LEVEL=INFO                              # or DEBUG for dev
PROMETHEUS_SCRAPE_TOKEN=internal-only      # protect /metrics in prod
MAX_CSV_ROWS=500000                        # override for enterprise tier
```
