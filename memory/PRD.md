# NodeGuard GSC — PRD

## Problem Statement
Build "NodeGuard GSC," a SaaS Web Dashboard for predictive logistics recovery. Uses attached Train-Train.csv as initial industrial dataset for Safexpress Case #02028317. Core logic: MIMI Kernel with Hub Utilization (ρ), Sigmoidal Decay Φ(ρ), Inverse Reliability Paradox, Kalman Filter T+1 prediction.

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Recharts + KaTeX + react-fast-marquee
- **Backend**: FastAPI + scikit-learn + NumPy/Pandas (in-memory MIMI Kernel)
- **Database**: MongoDB (minimal use, kernel state is in-memory)
- **URL**: https://hub-utilization.preview.emergentagent.com

## User Personas
- C-suite executives reviewing forensic audit reports
- Logistics operations directors monitoring hub performance
- Board members receiving PDF audit reports for decision-making

## Core Requirements (Static)
1. MIMI Kernel: Hub Utilization ρ = N_late/N_total
2. Sigmoidal Decay: Φ(ρ) = 1/(1 + e^(15(ρ - 0.85)))
3. Inverse Reliability Paradox: High-importance failures × $3.94 leakage seed
4. Kalman Filter T+1 prediction
5. Catastrophe Alert when ρ > 0.80 (red UI + banner)
6. Data Injection (Genius Reset) - CSV upload + LR refit
7. PDF Forensic Audit Export with Mission LiFE tag
8. Real-time auto-refresh every 4 seconds
9. Dark mode (Bloomberg Terminal aesthetic)
10. LaTeX formula display via KaTeX

## What's Been Implemented (Feb 24, 2026) — v2.0 Update

### Backend Enhancements
- **Φ(ρ) Formula Updated**: k=20, Φ(ρ) = 1/(1 + e^{-20(ρ - ρ_c)}) — now represents INSTABILITY (higher = worse)
- **W_q (M/M/1 Queue Wait)**: W_q = ρ/(1-ρ), μ=1 normalized
- **average_delay_per_block()**: Customer_care_calls × mode_factor × 8h for late shipments per block
- **red_zone_importance()**: Product importance breakdown (High/Medium/Low) for Red Zone (ρ>0.80) shipments
- **routing_logic()**: Autonomous GSC routing — identifies overloaded (>0.85) vs available (<ρ_c-ε) blocks
- **Two catastrophe levels**: catastrophe (ρ>0.80) + collapse (ρ≥0.85)
- **Failure rate & CLV**: $1.20 recovery + $2.74 CLV = $3.94 leakage seed per unit

### Frontend Updates
- **HubCharts**: Replaced old utilization bar + mode pie with:
  - NEW: "Average Delay per Warehouse Block" bar chart (hours, color-coded)
  - NEW: "Red Zone Product Importance" pie chart (High=red, Medium=amber, Low=green)
  - Reference lines at 0.80 and 0.85 on ρ trajectory chart
- **MIMIPanel**: 6 formulas — updated Φ(ρ) with k=20 formula, new W_q formula, updated leakage ($1.20+$2.74=$3.94)
- **Dashboard**: Two-level alert banners, Instability Index KPI, W_q KPI, failure rate KPI
- **RoutingWidget**: GSC autonomous routing logic panel (overloaded/available blocks + ε buffer)

### Backend (server.py)
- MIMIKernel class with base_rho(), phi(), kalman_step(), inverse_reliability(), warehouse_metrics(), mode_metrics(), fit_lr()
- Synthetic Safexpress dataset generation (n=10999, ρ≈0.82)
- GET /api/kernel/state - Full MIMI kernel state
- POST /api/kernel/tick - Simulate incoming shipments, increment recovery counter
- POST /api/kernel/upload - CSV upload, wipe historical weights, refit LR, recalculate ρ_critical
- Logistic Regression (scikit-learn) for fresh threshold calculation on upload

### Frontend Components
- **ExecutiveHUD** - Logo, ticker marquee (react-fast-marquee), $2.81M exposure, status indicator
- **Dashboard** - Main orchestrator, catastrophe mode, KPI cards, layout grid
- **MIMIPanel** - 5 KaTeX LaTeX formulas: ρ, Φ(ρ), L, Kalman estimator, Kalman gain
- **HubCharts** - Warehouse utilization bar chart, mode pie chart, ρ history area chart (Recharts)
- **FailureTable** - Inverse reliability paradox table with pagination
- **DataInjection** - CSV upload (Genius Reset) + PDF export (jsPDF + autotable + Mission LiFE tag)

## Initial Dataset Stats
- n_total: 10,999 shipments
- Base ρ: 0.8221 (catastrophe zone)
- ρ_critical (LR-computed): 0.8318
- High-importance failures: ~1,338
- Total leakage: ~$5,271.72

## Prioritized Backlog

### P0 (Critical - DONE)
- [x] MIMI Kernel math implementation
- [x] Dashboard with Bloomberg Terminal dark mode
- [x] Catastrophe alert (ρ > 0.80)
- [x] LaTeX formula rendering
- [x] Kalman Filter T+1 prediction
- [x] Recovery Counter real-time ticker
- [x] Data Injection + Genius Reset
- [x] PDF Forensic Audit Export

### P1 (High Priority - Next Phase)
- [ ] Authentication (login/session for B2B SaaS)
- [ ] Multiple case management (multiple Safexpress cases)
- [ ] Real CSV data upload from actual Safexpress dataset
- [ ] Email report delivery (SendGrid integration)
- [ ] Historical case comparison

### P2 (Enhancement - Future)
- [ ] Multi-hub network visualization (graph/map)
- [ ] Anomaly detection alerts (email/SMS via Twilio)
- [ ] Revenue impact calculator with pricing tiers
- [ ] White-label PDF with client branding
- [ ] API rate limiting and key management

## Next Action Items
1. Upload actual Safexpress Train.csv data via the Genius Reset module
2. Add authentication for B2B SaaS monetization
3. Integrate email delivery of forensic audit reports
