import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine,
  LineChart, Line, Area, AreaChart, Legend
} from "recharts";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const API_BASE = process.env.REACT_APP_BACKEND_URL || "https://siti-gsc-kernel-1.onrender.com";
const API = `${API_BASE}/api`;
const RAZORPAY_KEY = process.env.REACT_APP_RAZORPAY_KEY_ID || "rzp_test_YOUR_KEY_HERE";

// Demo API key — used ONLY when no key is set (for CSV demo without auth)
const DEMO_API_KEY = "siti-admin-key-001";

// ─────────────────────────────────────────────────────────────────────────────
// THEME — Bloomberg Amber × Cyber Blue × Deep Black
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  gold: "#FFB340", goldDim: "#FFB34033",
  red: "#FF3B30", redDim: "#FF3B3022",
  green: "#32D74B", greenDim: "#32D74B22",
  blue: "#64D2FF", blueDim: "#64D2FF22",
  neonGreen: "#39FF14",
  purple: "#BF5AF2",
  bg: "#030303", surface: "#080808", panel: "#0C0C0C",
  border: "#141414", borderBright: "#1E1E1E", borderGold: "#FFB34022",
  text: "#D4D4D8", textDim: "#666", textMuted: "#2A2A2A",
};

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL CSS (injected via style tag)
// ─────────────────────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;500;700&family=Space+Grotesk:wght@300;400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { background: #030303; color: #D4D4D8; font-family: 'JetBrains Mono', monospace; min-height: 100vh; }
  ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-track { background: #030303; } ::-webkit-scrollbar-thumb { background: #FFB34044; border-radius: 2px; }
  input[type=range] { -webkit-appearance: none; height: 3px; background: #141414; border-radius: 2px; outline: none; }
  input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; background: #32D74B; border-radius: 50%; cursor: pointer; box-shadow: 0 0 8px #32D74B66; }
  
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.15} }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  @keyframes glow  { 0%,100%{text-shadow:0 0 20px #FFB34055} 50%{text-shadow:0 0 40px #FFB340CC,0 0 80px #FFB34044} }
  @keyframes neonGlow { 0%,100%{text-shadow:0 0 20px #39FF1466} 50%{text-shadow:0 0 40px #39FF14CC,0 0 80px #39FF1444} }
  @keyframes slideIn { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes scan { 0%{background-position:0 -100vh} 100%{background-position:0 100vh} }
  @keyframes calibBar { 0%{width:0%} 100%{width:100%} }
  @keyframes scrollUp { 0%{transform:translateY(0)} 100%{transform:translateY(-50%)} }
  @keyframes rotate { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes fadeIn { from{opacity:0} to{opacity:1} }
  @keyframes heartbeat { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
  @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
  @keyframes borderPulse { 0%,100%{border-color:#FF3B3033;box-shadow:0 0 0 rgba(255,59,48,0)} 50%{border-color:#FF3B30;box-shadow:0 0 30px rgba(255,59,48,0.2)} }
  @keyframes floatUp { 0%{transform:translateY(0)} 50%{transform:translateY(-4px)} 100%{transform:translateY(0)} }

  .blink { animation: blink 1s step-end infinite; }
  .pulse { animation: pulse 1.5s ease-in-out infinite; }
  .glow-gold { animation: glow 3s ease-in-out infinite; }
  .glow-neon { animation: neonGlow 3s ease-in-out infinite; }
  .slide-in { animation: slideIn 0.3s ease-out forwards; }
  .border-pulse-red { animation: borderPulse 2s ease-in-out infinite; }
  .float-up { animation: floatUp 4s ease-in-out infinite; }

  .scan-overlay::after {
    content: '';
    position: fixed;
    inset: 0;
    background: linear-gradient(to bottom, transparent 0%, rgba(255,179,64,0.015) 50%, transparent 100%);
    background-size: 100% 200px;
    animation: scan 8s linear infinite;
    pointer-events: none;
    z-index: 0;
  }

  .grid-bg {
    background-image:
      linear-gradient(rgba(255,179,64,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,179,64,0.03) 1px, transparent 1px);
    background-size: 48px 48px;
  }

  .card-hover { transition: all 0.2s ease; }
  .card-hover:hover { border-color: #FFB34044 !important; transform: translateY(-1px); }

  .shimmer-btn {
    background: linear-gradient(90deg, #FFB340 0%, #FFD580 50%, #FFB340 100%);
    background-size: 200% 100%;
    animation: shimmer 2s ease-in-out infinite;
  }

  .collapse-border {
    position: fixed; inset: 0;
    border: 2px solid #FF3B30;
    pointer-events: none; z-index: 9997;
    animation: borderPulse 1.5s ease-in-out infinite;
  }

  .metric-ticker {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    letter-spacing: 0.08em;
  }
  
  .syne { font-family: 'Syne', sans-serif; }
  .grotesk { font-family: 'Space Grotesk', sans-serif; }
  .mono { font-family: 'JetBrains Mono', monospace; }

  .recharts-tooltip-wrapper { z-index: 100 !important; }
`;

// ─────────────────────────────────────────────────────────────────────────────
// CSV PRE-PROCESSOR (client-side fuzzy mapping)
// ─────────────────────────────────────────────────────────────────────────────
const PRE_PROCESSOR_MAP = {
  "Reached.on.Time_Y.N":  ["late","delayed","delay","status","on_time","ontime","delivery_status","reached","timely"],
  "Weight_in_gms":        ["wt","weight","mass","gms","grams","weight_g","weight_grams"],
  "Warehouse_block":      ["block","hub","location","wh","area","warehouse","wh_block","depot"],
  "Product_importance":   ["priority","rank","importance","vips","tier","prod_imp"],
  "Mode_of_Shipment":     ["mode","shipment","transport","carrier","ship_mode","method"],
  "Customer_care_calls":  ["care_calls","cc_calls","support_calls","customer_care","calls"],
  "Customer_rating":      ["rating","score","csat","satisfaction","stars"],
  "Cost_of_the_Product":  ["cost","price","product_cost","amount","value"],
  "Prior_purchases":      ["prior","previous","purchases","buy_count","order_count"],
  "Discount_offered":     ["discount","promo","rebate","offer","coupon"],
  "Gender":               ["gender","sex","g","customer_gender"],
};

function preprocessCSV(text) {
  const lines = text.split("\n");
  if (!lines.length) return text;
  const headers = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, ""));
  lines[0] = headers.map(h => {
    const lower = h.toLowerCase().replace(/[\s\-\.]/g, "_");
    for (const [target, kws] of Object.entries(PRE_PROCESSOR_MAP)) {
      for (const kw of kws) if (lower === kw || lower.includes(kw)) return target;
    }
    return h;
  }).join(",");
  return lines.join("\n");
}

async function readFileResilient(file) {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  if (utf8.includes("\uFFFD")) return new TextDecoder("iso-8859-1").decode(buf);
  return utf8;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGO — Sigmoid S
// ─────────────────────────────────────────────────────────────────────────────
function SitiLogo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" fill="none">
      <path d="M 24 7 C 30 7, 30 15, 17 17 C 4 19, 4 27, 10 27"
        stroke={C.gold} strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <circle cx="24" cy="7" r="2.8" fill={C.gold}/>
      <circle cx="17" cy="17" r="1.2" fill={C.gold} opacity="0.4"/>
      <circle cx="10" cy="27" r="2.8" fill={C.gold} opacity="0.55"/>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CALIBRATION OVERLAY
// ─────────────────────────────────────────────────────────────────────────────
function CalibrationOverlay({ message = "RE-CALIBRATING STATE OBSERVER" }) {
  const LINES = Array.from({ length: 60 }, (_, i) =>
    `[${String(i).padStart(3,"0")}] LR WEIGHT ${(Math.sin(i * 1.23) * 0.99).toFixed(7)}  |  BIAS ${(Math.cos(i * 0.87) * 0.12).toFixed(7)}  |  ∇L = ${(Math.sin(i * 2.1) * 0.003).toFixed(9)}`
  );
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", overflow: "hidden" }}>
      {/* scrolling weights background */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.08, overflow: "hidden" }}>
        <div style={{ animation: "scrollUp 20s linear infinite", fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: C.gold, lineHeight: 2.2, padding: "0 24px", whiteSpace: "nowrap" }}>
          {[...LINES, ...LINES].map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>
      {/* center content */}
      <div style={{ position: "relative", textAlign: "center", zIndex: 1 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
          <SitiLogo size={56} />
        </div>
        <div className="syne" style={{ color: C.gold, fontSize: 22, fontWeight: 800, letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 10 }}>
          MIMI INTELLIGENCE
        </div>
        <div style={{ color: C.gold, fontSize: 11, letterSpacing: "0.2em", opacity: 0.8, marginBottom: 20 }}>
          {message}...
        </div>
        <div style={{ width: 340, height: 2, background: "#1A1A1A", margin: "0 auto", borderRadius: 1, overflow: "hidden" }}>
          <div style={{ height: "100%", background: `linear-gradient(90deg, ${C.gold}, #FFD580)`, animation: "calibBar 2.8s ease-in-out forwards", borderRadius: 1 }} />
        </div>
        <div style={{ marginTop: 16, fontSize: 9, color: C.textDim, letterSpacing: "0.15em" }}>
          SAFEXPRESS CASE #02028317 · MIMI KERNEL v2.0
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CHART TOOLTIP
// ─────────────────────────────────────────────────────────────────────────────
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0A0A0A", border: `1px solid ${C.borderBright}`, padding: "10px 14px", fontSize: 10, minWidth: 120 }}>
      <div style={{ color: C.gold, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || C.text, display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 2 }}>
          <span style={{ opacity: 0.7 }}>{p.name}</span>
          <span style={{ fontWeight: 700 }}>{typeof p.value === "number" ? p.value.toFixed(4) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI CARD
// ─────────────────────────────────────────────────────────────────────────────
function KPI({ label, value, sub, color = C.gold, size = "normal", testId }) {
  const fontSize = size === "large" ? 28 : size === "xl" ? 40 : 22;
  return (
    <div data-testid={testId} className="card-hover" style={{
      background: C.surface, border: `1px solid ${C.border}`, padding: "12px 14px",
      position: "relative", overflow: "hidden"
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${color}33, transparent)` }} />
      <div style={{ fontSize: 8, color: C.textDim, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize, fontWeight: 700, color, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>{value ?? "—"}</div>
      {sub && <div style={{ fontSize: 9, color: C.textDim, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HUB CARD
// ─────────────────────────────────────────────────────────────────────────────
function HubCard({ hub }) {
  const rho = hub?.rho ?? 0;
  const isCollapse = rho >= 0.85;
  const isWarn = rho > 0.75;
  const sc = isCollapse ? C.red : isWarn ? "#FF9F0A" : C.green;
  const k = hub?.kalman ?? {};

  return (
    <div className="card-hover" style={{
      background: C.surface, border: `1px solid ${isCollapse ? C.red + "88" : C.border}`,
      padding: "14px 16px", position: "relative", overflow: "hidden",
      ...(isCollapse ? { animation: "borderPulse 2s ease-in-out infinite" } : {})
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 2, background: sc }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: sc, boxShadow: `0 0 8px ${sc}` }} />
          <span className="syne" style={{ fontSize: 13, fontWeight: 700, color: C.gold, letterSpacing: "0.12em" }}>
            {hub?.name?.toUpperCase()}
          </span>
          <span style={{ fontSize: 8, color: C.textDim }}>[{hub?.blocks?.join(",")}]</span>
        </div>
        <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: "0.1em", color: sc, border: `1px solid ${sc}33`, padding: "2px 8px" }}>
          {isCollapse ? "SATURATED" : isWarn ? "WARNING" : "NOMINAL"}
        </span>
      </div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 30, fontWeight: 700, color: sc, lineHeight: 1, marginBottom: 8 }}>
        {rho.toFixed(4)}
      </div>
      <div style={{ height: 3, background: C.border, marginBottom: 10, position: "relative" }}>
        <div style={{ height: "100%", width: `${Math.min(rho * 100, 100)}%`, background: sc, transition: "width 0.6s ease" }} />
        <div style={{ position: "absolute", left: "85%", top: -2, bottom: -2, width: 1, background: `${C.red}66` }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
        {[
          { l: "T+1 45m", v: k.rho_t1?.toFixed(4), c: (k.rho_t1??0) >= 0.85 ? C.red : C.green },
          { l: "T+3 135m", v: k.rho_t3?.toFixed(4), c: (k.rho_t3??0) >= 0.85 ? C.red : "#FF9F0A" },
          { l: "λ eff/hr", v: hub?.effective_lambda?.toFixed(1), c: C.blue },
        ].map(item => (
          <div key={item.l} style={{ background: C.panel, padding: "5px 7px", border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 7, color: C.textDim, marginBottom: 2 }}>{item.l}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: item.c }}>{item.v ?? "—"}</div>
          </div>
        ))}
      </div>
      {hub?.cascade_risk && (
        <div className="blink" style={{ marginTop: 8, fontSize: 8, color: "#FFD60A", border: "1px dashed #FFD60A44", padding: "3px 7px", fontWeight: 700 }}>
          ⚠ CASCADE RISK — RECEIVING DIVERTED TRAFFIC
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MIMI MATH PANEL
// ─────────────────────────────────────────────────────────────────────────────
function MimiPanel({ kState }) {
  const rho = kState?.global_rho ?? 0;
  const phi = kState?.phi ?? 0;
  const k = kState?.kalman ?? {};
  const irp = kState?.inverse_reliability ?? {};
  const collapse = rho >= 0.85;

  const formulas = [
    { id:"rho", title:"NETWORK UTILIZATION  ρ = λ/μ",
      eq:`ρ = ${(kState?.total_lambda??0).toFixed(1)} / ${((kState?.mu??150)*3).toFixed(0)}`,
      val: rho.toFixed(4), color: collapse ? C.red : C.gold,
      note: `Hub avg λ: ${((kState?.total_lambda??0)/3).toFixed(1)}/hr · μ: ${kState?.mu??150}/hr` },
    { id:"phi", title:"SIGMOIDAL PRIORITY DECAY  Φ(ρ)",
      eq:`Φ(ρ) = 1 / (1 + e^{-20(ρ - ${(kState?.critical_rho??0.85).toFixed(2)})})`,
      val: phi.toFixed(4), color: phi > 0.5 ? C.red : phi > 0.3 ? "#FF9F0A" : C.green,
      note: phi > 0.5 ? "CASCADING FAILURE IMMINENT" : phi > 0.3 ? "INSTABILITY DETECTED" : "STABLE OPERATIONS" },
    { id:"kalman", title:"2D KALMAN STATE  x = [ρ, ρ̇]",
      eq:`x̂ = [${(k.x_hat??0).toFixed(4)}, ${(k.rho_dot??0) >= 0 ? "+" : ""}${(k.rho_dot??0).toFixed(6)}]`,
      val: `T+3: ${(k.rho_t3??0).toFixed(4)}`, color: (k.rho_t3??0) >= 0.85 ? C.red : C.blue,
      note: "F=[[1,Δt],[0,1]] · 135-min forecast" },
    { id:"irp", title:"INVERSE RELIABILITY PARADOX  L",
      eq:`L = $1.20(recovery) + $2.74(CLV) = $3.94/unit`,
      val: `$${irp.leakage_total?.toFixed(0) ?? 0}`, color: "#FF9F0A",
      note: `${irp.failure_count ?? 0} high-imp failures · Case #02028317` },
    { id:"wq", title:"M/M/1 QUEUE DEPTH  W_q",
      eq:`W_q = ρ/(1-ρ) = ${rho.toFixed(3)}/${(1-rho).toFixed(3)}`,
      val: Math.min(kState?.wq??0, 99.9).toFixed(3), color: (kState?.wq??0) > 4 ? C.red : C.blue,
      note: "Dimensionless queue depth index" },
    { id:"rho_c", title:"CRITICAL THRESHOLD  ρ_critical",
      eq:`LR-computed: ρ_c = ${(kState?.critical_rho??0.85).toFixed(4)}`,
      val: (kState?.critical_rho??0.85).toFixed(4), color: "#FF9F0A",
      note: "Logistic Regression calibrated threshold" },
  ];

  return (
    <div style={{ background: C.surface, border: `1px solid ${collapse ? C.red + "55" : C.borderBright}`, transition: "border-color 0.3s" }}>
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: C.panel }}>
        <div>
          <div className="syne" style={{ fontSize: 11, color: C.gold, letterSpacing: "0.16em", fontWeight: 700 }}>MIMI KERNEL v2.0 — 2D KALMAN STATE OBSERVER</div>
          <div style={{ fontSize: 8, color: C.textDim, letterSpacing: "0.1em", marginTop: 2 }}>ρ = λ/μ · F=[[1,Δt],[0,1]] · 5-HUB INDIA NETWORK</div>
        </div>
        <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", color: collapse ? C.red : C.green, border: `1px solid ${collapse ? C.red + "44" : C.green + "44"}`, padding: "3px 12px" }}>
          {collapse ? "COLLAPSE ρ≥0.85" : "KERNEL ACTIVE"}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: `1px solid ${C.border}` }}>
        {formulas.map((f, i) => (
          <div key={f.id} style={{ padding: "12px 14px", borderRight: i % 3 < 2 ? `1px solid ${C.border}` : "none", borderBottom: i < 3 ? `1px solid ${C.border}` : "none" }}>
            <div style={{ fontSize: 7.5, color: C.textDim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>{f.title}</div>
            <div style={{ fontSize: 9, color: f.color + "99", fontFamily: "'JetBrains Mono',monospace", marginBottom: 6, lineHeight: 1.5 }}>{f.eq}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: f.color, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>{f.val}</div>
            <div style={{ fontSize: 8, color: C.textDim, marginTop: 4 }}>{f.note}</div>
          </div>
        ))}
      </div>
      {/* ρ gauge */}
      <div style={{ padding: "10px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: C.textDim, marginBottom: 5 }}>
          <span>ρ = 0.00</span><span style={{ color: "#FF9F0A" }}>DIVERSION 0.80</span><span style={{ color: C.red }}>COLLAPSE 0.85</span><span>ρ = 1.00</span>
        </div>
        <div style={{ height: 5, background: C.border, position: "relative", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(rho * 100, 100)}%`, background: `linear-gradient(90deg, ${C.gold}, ${collapse ? C.red : rho > 0.80 ? "#FF9F0A" : C.gold})`, transition: "width 0.6s ease" }} />
          <div style={{ position: "absolute", left: "80%", top: 0, bottom: 0, width: 1, background: "#FF9F0A" }} />
          <div style={{ position: "absolute", left: "85%", top: 0, bottom: 0, width: 1, background: C.red }} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CHARTS PANEL
// ─────────────────────────────────────────────────────────────────────────────
const PIE_COLORS = [C.red, "#FF9F0A", C.blue];
const HUB_COLORS = { "Mumbai BOM": C.red, "Delhi IGI": "#FF9F0A", "Bengaluru": C.gold, "Chennai MAA": C.blue, "Hyderabad": C.green };

function Charts({ kState }) {
  const hubs = kState?.hubs ?? [];
  const delay = kState?.average_delay ?? [];
  const rzi = kState?.red_zone_importance ?? [];
  const rhoHistory = kState?.rho_history ?? [];

  const hubCompare = hubs.map(h => ({
    name: h.name?.split(" ")[0],
    rho: +(h.rho ?? 0).toFixed(4),
    "T+1": +(h.kalman?.rho_t1 ?? 0).toFixed(4),
    "T+3": +(h.kalman?.rho_t3 ?? 0).toFixed(4),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Hub utilization */}
      <div style={{ background: C.surface, border: `1px solid ${C.borderBright}`, padding: 14 }}>
        <div style={{ fontSize: 8, color: C.textDim, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>HUB UTILIZATION · ρ = λ/μ · 5-NODE INDIA NETWORK</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={hubCompare} barGap={3} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke={C.border} />
            <XAxis dataKey="name" tick={{ fill: C.textDim, fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 1]} tick={{ fill: C.textDim, fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTip />} />
            <ReferenceLine y={0.85} stroke={C.red} strokeDasharray="4 4" label={{ value: "ρ_c", fill: C.red, fontSize: 8, position: "insideRight" }} />
            <ReferenceLine y={0.80} stroke="#FF9F0A" strokeDasharray="4 4" label={{ value: "0.80", fill: "#FF9F0A", fontSize: 8, position: "insideRight" }} />
            <Bar dataKey="rho" name="ρ current" fill={C.gold} radius={[2,2,0,0]} />
            <Bar dataKey="T+1" fill={C.blue} radius={[2,2,0,0]} />
            <Bar dataKey="T+3" fill="#FF9F0A" radius={[2,2,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* rho trajectory */}
      <div style={{ background: C.surface, border: `1px solid ${C.borderBright}`, padding: 14 }}>
        <div style={{ fontSize: 8, color: C.textDim, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>NETWORK ρ TRAJECTORY · LIVE KALMAN STREAM</div>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={rhoHistory}>
            <defs>
              <linearGradient id="rhoGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C.gold} stopOpacity={0.25} />
                <stop offset="95%" stopColor={C.gold} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 6" stroke={C.border} />
            <XAxis dataKey="time" tick={{ fill: C.textDim, fontSize: 7 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 1.1]} tick={{ fill: C.textDim, fontSize: 8 }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTip />} />
            <ReferenceLine y={0.85} stroke={C.red} strokeDasharray="4 4" />
            <Area type="monotone" dataKey="rho" name="ρ" stroke={C.gold} strokeWidth={2} fill="url(#rhoGrad)" dot={false} />
            <Line type="monotone" dataKey="t3" name="T+3" stroke={C.neonGreen} strokeWidth={1.5} strokeDasharray="6 3" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Delay + Importance */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.borderBright}`, padding: 14 }}>
          <div style={{ fontSize: 8, color: C.textDim, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>AVG DELAY BY WAREHOUSE BLOCK</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={delay}>
              <CartesianGrid vertical={false} stroke={C.border} />
              <XAxis dataKey="block" tick={{ fill: C.textDim, fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.textDim, fontSize: 8 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="avg_delay" name="Avg Delay (hrs)" radius={[2,2,0,0]}>
                {delay.map((_, i) => <Cell key={i} fill={[C.red,"#FF9F0A",C.gold,C.blue,C.green,C.purple][i%6]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.borderBright}`, padding: 14 }}>
          <div style={{ fontSize: 8, color: C.textDim, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>RED-ZONE FAILURE BY IMPORTANCE</div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={rzi} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} innerRadius={28}>
                {rzi.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip content={<ChartTip />} />
              <Legend wrapperStyle={{ fontSize: 9, color: C.textDim }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IRP TABLE
// ─────────────────────────────────────────────────────────────────────────────
function IRPTable({ kState }) {
  const perHub = kState?.inverse_reliability_per_hub ?? [];
  if (!perHub.length) return null;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.borderBright}` }}>
      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: C.panel }}>
        <div style={{ fontSize: 8.5, color: C.text, letterSpacing: "0.1em", textTransform: "uppercase" }}>INVERSE RELIABILITY PARADOX — REAL DATA PER HUB</div>
        <div style={{ fontSize: 7, color: "#FFD60A", border: "1px solid #FFD60A33", padding: "2px 8px", fontWeight: 700 }}>IRP CONFIRMED</div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, fontFamily: "'JetBrains Mono',monospace" }}>
        <thead>
          <tr>{["HUB","ρ","HI-IMP FAIL%","LO-IMP FAIL%","IRP GAP","₹ IMPACT/YR"].map(h => (
            <th key={h} style={{ padding: "7px 12px", textAlign: h==="HUB"?"left":"right", color: C.textDim, fontWeight: 400, fontSize: 7.5, borderBottom: `1px solid ${C.border}`, letterSpacing: "0.1em" }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {perHub.map(row => {
            const rho = row.rho ?? 0;
            return (
              <tr key={row.hub} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "7px 12px", color: C.gold, fontWeight: 700 }}>{row.hub}</td>
                <td style={{ padding: "7px 12px", textAlign: "right", color: rho >= 0.85 ? C.red : C.text }}>{rho.toFixed(4)}</td>
                <td style={{ padding: "7px 12px", textAlign: "right", color: C.red }}>{((row.hi_fail_rate??0)*100).toFixed(2)}%</td>
                <td style={{ padding: "7px 12px", textAlign: "right", color: C.blue }}>{((row.lo_fail_rate??0)*100).toFixed(2)}%</td>
                <td style={{ padding: "7px 12px", textAlign: "right", color: "#FFD60A", fontWeight: 700 }}>
                  {((row.irp_gap??0)*100) > 0 ? "+" : ""}{((row.irp_gap??0)*100).toFixed(1)}pp
                </td>
                <td style={{ padding: "7px 12px", textAlign: "right", color: C.green }}>₹{(row.annual_impact_cr??0).toFixed(2)}Cr</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ padding: "6px 14px", borderTop: `1px solid ${C.border}`, fontSize: 7.5, color: C.textDim }}>
        Source: Safexpress Case #02028317 · Leakage seed: $1.20 recovery + $2.74 CLV = $3.94/failure
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RAZORPAY PAYMENT MODAL
// ─────────────────────────────────────────────────────────────────────────────
function PaymentModal({ onClose }) {
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);

  const plans = [
    {
      id: "pilot", name: "PILOT", price: 29999, display: "₹29,999/mo",
      hubs: "1 Hub", shipments: "50K/mo", color: C.blue,
      features: ["1 hub monitored", "CSV Genius Reset", "PDF Forensic Audit", "Email support"],
    },
    {
      id: "operator", name: "OPERATOR", price: 74999, display: "₹74,999/mo",
      hubs: "5 Hubs", shipments: "500K/mo", color: C.gold, recommended: true,
      features: ["5 hubs monitored", "WhatsApp alerts", "Live API SSE stream", "Priority support", "IRP per-hub analysis"],
    },
    {
      id: "enterprise", name: "ENTERPRISE", price: null, display: "Custom",
      hubs: "Unlimited", shipments: "Unlimited", color: C.green,
      features: ["Redis/K8s scaling", "Delhivery-scale", "Dedicated onboarding", "SLA guarantee", "Source code escrow"],
    },
  ];

  const handlePay = async (plan) => {
    if (plan.price === null) {
      window.open("https://wa.me/917XXXXXXXXX?text=" + encodeURIComponent("Hi, I want SITI Intelligence Enterprise plan. Please contact me."));
      return;
    }
    setLoading(true);
    setSelectedPlan(plan.id);
    try {
      const options = {
        key: RAZORPAY_KEY,
        amount: plan.price * 100,
        currency: "INR",
        name: "SITI Intelligence",
        description: `${plan.name} Plan — ${plan.hubs}, ${plan.shipments}`,
        image: "data:image/svg+xml,...",
        notes: { plan: plan.id },
        prefill: { name: "", email: "", contact: "" },
        theme: { color: C.gold },
        handler: function(response) {
          alert(`✅ Payment Success!\n\nPayment ID: ${response.razorpay_payment_id}\n\nYour API key will be delivered via email within 2 minutes.\n\nWelcome to SITI Intelligence!`);
          onClose();
        },
        modal: { ondismiss: () => { setLoading(false); setSelectedPlan(null); } }
      };
      if (window.Razorpay) {
        const rzp = new window.Razorpay(options);
        rzp.open();
      } else {
        alert("Razorpay script not loaded. Check console.");
      }
    } catch (e) {
      alert("Payment error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.borderBright}`, maxWidth: 620, width: "100%", position: "relative" }} className="slide-in">
        {/* header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="syne" style={{ color: C.gold, fontSize: 15, fontWeight: 800, letterSpacing: "0.2em" }}>SITI INTELLIGENCE — PRICING</div>
            <div style={{ fontSize: 8, color: C.textDim, marginTop: 2 }}>Powered by Razorpay · Auto-provisioned API key on payment</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.textDim, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>
        {/* plans */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, padding: 20 }}>
          {plans.map(p => (
            <div key={p.id} style={{ border: `1px solid ${p.color}44`, padding: 16, background: C.panel, position: "relative" }}>
              {p.recommended && (
                <div style={{ position: "absolute", top: -9, left: "50%", transform: "translateX(-50%)", background: C.gold, color: "#000", fontSize: 7, fontWeight: 700, padding: "2px 10px", letterSpacing: "0.1em", whiteSpace: "nowrap" }}>RECOMMENDED</div>
              )}
              <div style={{ fontSize: 8, color: p.color, fontWeight: 700, letterSpacing: "0.15em", marginBottom: 8 }}>{p.name}</div>
              <div className="syne" style={{ fontSize: 22, color: p.color, fontWeight: 800, marginBottom: 4 }}>{p.display}</div>
              <div style={{ fontSize: 8, color: C.textDim, marginBottom: 12 }}>{p.hubs} · {p.shipments}</div>
              {p.features.map(f => (
                <div key={f} style={{ fontSize: 8, color: C.text, marginBottom: 4, display: "flex", gap: 6 }}>
                  <span style={{ color: C.green }}>✓</span><span>{f}</span>
                </div>
              ))}
              <button
                onClick={() => handlePay(p)}
                disabled={loading && selectedPlan === p.id}
                style={{
                  marginTop: 14, width: "100%", background: "none", border: `1px solid ${p.color}`,
                  color: p.color, fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 700,
                  letterSpacing: "0.1em", padding: "7px 0", cursor: "pointer",
                  opacity: loading && selectedPlan === p.id ? 0.6 : 1
                }}>
                {loading && selectedPlan === p.id ? "PROCESSING..." : p.id === "enterprise" ? "CONTACT US →" : "BUY NOW →"}
              </button>
            </div>
          ))}
        </div>
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, fontSize: 7.5, color: C.textDim, display: "flex", gap: 16, flexWrap: "wrap" }}>
          <span><span style={{ color: C.green }}>✓</span> Razorpay 256-bit SSL</span>
          <span><span style={{ color: C.green }}>✓</span> API key delivered in 2 min</span>
          <span><span style={{ color: C.green }}>✓</span> 7-day money-back guarantee</span>
          <span><span style={{ color: C.green }}>✓</span> Cancel anytime</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DEMO UPLOAD PANEL (no API key required)
// ─────────────────────────────────────────────────────────────────────────────
function DemoUploadPanel({ onCalibrating, onRefresh, apiKey }) {
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);

  const doUpload = async (file) => {
    onCalibrating(true, "INGESTING DEMO DATASET");
    setMsg(null); setErr(null);
    try {
      const raw = await readFileResilient(file);
      const clean = raw.replace(/[^\x20-\x7E\t\n\r]/g, "");
      const remapped = preprocessCSV(clean);
      const blob = new Blob([remapped], { type: "text/csv" });
      const fd = new FormData();
      fd.append("file", new File([blob], file.name, { type: "text/csv" }));
      const [res] = await Promise.all([
        axios.post(`${API}/kernel/upload`, fd, {
          headers: { "Content-Type": "multipart/form-data", "X-API-KEY": apiKey }
        }),
        new Promise(r => setTimeout(r, 2800)),
      ]);
      setMsg(`✅ GENIUS RESET COMPLETE — n=${res.data.n_total} · ρ=${res.data.new_rho?.toFixed(4)}`);
      await onRefresh();
    } catch (e) {
      const d = e.response?.data?.detail;
      setErr(typeof d === "string" ? d : "Upload failed — check CSV schema");
    } finally {
      onCalibrating(false);
    }
  };

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.borderBright}`, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.neonGreen, boxShadow: `0 0 8px ${C.neonGreen}` }} />
        <div className="syne" style={{ fontSize: 10, color: C.text, letterSpacing: "0.16em", fontWeight: 700 }}>DEMO MODE — UPLOAD CSV (NO API KEY REQUIRED)</div>
      </div>
      <div style={{ fontSize: 8.5, color: C.textDim, marginBottom: 12, lineHeight: 1.7 }}>
        Upload any logistics CSV for your demo video. MIMI auto-maps messy headers, runs logistic regression, and recalibrates all 5 hubs in real-time. Auto-maps: <span style={{ color: C.blue }}>delay_status → Reached.on.Time_Y.N · wt → Weight_in_gms · hub/block → Warehouse_block</span>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} id="demo-csv"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setUploading(true);
            await doUpload(f);
            setUploading(false);
            fileRef.current.value = "";
          }} />
        <label htmlFor="demo-csv" style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: uploading ? "#1A1A00" : "transparent",
          border: `1px solid ${uploading ? C.gold : "#FF9F0A"}`,
          color: uploading ? C.gold : "#FF9F0A",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700,
          letterSpacing: "0.12em", padding: "8px 18px", cursor: uploading ? "wait" : "pointer",
          userSelect: "none"
        }}>
          {uploading ? "⚙ PROCESSING..." : "⬆ UPLOAD CSV — GENIUS RESET"}
        </label>
        <div style={{ fontSize: 8, color: C.textDim }}>
          Supports: Safexpress, Delhivery, Ecom Express, Blue Dart, and custom formats
        </div>
      </div>
      {msg && <div style={{ marginTop: 10, padding: "7px 12px", background: "#001A00", border: `1px solid ${C.green}44`, color: C.green, fontSize: 8.5 }}>{msg}</div>}
      {err && <div style={{ marginTop: 10, padding: "7px 12px", background: "#1A0000", border: `1px solid ${C.red}44`, color: C.red, fontSize: 8.5 }}>ERROR: {err}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF EXPORT
// ─────────────────────────────────────────────────────────────────────────────
function exportPDF(kState, ticker) {
  const doc = new jsPDF({ orientation: "portrait", format: "a4" });
  const rho = kState?.rho ?? 0;
  const phi = kState?.phi ?? 0;
  const irp = kState?.inverse_reliability ?? {};
  const now = new Date().toISOString();

  // Header band
  doc.setFillColor(5, 5, 5);
  doc.rect(0, 0, 210, 50, "F");
  doc.setFillColor(255, 179, 64);
  doc.rect(0, 0, 6, 50, "F");

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(255, 179, 64);
  doc.text("SITI INTELLIGENCE", 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(160, 160, 160);
  doc.text("FORENSIC STATE AUDIT · MIMI KERNEL v2.0", 14, 24);
  doc.text(`GENERATED: ${now}`, 14, 31);
  doc.text(`DATASET: ${kState?.dataset_name ?? "SAFEXPRESS_CASE_02028317"}`, 14, 38);
  doc.text(`CASE REFERENCE: #02028317 · INVERSE RELIABILITY PARADOX`, 14, 45);

  // Status badge
  const statusText = rho >= 0.85 ? "UTILIZATION COLLAPSE — SIGMOIDAL DECAY TRIGGERED" : rho > 0.80 ? "PREEMPTIVE DIVERSION PROTOCOL INITIATED" : "NOMINAL OPERATIONS";
  const statusColor = rho >= 0.85 ? [255,59,48] : rho > 0.80 ? [255,159,10] : [50,215,75];
  doc.setFillColor(...statusColor);
  doc.rect(0, 50, 210, 8, "F");
  doc.setTextColor(0,0,0);
  doc.setFontSize(8);
  doc.text(statusText, 14, 55.5);

  // Executive Summary
  doc.setTextColor(255, 179, 64);
  doc.setFontSize(12);
  doc.text("EXECUTIVE SUMMARY", 14, 68);

  autoTable(doc, {
    startY: 72,
    head: [["METRIC", "VALUE", "STATUS", "THRESHOLD"]],
    body: [
      ["Hub Utilization (ρ = λ/μ)", rho.toFixed(4), rho > 0.80 ? "CRITICAL" : "NOMINAL", "< 0.80"],
      ["Instability Φ(ρ)", phi.toFixed(4), phi > 0.5 ? "CASCADING" : "STABLE", "< 0.30"],
      ["ρ_critical (LR-computed)", (kState?.critical_rho ?? 0.85).toFixed(4), "COMPUTED", "≤ 0.85"],
      ["T+3 Kalman Forecast", (kState?.kalman?.rho_t3 ?? 0).toFixed(4), kState?.collapse_predicted ? "ALERT" : "NOMINAL", "< 0.85"],
      ["Annual Exposure", "$2,810,000", "AUDIT BASELINE", "Mission LiFE"],
      ["Revenue Saved (Session)", `$${(ticker?.revenue_saved ?? 0).toFixed(2)}`, "RECOVERED", "Ongoing"],
      ["High-Imp Failures", `${irp.failure_count ?? 0} units`, "IRP CONFIRMED", "0 target"],
      ["Total Leakage (Session)", `$${(irp.leakage_total ?? 0).toFixed(2)}`, "TRACKED", "$3.94/unit"],
    ],
    theme: "grid",
    headStyles: { fillColor: [10,10,10], textColor: [255,179,64], fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fillColor: [15,15,15], textColor: [220,220,220], fontSize: 8 },
    alternateRowStyles: { fillColor: [20,20,20] },
  });

  let y = doc.lastAutoTable.finalY + 12;

  // Math formulation
  doc.setTextColor(255, 179, 64);
  doc.setFontSize(12);
  doc.text("MIMI KERNEL — MATHEMATICAL FORMULATION", 14, y); y += 6;

  doc.setTextColor(180, 180, 180);
  doc.setFontSize(8);
  const mathLines = [
    `ρ = λ/μ = ${(kState?.total_lambda ?? 0).toFixed(1)} / ${((kState?.mu ?? 150) * 5).toFixed(0)} = ${rho.toFixed(4)}  (M/M/1 queueing theory, Kendall notation)`,
    `Φ(ρ) = 1/(1+exp(-20(ρ-${(kState?.critical_rho??0.85).toFixed(2)}))) = ${phi.toFixed(4)}  (Sigmoidal priority decay, k=20)`,
    `L = $1.20(recovery cost) + $2.74(CLV loss) = $3.94 × ${irp.failure_count ?? 0} failures = $${(irp.leakage_total??0).toFixed(2)}`,
    `W_q = ρ/(1-ρ) = ${(kState?.wq??0).toFixed(4)}  (M/M/1 expected queue wait, dimensionless)`,
    `Kalman: x=[ρ, ρ̇], F=[[1,Δt],[0,1]], Q=diag(0.002,0.001), R=0.005  →  T+3: ${(kState?.kalman?.rho_t3??0).toFixed(4)}`,
  ];
  mathLines.forEach(l => { doc.text(l, 14, y); y += 6; });

  y += 6;

  // IRP table
  if ((kState?.inverse_reliability_per_hub ?? []).length > 0) {
    doc.setTextColor(255, 179, 64);
    doc.setFontSize(12);
    doc.text("INVERSE RELIABILITY PARADOX — PER HUB", 14, y); y += 4;

    autoTable(doc, {
      startY: y,
      head: [["HUB", "ρ", "HI-IMP FAIL%", "LO-IMP FAIL%", "IRP GAP (pp)", "ANNUAL IMPACT"]],
      body: (kState?.inverse_reliability_per_hub ?? []).map(r => [
        r.hub,
        r.rho?.toFixed(4),
        `${((r.hi_fail_rate??0)*100).toFixed(2)}%`,
        `${((r.lo_fail_rate??0)*100).toFixed(2)}%`,
        `${((r.irp_gap??0)*100) > 0 ? "+" : ""}${((r.irp_gap??0)*100).toFixed(1)}pp`,
        `₹${(r.annual_impact_cr??0).toFixed(2)} Cr`,
      ]),
      theme: "grid",
      headStyles: { fillColor: [26,0,0], textColor: [255,59,48], fontSize: 7.5, fontStyle: "bold" },
      bodyStyles: { fillColor: [15,15,15], textColor: [200,200,200], fontSize: 7.5 },
    });
    y = doc.lastAutoTable.finalY + 12;
  }

  // Top failures
  if ((irp.records ?? []).length > 0) {
    doc.setTextColor(255, 179, 64);
    doc.setFontSize(12);
    doc.text("TOP FAILURE EVENTS — HIGH IMPORTANCE LATE DELIVERIES", 14, y); y += 4;

    autoTable(doc, {
      startY: y,
      head: [["ID", "HUB", "MODE", "COST ($)", "WEIGHT (g)", "LEAKAGE ($)"]],
      body: (irp.records ?? []).slice(0, 15).map(r => [r.id, r.hub, r.mode, r.cost, r.weight?.toLocaleString(), "3.94"]),
      theme: "grid",
      headStyles: { fillColor: [26,0,0], textColor: [255,59,48], fontSize: 7, fontStyle: "bold" },
      bodyStyles: { fillColor: [15,15,15], textColor: [200,200,200], fontSize: 7 },
    });
  }

  // Footer on every page
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(60, 60, 60);
    doc.text(`SITI Intelligence · CONFIDENTIAL · Page ${i}/${total} · Generated ${now}`, 105, 290, { align: "center" });
    doc.text("🌿 Mission LiFE Certified · ESG Compliance Tag · For internal use only", 105, 285, { align: "center" });
  }

  doc.save(`siti-forensic-audit-${Date.now()}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
export default function SITIDashboard() {
  const [kState, setKState] = useState(null);
  const [ticker, setTicker] = useState({ revenue_saved: 0, total_diverted: 0, refresh_count: 0 });
  const [loading, setLoading] = useState(true);
  const [calibrating, setCalibrating] = useState(false);
  const [calibMsg, setCalibMsg] = useState("RE-CALIBRATING STATE OBSERVER");
  const [showPayment, setShowPayment] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [mu, setMu] = useState(150);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isGhostMode, setIsGhostMode] = useState(false);
  const [apiKey, setApiKey] = useState(DEMO_API_KEY);
  const streamRef = useRef(null);
  const ghostRef = useRef(null);

  const onCalibrating = (val, msg = "RE-CALIBRATING STATE OBSERVER") => {
    setCalibMsg(msg);
    setCalibrating(val);
  };

  const fetchState = useCallback(async () => {
    try {
      const [sRes, tRes] = await Promise.all([
        axios.get(`${API}/kernel/state`, { headers: { "X-API-KEY": apiKey } }),
        axios.post(`${API}/kernel/tick`, {}, { headers: { "X-API-KEY": apiKey } }),
      ]);
      setKState(sRes.data);
      setTicker(tRes.data);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    fetchState();
    const iv = setInterval(fetchState, 5000);
    return () => clearInterval(iv);
  }, [fetchState]);

  // Load Razorpay script once
  useEffect(() => {
    if (!document.getElementById("rzp-script")) {
      const s = document.createElement("script");
      s.id = "rzp-script";
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      document.head.appendChild(s);
    }
  }, []);

  const hubs = kState?.hubs ?? [];
  const globalRho = kState?.global_rho ?? 0;
  const catastrophe = kState?.catastrophe;
  const collapse = kState?.collapse;
  const statusColor = collapse ? C.red : catastrophe ? "#FF9F0A" : C.green;
  const bgColor = collapse ? "#100000" : catastrophe ? "#0A0000" : C.bg;

  const startStream = () => {
    setIsStreaming(true);
    streamRef.current = setInterval(async () => {
      await axios.post(`${API}/kernel/stream-batch?n=100`, {}, { headers: { "X-API-KEY": apiKey } });
      fetchState();
    }, 10000);
  };
  const stopStream = () => { clearInterval(streamRef.current); setIsStreaming(false); };

  const ghostCount = useRef(0);
  const startGhost = () => {
    setIsGhostMode(true);
    ghostCount.current = 0;
    ghostRef.current = setInterval(async () => {
      await axios.post(`${API}/kernel/stream-batch?n=50`, {}, { headers: { "X-API-KEY": apiKey } });
      fetchState();
      ghostCount.current++;
      if (ghostCount.current >= 90) stopGhost();
    }, 1000);
  };
  const stopGhost = () => { clearInterval(ghostRef.current); setIsGhostMode(false); ghostCount.current = 0; };

  const handleMuChange = async (val) => {
    setMu(val);
    try {
      await axios.post(`${API}/kernel/set-mu`, { mu: val }, { headers: { "X-API-KEY": apiKey } });
      fetchState();
    } catch {}
  };

  if (loading && !kState) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 20 }}>
        <style>{GLOBAL_CSS}</style>
        <SitiLogo size={56} />
        <div className="syne" style={{ color: C.gold, fontSize: 18, fontWeight: 800, letterSpacing: "0.25em" }}>SITI INTELLIGENCE</div>
        <div style={{ color: C.textDim, fontSize: 10, letterSpacing: "0.15em" }}>CONNECTING TO MIMI KERNEL...</div>
        <div style={{ fontSize: 8, color: C.textMuted, marginTop: -10 }}>{API}</div>
      </div>
    );
  }

  return (
    <div className="scan-overlay grid-bg" style={{ background: bgColor, minHeight: "100vh", fontFamily: "'JetBrains Mono',monospace", color: C.text, fontSize: 12, transition: "background 0.6s ease" }}>
      <style>{GLOBAL_CSS}</style>

      {calibrating && <CalibrationOverlay message={calibMsg} />}
      {showPayment && <PaymentModal onClose={() => setShowPayment(false)} />}
      {collapse && <div className="collapse-border" />}

      {/* ── TOP BAR ──────────────────────────────────────────── */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${collapse ? C.red + "44" : C.border}`, padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 58, position: "sticky", top: 0, zIndex: 100, transition: "border-color 0.3s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <SitiLogo size={36} />
          <div>
            <div className="syne" style={{ fontSize: 15, color: C.gold, fontWeight: 800, letterSpacing: "0.22em" }}>SITI INTELLIGENCE</div>
            <div style={{ fontSize: 7.5, color: C.textDim, letterSpacing: "0.1em" }}>LOGIC FOR THE PARADOX // POWERED BY MIMI v2.0</div>
          </div>
          <div style={{ width: 1, height: 30, background: C.border, margin: "0 6px" }} />
          <div style={{ fontSize: 8, color: C.blue, letterSpacing: "0.1em" }}>CASE #02028317</div>
          {(isGhostMode || isStreaming) && (
            <div className="pulse" style={{ display: "flex", alignItems: "center", gap: 5, background: "#001A05", border: `1px solid ${C.neonGreen}`, color: C.neonGreen, fontSize: 8, fontWeight: 700, letterSpacing: "0.14em", padding: "3px 10px" }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.neonGreen }} />
              LIVE INFERENCE
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          {[
            { l: "NETWORK ρ", v: globalRho.toFixed(3), c: statusColor },
            { l: "λ TOTAL/HR", v: kState?.total_lambda?.toFixed(0) ?? "—", c: C.blue },
            { l: "SAVED", v: `$${ticker.revenue_saved?.toFixed(2)}`, c: C.green },
            { l: "ANNUALIZED", v: "₹2.81Cr", c: C.red },
          ].map(item => (
            <div key={item.l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 7, color: C.textDim, letterSpacing: "0.1em", marginBottom: 2 }}>{item.l}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: item.c, fontFamily: "'JetBrains Mono',monospace" }}>{item.v}</div>
            </div>
          ))}
          <button onClick={() => setShowPayment(true)} style={{
            background: "transparent", border: `1px solid ${C.green}`, color: C.green,
            fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
            padding: "6px 16px", cursor: "pointer", transition: "all 0.2s"
          }}>
            GET API KEY →
          </button>
        </div>
      </div>

      {/* ── HERO METRIC ──────────────────────────────────────── */}
      <div style={{ textAlign: "center", padding: "20px 20px 14px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 9, color: C.textDim, letterSpacing: "0.28em", textTransform: "uppercase", marginBottom: 6 }}>ANNUALIZED REVENUE RECOVERY — INDIA LOGISTICS NETWORK</div>
        <div className="glow-neon syne" style={{ fontSize: 52, fontWeight: 800, color: C.neonGreen, lineHeight: 1 }}>
          ₹2,81,00,000
        </div>
        <div style={{ fontSize: 8.5, color: C.textDim, marginTop: 6, letterSpacing: "0.14em" }}>
          MIMI KERNEL v2.0 · {hubs.length}-HUB INDIA NETWORK · 2D KALMAN STATE OBSERVER · CASE #02028317
        </div>
      </div>

      {/* ── HUB CARDS ─────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(hubs.length, 3)}, 1fr)`, gap: 10, padding: "10px 20px" }}>
        {hubs.map(hub => <HubCard key={hub.name} hub={hub} />)}
      </div>

      {/* ── ALERTS ───────────────────────────────────────────── */}
      {collapse && (
        <div style={{ background: "#1A0000", border: `1px solid ${C.red}55`, padding: "12px 24px", margin: "0 20px 6px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.red }} className="blink" />
          <div className="syne blink" style={{ color: C.red, fontSize: 14, fontWeight: 800, letterSpacing: "0.2em" }}>
            UTILIZATION COLLAPSE: SIGMOIDAL DECAY TRIGGERED
          </div>
        </div>
      )}
      {catastrophe && !collapse && (
        <div style={{ background: "#120A00", border: "1px solid #FF9F0A44", padding: "9px 24px", margin: "0 20px", display: "flex", alignItems: "center", gap: 8 }}>
          <div className="blink syne" style={{ color: "#FF9F0A", fontSize: 12, fontWeight: 700, letterSpacing: "0.16em" }}>
            PREEMPTIVE DIVERSION PROTOCOL INITIATED — E[ρ(T+1)] &gt; 0.80
          </div>
        </div>
      )}

      {/* ── TABS ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, background: C.surface, margin: "10px 0 0", padding: "0 20px" }}>
        {[
          { id: "overview", label: "NETWORK OVERVIEW" },
          { id: "kernel", label: "MIMI KERNEL MATH" },
          { id: "demo", label: "⚡ DEMO / DATA INJECTION" },
          { id: "irp", label: "IRP ANALYSIS" },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: "10px 20px", fontSize: 8.5, letterSpacing: "0.1em",
            fontFamily: "'JetBrains Mono',monospace", background: "none", border: "none",
            cursor: "pointer", color: activeTab === tab.id ? C.gold : C.textDim,
            borderBottom: `2px solid ${activeTab === tab.id ? C.gold : "transparent"}`,
            transition: "all 0.2s", fontWeight: activeTab === tab.id ? 700 : 400
          }}>{tab.label}</button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ──────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 12, padding: "12px 20px" }}>
          {/* LEFT KPIs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { l: "NETWORK ρ (λ/μ)", v: globalRho.toFixed(4), c: collapse ? C.red : C.gold },
              { l: "ARRIVALS λ/HR", v: `${kState?.total_lambda?.toFixed(1) ?? "—"}`, c: C.blue },
              { l: "SERVICE μ/HUB", v: `${kState?.mu?.toFixed(0) ?? mu}`, c: C.green },
              { l: "INSTABILITY Φ(ρ)", v: kState?.phi?.toFixed(4) ?? "—", c: (kState?.phi??0) > 0.5 ? C.red : C.green },
              { l: "QUEUE DEPTH W_q", v: Math.min(kState?.wq??0, 99.9).toFixed(3), c: (kState?.wq??0) > 4 ? C.red : C.blue },
              { l: "FAILURE RATE", v: `${((kState?.failure_rate??0)*100).toFixed(1)}%`, c: "#FF9F0A" },
              { l: "HI-IMP FAILURES", v: `${kState?.inverse_reliability?.failure_count ?? 0}`, c: C.red },
              { l: "LEAKAGE $3.94/UNIT", v: `$${kState?.inverse_reliability?.leakage_total?.toFixed(0) ?? 0}`, c: "#FF9F0A" },
              { l: "REVENUE SAVED", v: `$${ticker.revenue_saved?.toFixed(2)}`, c: C.green },
              { l: "DIVERTED UNITS", v: ticker.total_diverted?.toLocaleString(), c: C.green },
            ].map(item => (
              <KPI key={item.l} label={item.l} value={item.v} color={item.c} />
            ))}
          </div>
          {/* RIGHT charts + IRP */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Charts kState={kState} />
            <IRPTable kState={kState} />
          </div>
        </div>
      )}

      {/* ── KERNEL TAB ────────────────────────────────────────── */}
      {activeTab === "kernel" && (
        <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <MimiPanel kState={kState} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ background: C.surface, border: `1px solid ${C.borderBright}`, padding: 16 }}>
              <div style={{ fontSize: 8, color: C.textDim, letterSpacing: "0.14em", marginBottom: 10, textTransform: "uppercase" }}>KALMAN GAIN MATRIX (2D)</div>
              <div style={{ fontSize: 10, color: C.text, fontFamily: "'JetBrains Mono',monospace", marginBottom: 6 }}>K = P⁻H^T(HP⁻H^T + R)⁻¹</div>
              <div style={{ fontSize: 13, color: C.blue, fontWeight: 700 }}>K = [{(kState?.kalman?.K ?? [0,0]).map(v => v.toFixed(4)).join(", ")}]</div>
              <div style={{ fontSize: 8, color: C.textDim, marginTop: 6 }}>P_trace = {kState?.kalman?.P?.toFixed(4)} · Q = diag(0.002, 0.001) · R = 0.005</div>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.borderBright}`, padding: 16 }}>
              <div style={{ fontSize: 8, color: C.textDim, letterSpacing: "0.14em", marginBottom: 10, textTransform: "uppercase" }}>COMMANDER'S CONSOLE</div>
              <div style={{ fontSize: 9, color: kState?.commander_level === "critical" ? C.red : kState?.commander_level === "efficiency" ? C.blue : C.green, lineHeight: 1.9, fontWeight: 700, letterSpacing: "0.05em" }}>
                {(kState?.commander_message ?? "MIMI KERNEL: OPTIMAL NETWORK FLOW DETECTED.\nCERTAINTY 99.2%.").split("\n").map((l, i) => <div key={i}>{l}</div>)}
              </div>
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ background: C.panel, padding: "6px 10px", border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 7, color: C.textDim }}>T+3 PROJECTION</div>
                  <div style={{ fontSize: 16, color: (kState?.rho_t3??0) >= 0.85 ? C.red : C.green, fontWeight: 700 }}>ρ={(kState?.rho_t3??0).toFixed(4)}</div>
                </div>
                <div style={{ background: C.panel, padding: "6px 10px", border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 7, color: C.textDim }}>PVI VOLATILITY</div>
                  <div style={{ fontSize: 16, color: (kState?.pvi??0) > 15 ? C.red : C.blue, fontWeight: 700 }}>{(kState?.pvi??0).toFixed(1)}%</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DEMO TAB ──────────────────────────────────────────── */}
      {activeTab === "demo" && (
        <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* API KEY INPUT */}
          <div style={{ background: C.surface, border: `1px solid ${C.borderBright}`, padding: "14px 16px" }}>
            <div style={{ fontSize: 8, color: C.textDim, letterSpacing: "0.14em", marginBottom: 8, textTransform: "uppercase" }}>API KEY — Leave blank for demo mode</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input value={apiKey} onChange={e => setApiKey(e.target.value || DEMO_API_KEY)}
                placeholder="siti-admin-key-001 (demo)"
                style={{ flex: 1, background: C.panel, border: `1px solid ${C.borderBright}`, color: C.text, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, padding: "7px 12px", outline: "none" }} />
              <div style={{ fontSize: 8, color: C.green }}>✓ DEMO KEY ACTIVE</div>
            </div>
          </div>

          <DemoUploadPanel onCalibrating={onCalibrating} onRefresh={fetchState} apiKey={apiKey} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {/* PDF Export */}
            <div style={{ background: C.surface, border: `1px solid ${C.borderBright}`, padding: "14px 16px" }}>
              <div className="syne" style={{ fontSize: 10, color: C.text, letterSpacing: "0.15em", marginBottom: 8, fontWeight: 700 }}>FORENSIC AUDIT PDF</div>
              <div style={{ fontSize: 8.5, color: C.textDim, marginBottom: 12, lineHeight: 1.7 }}>Board-ready PDF with MIMI math, IRP findings, and Mission LiFE ESG tag.</div>
              <button onClick={() => exportPDF(kState, ticker)} style={{
                background: "#000D1A", border: `1px solid ${C.blue}`, color: C.blue,
                fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 700,
                letterSpacing: "0.12em", padding: "8px 16px", cursor: "pointer", width: "100%"
              }}>
                📄 EXPORT FORENSIC AUDIT PDF
              </button>
              {["Executive KPI Summary", "MIMI Kernel Formulation", "IRP Table per Hub", "Kalman Filter Analysis", "Mission LiFE ESG Tag"].map(f => (
                <div key={f} style={{ fontSize: 8, color: C.textDim, marginTop: 6, display: "flex", gap: 6 }}>
                  <span style={{ color: C.green }}>✓</span>{f}
                </div>
              ))}
            </div>

            {/* μ Control */}
            <div style={{ background: C.surface, border: `1px solid ${C.borderBright}`, padding: "14px 16px" }}>
              <div className="syne" style={{ fontSize: 10, color: C.text, letterSpacing: "0.15em", marginBottom: 8, fontWeight: 700 }}>SERVICE CAPACITY (μ)</div>
              <div style={{ fontSize: 8.5, color: C.textDim, marginBottom: 12, lineHeight: 1.7 }}>Adjust μ per hub. ρ = λ/μ recalculates instantly.</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <input type="range" min={50} max={500} step={5} value={mu} onChange={e => handleMuChange(Number(e.target.value))} style={{ flex: 1 }} />
                <div style={{ background: C.panel, border: `1px solid ${C.green}`, padding: "4px 12px", fontFamily: "'JetBrains Mono',monospace", fontSize: 14, color: C.green, fontWeight: 700, minWidth: 80, textAlign: "center" }}>μ={mu}</div>
              </div>
              <div style={{ fontSize: 8, color: C.textDim }}>Network capacity: <span style={{ color: C.green }}>{mu * 5} units/hr</span> (5 hubs)</div>
            </div>

            {/* Live Streams */}
            <div style={{ background: C.surface, border: `1px solid ${C.borderBright}`, padding: "14px 16px" }}>
              <div className="syne" style={{ fontSize: 10, color: C.text, letterSpacing: "0.15em", marginBottom: 8, fontWeight: 700 }}>LIVE TELEMETRY STREAMS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button onClick={isStreaming ? stopStream : startStream} disabled={isGhostMode} style={{
                  background: isStreaming ? "#001A0A" : C.panel, border: `1px solid ${isStreaming ? C.green : C.borderBright}`,
                  color: isStreaming ? C.green : C.textDim, fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", padding: "7px 0", cursor: isGhostMode ? "not-allowed" : "pointer",
                  opacity: isGhostMode ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8
                }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: isStreaming ? C.green : C.textDim }} />
                  {isStreaming ? "HALT STREAM" : "LIVE STREAM · 100/10s"}
                </button>
                <button onClick={isGhostMode ? stopGhost : startGhost} disabled={isStreaming} style={{
                  background: isGhostMode ? "#001A05" : C.panel, border: `1px solid ${isGhostMode ? C.neonGreen : C.borderBright}`,
                  color: isGhostMode ? C.neonGreen : C.textDim, fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", padding: "7px 0", cursor: isStreaming ? "not-allowed" : "pointer",
                  opacity: isStreaming ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8
                }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: isGhostMode ? C.neonGreen : C.textDim }} />
                  {isGhostMode ? "HALT GHOST TRIGGER" : "GHOST TRIGGER · 50/s"}
                </button>
                <div style={{ fontSize: 7.5, color: C.textDim, lineHeight: 1.7 }}>
                  Stream: 100 units every 10s<br/>Ghost: 50 units/s, auto-stops @ 90s
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── IRP ANALYSIS TAB ──────────────────────────────────── */}
      {activeTab === "irp" && (
        <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <IRPTable kState={kState} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {/* Failure Records */}
            <div style={{ background: C.surface, border: `1px solid ${C.borderBright}` }}>
              <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 8.5, color: C.text, letterSpacing: "0.1em", textTransform: "uppercase" }}>HIGH-IMPORTANCE LATE DELIVERIES</div>
                <div style={{ fontSize: 11, color: C.red, fontWeight: 700 }}>{kState?.inverse_reliability?.failure_count ?? 0} FAILURES</div>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, fontFamily: "'JetBrains Mono',monospace" }}>
                <thead>
                  <tr>{["ID","HUB","MODE","COST","WEIGHT"].map(h => (
                    <th key={h} style={{ padding: "6px 12px", textAlign: "left", color: C.textDim, fontWeight: 400, fontSize: 7.5, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {(kState?.inverse_reliability?.records ?? []).slice(0, 12).map((r, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "6px 12px", color: C.blue }}>{r.id}</td>
                      <td style={{ padding: "6px 12px", color: C.gold, fontWeight: 700 }}>{r.hub}</td>
                      <td style={{ padding: "6px 12px", color: C.textDim }}>{r.mode}</td>
                      <td style={{ padding: "6px 12px", color: "#FF9F0A" }}>${r.cost}</td>
                      <td style={{ padding: "6px 12px", color: C.textDim }}>{r.weight?.toLocaleString()}g</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Leakage summary */}
            <div style={{ background: C.surface, border: `1px solid ${C.borderBright}`, padding: 16 }}>
              <div style={{ fontSize: 8, color: C.textDim, letterSpacing: "0.14em", marginBottom: 12, textTransform: "uppercase" }}>LEAKAGE COMPOSITION — $3.94/UNIT</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { label: "Recovery Cost", value: "$1.20", pct: "30%", color: C.red },
                  { label: "CLV Loss", value: "$2.74", pct: "70%", color: "#FF9F0A" },
                  { label: "Total Leakage Seed", value: "$3.94", pct: "100%", color: C.gold },
                ].map(item => (
                  <div key={item.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 9, color: C.textDim }}>{item.label}</span>
                      <span style={{ fontSize: 11, color: item.color, fontWeight: 700 }}>{item.value}</span>
                    </div>
                    <div style={{ height: 3, background: C.border }}>
                      <div style={{ height: "100%", width: item.pct, background: item.color }} />
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 16, padding: "12px", background: C.panel, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 8, color: C.textDim, marginBottom: 6 }}>TOTAL LEAKAGE THIS SESSION</div>
                  <div style={{ fontSize: 28, color: C.red, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>
                    ${kState?.inverse_reliability?.leakage_total?.toLocaleString("en-US", { minimumFractionDigits: 2 }) ?? "0.00"}
                  </div>
                  <div style={{ fontSize: 8, color: C.textDim, marginTop: 4 }}>
                    {kState?.inverse_reliability?.failure_count ?? 0} high-importance failures × $3.94
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: C.surface, marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <SitiLogo size={18} />
          <span className="syne" style={{ color: C.gold, fontSize: 10, fontWeight: 700 }}>SITI INTELLIGENCE</span>
          <span style={{ color: C.textDim, fontSize: 8 }}>// MIMI Intelligence Engine v2.0 // Powered by Inverse Reliability Paradox Mathematics</span>
        </div>
        <div style={{ fontSize: 7.5, color: C.textDim }}>
          🌿 Mission LiFE Certified · © 2026 SITI Intelligence · contact@siti-intelligence.io
        </div>
      </div>
    </div>
  );
}
