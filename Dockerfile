# ─── SITI INTELLIGENCE — PRODUCTION DOCKERFILE ───────────────────────────────
# Multi-stage build: slim final image, no dev tooling in production
# Base: python:3.11-slim  (~45MB vs ~900MB full)
#
# Build:   docker build -t siti-sovereign:v8 .
# Run:     docker-compose up -d

# ── Stage 1: dependency resolver ──────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

# Only copy requirements first — layer cache: deps rebuild only when reqs change
COPY backend/requirements.txt .

RUN pip install --upgrade pip --quiet \
 && pip install --no-cache-dir -r requirements.txt \
 && pip list > /build/installed.txt

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM python:3.11-slim AS production

LABEL maintainer="SITI Intelligence"
LABEL version="8.0.0"
LABEL description="MIMI Kernel — Diamond-Final Enterprise Build"

# Non-root user for security
RUN groupadd -r siti && useradd -r -g siti siti

WORKDIR /app

# Copy installed packages from builder stage
COPY --from=builder /usr/local/lib/python3.11 /usr/local/lib/python3.11
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY backend/ .

# Checkpoint directory — persisted via Docker volume
RUN mkdir -p /app/checkpoints && chown siti:siti /app/checkpoints

# Warm-start: checkpoint file lives in /app/checkpoints (mounted volume)
# Server reads CHECKPOINT_PATH from env; defaults to /app/mimi_kernel_v1.joblib
ENV CHECKPOINT_PATH=/app/checkpoints/mimi_kernel_v1.joblib

# Security: no hardcoded keys — all secrets via environment
# Required at runtime: API_KEYS (format: key:ROLE,key2:ROLE2), MONGO_URL, DB_NAME
# Optional: TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM, TWILIO_TO
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Drop to non-root
USER siti

EXPOSE 8000

# ── PRODUCTION SERVER ─────────────────────────────────────────────────────────
# Single worker (correct for current architecture):
#   _sessions and VALID_API_KEYS are in-process dicts.
#   Multi-worker = each process has its own copy = auth inconsistency.
#
# ── SCALING TIERS ─────────────────────────────────────────────────────────────
# TIER 1 — Demo / Pilot (current):
#   Fly.io free (256MB), MongoDB Atlas M0 (free), single uvicorn worker
#   Handles: up to 20 concurrent tenants, CSV up to 100K rows, ~100 req/min
#   Cost: $0/mo
#
# TIER 2 — SME clients (Safexpress, regional 3PLs):
#   Fly.io shared-cpu-1x 1GB ($5/mo), Atlas M10 ($57/mo)
#   Workers: still 1 (migrate sessions to Redis first for multi-worker)
#   Handles: 100 tenants, CSV up to 500K rows, ~1000 req/min
#   Cost: ~$65/mo
#
# TIER 3 — Enterprise (Blue Dart, Ecom Express):
#   Fly.io performance-2x 4GB ($60/mo), Atlas M30 ($200/mo), Redis ($15/mo)
#   Workers: 4 (after Redis migration), _MAX_CSV_ROWS=500_000
#   Handles: 500 tenants, CSV up to 2M rows, ~10K req/min
#   Cost: ~$275/mo
#
# TIER 4 — Giant (Delhivery, 1.5M shipments/day):
#   Kubernetes + Redis cluster + Atlas M50+ + separate Celery workers for LR fit
#   This is a 6-month engineering effort, not a config change.
#   The MIMI math and IRP detection work at any scale — the infra wrapping needs rebuilding.
#
# Warm start: first cold LR fit 30-45s. All subsequent restarts <100ms (joblib checkpoint).
HEALTHCHECK --interval=30s --timeout=15s --start-period=90s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api').read()" || exit 1

CMD ["python3", "-m", "uvicorn", "server:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "1", \
     "--loop", "asyncio", \
     "--access-log"]
