#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# SITI INTELLIGENCE — ENTERPRISE DEPLOYMENT SCRIPT
# Run this from your local repo root
# ═══════════════════════════════════════════════════════════════════════════

echo "=== STEP 1: Remove artifact files ==="
git rm ".gitconfig" "test_result.md" 2>/dev/null || echo "Already removed or not tracked"
# If zip files exist:
git rm "SITI-SOVEREIGN-FIXED (5).zip" "SITI-SOVEREIGN-v3-SEED107.zip" 2>/dev/null || true

echo "=== STEP 2: Copy fixed server.py ==="
# Replace backend/server.py with the fixed version from siti-fixes/server.py

echo "=== STEP 3: Fix design_guidelines.json brand name ==="
# Change "NodeGuard GSC" to "SITI Intelligence"
sed -i 's/"NodeGuard GSC"/"SITI Intelligence"/g' design_guidelines.json

echo "=== STEP 4: Fix tailwind.config.js brand prefixes ==="
# In tailwind.config.js, ng-* colors are fine to keep for backward compat
# but update the comment

echo "=== STEP 5: Add LICENSE ==="
cat > LICENSE.md << 'EOF'
SITI Intelligence Proprietary License
Copyright (c) 2026 SITI Intelligence

All rights reserved. This software is proprietary and confidential.
Unauthorized copying, distribution, or use is strictly prohibited.
For licensing inquiries: contact@siti-intelligence.io
EOF

echo "=== STEP 6: Commit and push ==="
git add -A
git commit -m "Enterprise hardening: multi-tenant sessions, Razorpay sig verification, real IRP data, CORS fix, lifespan migration, lambda cap, block E, LR subsample"
git push origin main

echo ""
echo "=== RENDER ENV VARS TO SET ==="
echo "CORS_ORIGINS=https://siti-gsc-kernel.vercel.app"
echo "API_KEYS=siti-admin-key-001:ADMIN,siti-ops-key-002:OPERATOR,siti-demo-public:READONLY"
echo "RAZORPAY_WEBHOOK_SECRET=<from razorpay dashboard>"
echo "MONGO_URL=<your atlas connection string>"
echo ""
echo "=== RAZORPAY SETUP STEPS ==="
echo "1. Login to razorpay.com/dashboard"
echo "2. Settings -> Webhooks -> Add New Webhook"
echo "3. URL: https://siti-gsc-kernel-1.onrender.com/api/payments/razorpay-webhook"
echo "4. Events: Check 'payment.captured'"
echo "5. Copy the Secret shown -> paste into Render env as RAZORPAY_WEBHOOK_SECRET"
echo "6. To test: Dashboard -> Payments -> create test payment with notes.plan=pilot"
