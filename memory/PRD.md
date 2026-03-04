# SITI Intelligence — PRD (Updated 2026-03-04)

## Brand Identity
- **Name**: SITI Intelligence
- **Tagline**: "Logic for the Paradox // Powered by MIMI"
- **Symbol**: Sigmoid S-curve (SVG) — represents logistics flow from stable to chaotic
- **Message**: "We control the curve."
- **Palette**: Bloomberg Amber (#FFB340) + Cyber Blue (#64D2FF) on Pure Black (#050505)

## Problem Statement
Build "SITI Intelligence," a SaaS Web Dashboard for predictive logistics recovery. Uses Safexpress Case #02028317 dataset. Core logic: MIMI Kernel with Hub Utilization (ρ), Sigmoidal Decay Φ(ρ), Inverse Reliability Paradox, Kalman Filter T+1 prediction.

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Recharts + KaTeX + react-fast-marquee
- **Backend**: FastAPI + scikit-learn + NumPy/Pandas (in-memory MIMI Kernel)
- **Database**: MongoDB (minimal use, kernel state is in-memory)
- **URL**: https://siti-logistics-hub.preview.emergentagent.com

## User Personas
- C-suite executives reviewing forensic audit reports
- Logistics operations directors monitoring hub performance
- Board members receiving PDF audit reports for decision-making

## Core Requirements (Static)
1. MIMI Kernel: Hub Utilization ρ = N_late/N_total
2. Sigmoidal Decay: Φ(ρ) = 1/(1 + e^(20(ρ - 0.85)))
3. Inverse Reliability Paradox: High-importance failures × $3.94 leakage seed
4. Kalman Filter T+1 prediction
5. Catastrophe Alert when ρ > 0.80 (orange banner)
6. Collapse Alert when ρ ≥ 0.85 (red full-screen border + red banner)
7. Data Injection (Genius Reset) - CSV upload + LR refit + full-screen calibration overlay
8. PDF Forensic Audit Export with Mission LiFE tag (static jsPDF imports)
9. Real-time auto-refresh every 4 seconds
10. Dark mode (Bloomberg Terminal aesthetic)
11. LaTeX formula display via KaTeX
12. Live Telemetry Stream — 100 virtual units every 10s without CSV
13. Fuzzy column mapping for messy CSV uploads + mean-fill missing values

## What's Been Implemented

### v1.0 (Initial Build)
- Full-stack React/FastAPI project
- MIMI Kernel with Sigmoidal Decay, Kalman Filter, fiscal leakage
- Dashboard dark-mode UI, KPI cards, catastrophe alerts
- Recharts bar/pie/area charts
- PDF Forensic Audit Export
- CSV upload Genius Reset
- LaTeX formulas via KaTeX
- Recovery counter real-time ticker

### v2.0 (Feb 24, 2026 — Rebranding + Chart Enhancement)
- Full rebrand from NodeGuard GSC → SITI Intelligence
- Φ(ρ) updated: k=20 instability formula
- W_q (M/M/1 queue wait), average_delay_per_block(), red_zone_importance()
- RoutingWidget (GSC autonomous routing)
- Two-level catastrophe alert (ρ>0.80 and ρ≥0.85)
- Recharts: Average Delay per Warehouse Block + Red Zone Importance charts

### v3.0 (Mar 04, 2026 — Enterprise Pitch Overhaul)
- **Chart Sizing**: All 3 Recharts containers raised to 450px height (bar, pie, area)
- **HIGH CONTRAST DARK tooltips**: All tooltips now use white background (#FFFFFF) + black text (#000000)
- **Neon Green Kalman Line**: T+1 Kalman Projection is now `stroke="#39FF14"` dashed `strokeDasharray="10 5"`
- **Variable Stroke Width**: Kalman line thickness scales with avg gap between observed and predicted (1.5–5.5px)
- **Ghost Trigger**: "SIMULATE LIVE STREAM" injects 50 virtual units/second, auto-stops after 90 ticks; mutually exclusive with normal stream
- **LIVE INFERENCE badge**: Pulsing neon green badge in ExecutiveHUD top-right when Ghost Trigger or Live Stream is active
- **Client-Side Pre-Processor**: `PRE_PROCESSOR_MAP` dict in DataInjection.jsx with 11 field mappings + fuzzy keyword matching
- **Schema Mismatch UI**: Structured 400 error returns `found_columns` + `required_unmapped`; frontend shows `<SchemaMapper>` with per-column dropdowns and "APPLY MAPPING & REPROCESS" button
- **Regex Sanitizer**: `_sanitize_numeric()` strips '100kg'→100, '$5.00'→5.00, '3,500'→3500 before Kernel ingest
- **$2.81M Exposure**: Always anchored top-right in ExecutiveHUD, never hidden
- **PDF Stabilization**: Removed dynamic await import() — static jsPDF + autoTable imports
- **Full-Screen Calibration Overlay**: Scrolling amber kernel weights background + progress bar
- **Kill Zone Badge**: Dashed red "COLLAPSE THRESHOLD ρ=0.85" badge on bar chart
- **Crimson Screen Border**: CSS pulse animation on full viewport when ρ ≥ 0.85
- **Tooltip Fix**: All Recharts tooltips now use #1F2937 bg + #FFFFFF text
- **Chart Size 2x**: Bar and Pie chart containers raised to 280px height
- **External Pie Labels**: No-overlap labels with connector lines, white text
- **High-Contrast Text**: Secondary text upgraded from #555→#888, #A1A1AA→#D4D4D8
- **Live Telemetry Stream**: "INITIATE LIVE STREAM" toggle injects 100 virtual units every 10s
- **Fuzzy Column Mapping**: Enhanced _fuzzy_map_columns() with 11-field matcher + carrier/tier aliases
- **Mean-Fill**: Missing numeric values filled with column means (not zeros)
- **3-Column DataInjection**: Genius Reset | PDF Export | Live Telemetry (separate columns)

## Backend API Endpoints
- `GET /api/kernel/state` — Full MIMI kernel state
- `POST /api/kernel/tick` — Simulate incoming shipments, increment recovery counter
- `POST /api/kernel/upload` — CSV upload with fuzzy mapping + mean-fill + LR refit
- `POST /api/kernel/stream-batch?n=100` — Inject n virtual units for live telemetry

## Initial Dataset Stats
- n_total: 10,999 shipments
- Base ρ: 0.8221 (catastrophe zone)
- ρ_critical (LR-computed): 0.8318
- High-importance failures: ~1,338
- Total leakage: ~$5,271.72

## Prioritized Backlog

### P0 (DONE)
- [x] MIMI Kernel math
- [x] Dashboard Bloomberg Terminal dark mode
- [x] Two-level catastrophe alert (ρ>0.80 / ρ≥0.85)
- [x] LaTeX formula rendering (KaTeX)
- [x] Kalman Filter T+1 prediction
- [x] Recovery Counter real-time ticker
- [x] Data Injection + Genius Reset
- [x] PDF Forensic Audit Export (static imports)
- [x] Full-screen calibration overlay
- [x] Kill zone marker on bar chart
- [x] Crimson screen border collapse mode
- [x] Live Telemetry Stream
- [x] Fuzzy column mapping + mean-fill

### P1 (High Priority — Next Phase)
- [ ] Authentication (JWT or Google OAuth) for B2B SaaS
- [ ] Multiple case management (multiple Safexpress cases)
- [ ] Email report delivery (SendGrid integration)
- [ ] Historical case comparison

### P2 (Enhancement — Future)
- [ ] Multi-hub network visualization (graph/map)
- [ ] Anomaly detection alerts (email/SMS via Twilio)
- [ ] Revenue impact calculator with pricing tiers
- [ ] White-label PDF with client branding
- [ ] FastAPI lifespan context manager (replace deprecated @app.on_event)
- [ ] Add warehouse block 'E' support in warehouse_metrics()

## Next Action Items
1. Add authentication for B2B SaaS monetization (JWT or Google OAuth)
2. Integrate email delivery of forensic audit reports (SendGrid)
3. Upload actual Safexpress Train.csv data via Genius Reset module
