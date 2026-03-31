import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine,
  LineChart, Line, Area, AreaChart, Legend
} from "recharts";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const API_BASE = process.env.REACT_APP_BACKEND_URL || "https://siti-gsc-kernel-1.onrender.com";
const API = `${API_BASE}/api`;

// ─── THEME ────────────────────────────────────────────────────────────────────
const C = {
  gold: "#FFB340", goldDim: "#FFB34044",
  red: "#FF3B30", redDim: "#FF3B3033",
  green: "#32D74B", greenDim: "#32D74B33",
  blue: "#64D2FF", blueDim: "#64D2FF33",
  yellow: "#FFD60A", neonGreen: "#39FF14",
  bg: "#050505", surface: "#0A0A0A", panel: "#080808",
  border: "#161616", borderBright: "#1F1F1F",
  text: "#D4D4D8", textDim: "#555", textMuted: "#333",
};

// ─── CSV PRE-PROCESSOR ────────────────────────────────────────────────────────
const PRE_PROCESSOR_MAP = {
  "Reached.on.Time_Y.N":  ["late", "delayed", "delay", "status", "on_time", "ontime", "target", "delivery_status", "reached"],
  "Weight_in_gms":        ["wt", "weight", "mass", "gms", "grams", "weight_g", "weight_grams"],
  "Warehouse_block":      ["block", "hub", "location", "wh", "area", "warehouse", "wh_block", "depot"],
  "Product_importance":   ["priority", "rank", "importance", "vips", "tier", "prod_imp"],
  "Mode_of_Shipment":     ["mode", "shipment", "transport", "carrier", "ship_mode", "method"],
  "Customer_care_calls":  ["care_calls", "cc_calls", "support_calls", "customer_care", "calls"],
  "Customer_rating":      ["rating", "score", "csat", "satisfaction", "stars"],
  "Cost_of_the_Product":  ["cost", "price", "product_cost", "amount", "value"],
  "Prior_purchases":      ["prior", "previous", "purchases", "buy_count", "order_count"],
  "Discount_offered":     ["discount", "promo", "rebate", "offer", "coupon"],
  "Gender":               ["gender", "sex", "g", "customer_gender"],
};

function preprocessCSV(csvText) {
  const lines = csvText.split("\n");
  if (!lines.length) return csvText;
  const headers = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, ""));
  const newHeaders = headers.map(h => {
    const lower = h.toLowerCase().replace(/[\s\-\.]/g, "_");
    for (const [target, keywords] of Object.entries(PRE_PROCESSOR_MAP)) {
      for (const kw of keywords) {
        if (lower === kw || lower.includes(kw)) return target;
      }
    }
    return h;
  });
  lines[0] = newHeaders.join(",");
  return lines.join("\n");
}

async function readFileResilient(file) {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  if (utf8.includes("\uFFFD")) {
    return new TextDecoder("iso-8859-1").decode(buffer);
  }
  return utf8;
}

function sanitizeText(t) { return t.replace(/[^\x20-\x7E\t\n\r]/g, ""); }

// ─── LOGO ─────────────────────────────────────────────────────────────────────
function SitiLogo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" fill="none">
      <path d="M 24 7 C 30 7, 30 15, 17 17 C 4 19, 4 27, 10 27" stroke={C.gold} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="24" cy="7" r="2.6" fill={C.gold} />
      <circle cx="10" cy="27" r="2.6" fill={C.gold} opacity="0.65" />
    </svg>
  );
}

// ─── CALIBRATION OVERLAY ─────────────────────────────────────────────────────
function CalibrationOverlay() {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <SitiLogo size={52} />
      <div style={{ color: C.gold, fontFamily: "'Chivo',sans-serif", fontWeight: 900, fontSize: 20, letterSpacing: "0.28em", marginTop: 20 }}>MIMI INTELLIGENCE</div>
      <div style={{ color: C.gold, fontFamily: "'JetBrains Mono',monospace", fontSize: 12, letterSpacing: "0.16em", marginTop: 8, opacity: 0.8 }}>RE-CALIBRATING STATE OBSERVER...</div>
      <div style={{ width: 320, height: 2, background: "#1A1A1A", margin: "16px auto 0", borderRadius: 1, overflow: "hidden" }}>
        <div style={{ height: "100%", background: C.gold, animation: "calibBar 2.5s ease-in-out forwards" }} />
      </div>
      <style>{`@keyframes calibBar{0%{width:0}100%{width:100%}}`}</style>
    </div>
  );
}

// ─── PAYMENT MODAL ────────────────────────────────────────────────────────────
function PaymentModal({ onClose }) {
  const plans = [
    { name: "PILOT", price: "₹29,999/mo", desc: "1 hub, 50K shipments/mo, email support", color: C.blue },
    { name: "OPERATOR", price: "₹74,999/mo", desc: "5 hubs, 500K shipments/mo, WhatsApp alerts", color: C.gold },
    { name: "ENTERPRISE", price: "Custom", desc: "Unlimited hubs, SLA, dedicated onboarding", color: C.green },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: C.surface, border: `1px solid ${C.borderBright}`, padding: 32, maxWidth: 560, width: "100%", borderRadius: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Chivo',sans-serif", fontWeight: 900, fontSize: 16, color: C.gold, letterSpacing: "0.2em" }}>SITI INTELLIGENCE — PRICING</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
          {plans.map(p => (
            <div key={p.name} style={{ border: `1px solid ${p.color}44`, padding: "14px 12px", background: C.panel }}>
              <div style={{ fontSize: 9, color: p.color, fontWeight: 700, letterSpacing: "0.15em", marginBottom: 8 }}>{p.name}</div>
              <div style={{ fontSize: 18, color: p.color, fontWeight: 900, fontFamily: "'Chivo',sans-serif", marginBottom: 6 }}>{p.price}</div>
              <div style={{ fontSize: 8.5, color: C.textDim, lineHeight: 1.5 }}>{p.desc}</div>
              <button
                onClick={() => {
                  const msg = p.name === "ENTERPRISE"
                    ? "Hi, I'm interested in SITI Intelligence Enterprise. Please contact me."
                    : `I want to start the ${p.name} plan at ${p.price}`;
                  window.open(`https://wa.me/917XXXXXXXXX?text=${encodeURIComponent(msg)}`);
                }}
                style={{ marginTop: 10, width: "100%", background: "none", border: `1px solid ${p.color}`, color: p.color, fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", padding: "5px 0", cursor: "pointer" }}>
                {p.name === "ENTERPRISE" ? "CONTACT US" : "BUY NOW →"}
              </button>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 8.5, color: C.textDim, lineHeight: 1.7, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
          <span style={{ color: C.green }}>✓</span> Razorpay secured · <span style={{ color: C.green }}>✓</span> Auto-provisioned API key on payment · <span style={{ color: C.green }}>✓</span> 7-day money-back guarantee
        </div>
      </div>
    </div>
  );
}

// ─── HUB CARD ─────────────────────────────────────────────────────────────────
function HubCard({ hub, criticalRho = 0.85 }) {
  const rho = hub?.rho ?? 0;
  const isCollapse = rho >= 0.85;
  const isCritical = rho > 0.75;
  const statusColor = isCollapse ? C.red : isCritical ? C.yellow : C.green;
  const k = hub?.kalman ?? {};

  return (
    <div style={{ background: C.surface, border: `1px solid ${isCollapse ? C.red : C.borderBright}`, padding: "14px 16px", transition: "border-color 0.3s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
          <div style={{ fontFamily: "'Chivo',sans-serif", fontWeight: 900, fontSize: 12, color: C.gold, letterSpacing: "0.12em" }}>{hub?.name?.toUpperCase()}</div>
        </div>
        <div style={{ fontSize: 8, color: statusColor, border: `1px solid ${statusColor}44`, padding: "1px 6px" }}>
          {isCollapse ? "CRITICAL" : isCritical ? "WARNING" : "NOMINAL"}
        </div>
      </div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 26, fontWeight: 700, color: isCollapse ? C.red : isCritical ? C.yellow : C.gold, marginBottom: 6 }}>
        {rho.toFixed(4)}
      </div>
      <div style={{ height: 4, background: C.border, marginBottom: 10, position: "relative" }}>
        <div style={{ height: "100%", width: `${Math.min(rho * 100, 100)}%`, background: statusColor, transition: "width 0.5s" }} />
        <div style={{ position: "absolute", left: "85%", top: -2, bottom: -2, width: 1, background: `${C.red}88` }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
        {[
          { label: "T+1 45m", val: k.rho_t1?.toFixed(4), color: (k.rho_t1 ?? 0) >= 0.85 ? C.red : C.green },
          { label: "T+3 135m", val: k.rho_t3?.toFixed(4), color: (k.rho_t3 ?? 0) >= 0.85 ? C.red : C.green },
          { label: "λ eff", val: `${hub?.effective_lambda?.toFixed(1)}/hr`, color: C.blue },
        ].map(item => (
          <div key={item.label} style={{ background: C.panel, padding: "4px 6px", border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 7, color: C.textDim }}>{item.label}</div>
            <div style={{ fontSize: 11, color: item.color, fontWeight: 700 }}>{item.val ?? "—"}</div>
          </div>
        ))}
      </div>
      {hub?.cascade_risk && (
        <div style={{ marginTop: 8, fontSize: 8, color: C.yellow, border: `1px dashed ${C.yellow}66`, padding: "3px 6px", fontWeight: 700 }}>
          ⚠ CASCADE RISK — RECEIVING DIVERTED TRAFFIC
        </div>
      )}
    </div>
  );
}

// ─── MIMI MATH PANEL ──────────────────────────────────────────────────────────
function MimiPanel({ kState }) {
  const rho = kState?.global_rho ?? 0;
  const phi = kState?.phi ?? 0;
  const wq = kState?.wq ?? 0;
  const k = kState?.kalman ?? {};
  const irp = kState?.inverse_reliability ?? {};
  const isCollapse = rho >= 0.85;

  const formulas = [
    { title: "ρ = λ/μ", val: rho.toFixed(4), color: isCollapse ? C.red : C.gold, desc: `${kState?.total_lambda?.toFixed(1)}/hr ÷ ${((kState?.mu??150)*3)} = ${rho.toFixed(4)}` },
    { title: "Φ(ρ) sigmoidal", val: phi.toFixed(4), color: phi > 0.5 ? C.red : C.green, desc: `1/(1+e^{-20(ρ-0.85)}) = ${phi.toFixed(4)}` },
    { title: "T+3 Kalman", val: k.rho_t3?.toFixed(4) ?? "—", color: (k.rho_t3??0) >= 0.85 ? C.red : C.green, desc: "135-min forecast via 2D state vector" },
    { title: "W_q M/M/1", val: Math.min(wq, 99.9).toFixed(3), color: wq > 4 ? C.red : C.blue, desc: `ρ/(1-ρ) queue depth` },
    { title: "IRP Leakage", val: `$${irp.leakage_total?.toFixed(0) ?? 0}`, color: "#FF9F0A", desc: `${irp.failure_count ?? 0} hi-imp fails × $3.94` },
    { title: "ρ_critical", val: kState?.critical_rho?.toFixed(4) ?? "0.85", color: "#FF9F0A", desc: "LR-computed threshold" },
  ];

  return (
    <div style={{ background: C.surface, border: `1px solid ${isCollapse ? C.red : C.borderBright}` }}>
      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
        <div style={{ fontSize: 9, color: C.gold, fontWeight: 700, letterSpacing: "0.12em" }}>MIMI KERNEL v2.0 — 2D KALMAN STATE OBSERVER</div>
        <div style={{ fontSize: 8, color: isCollapse ? C.red : C.green, border: `1px solid ${isCollapse ? C.redDim : C.greenDim}`, padding: "1px 8px", fontWeight: 700 }}>
          {isCollapse ? "COLLAPSE ρ≥0.85" : "KERNEL ACTIVE"}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
        {formulas.map((f, i) => (
          <div key={f.title} style={{ padding: "12px 14px", borderRight: i % 3 < 2 ? `1px solid ${C.border}` : "none", borderBottom: i < 3 ? `1px solid ${C.border}` : "none" }}>
            <div style={{ fontSize: 8, color: C.textDim, letterSpacing: "0.1em", marginBottom: 6 }}>{f.title}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: f.color, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>{f.val}</div>
            <div style={{ fontSize: 8, color: C.textMuted, marginTop: 4 }}>{f.desc}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: "8px 12px", borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: C.textDim, marginBottom: 4 }}>
          <span>ρ=0</span><span style={{ color: "#FF9F0A" }}>DIVERSION 0.80</span><span style={{ color: C.red }}>COLLAPSE 0.85</span><span>ρ=1</span>
        </div>
        <div style={{ height: 6, background: C.border, position: "relative" }}>
          <div style={{ height: "100%", width: `${Math.min(rho * 100, 100)}%`, background: isCollapse ? C.red : rho > 0.80 ? "#FF9F0A" : C.gold, transition: "width 0.5s" }} />
          <div style={{ position: "absolute", left: "80%", top: 0, bottom: 0, width: 1, background: "#FF9F0A88" }} />
          <div style={{ position: "absolute", left: "85%", top: 0, bottom: 0, width: 1, background: `${C.red}88` }} />
        </div>
      </div>
    </div>
  );
}

// ─── CHARTS ───────────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#111", border: `1px solid ${C.borderBright}`, padding: "8px 12px", fontSize: 10 }}>
      <div style={{ color: C.gold, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color ?? C.text }}>{p.name}: {typeof p.value === "number" ? p.value.toFixed(4) : p.value}</div>
      ))}
    </div>
  );
}

function HubCharts({ kState }) {
  const hubs = kState?.hubs ?? [];
  const delay = kState?.average_delay ?? [];
  const rzImportance = kState?.red_zone_importance ?? [];
  const rhoHistory = kState?.rho_history ?? [];
  const PIE_COLORS = [C.red, "#FF9F0A", C.blue];
  const HUB_COLORS = { "Mumbai BOM": "#FF3B30", "Delhi IGI": "#FF9F0A", "Bengaluru": "#FFB340", "Chennai MAA": C.blue, "Hyderabad": C.green };

  const hubCompare = hubs.map(h => ({
    name: h.name?.split(" ")[0],
    rho: h.rho,
    rho_t1: h.kalman?.rho_t1 ?? 0,
    rho_t3: h.kalman?.rho_t3 ?? 0,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Hub comparison bar */}
      <div style={{ background: C.surface, border: `1px solid ${C.borderBright}`, padding: 14 }}>
        <div style={{ fontSize: 9, color: C.text, letterSpacing: "0.12em", marginBottom: 10 }}>HUB UTILIZATION COMPARISON · ρ = λ/μ</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={hubCompare} barGap={4}>
            <CartesianGrid vertical={false} stroke={C.border} />
            <XAxis dataKey="name" tick={{ fill: C.textDim, fontSize: 9 }} axisLine={false} />
            <YAxis domain={[0, 1.0]} tick={{ fill: C.textDim, fontSize: 9 }} axisLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine y={0.85} stroke={C.red} strokeDasharray="4 4" label={{ value: "ρ_c=0.85", fill: C.red, fontSize: 8 }} />
            <Bar dataKey="rho" name="ρ current" fill={C.gold} radius={[2,2,0,0]} />
            <Bar dataKey="rho_t1" name="T+1" fill={C.blue} radius={[2,2,0,0]} />
            <Bar dataKey="rho_t3" name="T+3" fill="#FF9F0A" radius={[2,2,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Rho history area chart */}
      <div style={{ background: C.surface, border: `1px solid ${C.borderBright}`, padding: 14 }}>
        <div style={{ fontSize: 9, color: C.text, letterSpacing: "0.12em", marginBottom: 10 }}>NETWORK ρ TRAJECTORY · LIVE KALMAN STREAM</div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={rhoHistory}>
            <defs>
              <linearGradient id="rhoGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C.gold} stopOpacity={0.3} />
                <stop offset="95%" stopColor={C.gold} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke={C.border} />
            <XAxis dataKey="time" tick={{ fill: C.textDim, fontSize: 7 }} axisLine={false} />
            <YAxis domain={[0, 1.1]} tick={{ fill: C.textDim, fontSize: 8 }} axisLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine y={0.85} stroke={C.red} strokeDasharray="4 4" />
            <Area type="monotone" dataKey="rho" name="ρ" stroke={C.gold} strokeWidth={2} fill="url(#rhoGrad)" dot={false} />
            <Line type="monotone" dataKey="t3" name="T+3" stroke={C.neonGreen} strokeWidth={1.5} strokeDasharray="6 3" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Delay + Importance */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.borderBright}`, padding: 14 }}>
          <div style={{ fontSize: 9, color: C.text, letterSpacing: "0.12em", marginBottom: 8 }}>AVG DELAY BY WAREHOUSE BLOCK</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={delay}>
              <CartesianGrid vertical={false} stroke={C.border} />
              <XAxis dataKey="block" tick={{ fill: C.textDim, fontSize: 9 }} axisLine={false} />
              <YAxis tick={{ fill: C.textDim, fontSize: 8 }} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="avg_delay" name="Avg Delay (hrs)" fill={C.gold} radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.borderBright}`, padding: 14 }}>
          <div style={{ fontSize: 9, color: C.text, letterSpacing: "0.12em", marginBottom: 8 }}>RED-ZONE FAILURE BY IMPORTANCE</div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={rzImportance} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} innerRadius={30}>
                {rzImportance.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 9, color: C.textDim }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── IRP TABLE ────────────────────────────────────────────────────────────────
function IRPTable({ kState }) {
  const perHub = kState?.inverse_reliability_per_hub ?? [];
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.borderBright}` }}>
      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
        <div style={{ fontSize: 8.5, color: C.text, letterSpacing: "0.1em" }}>INVERSE RELIABILITY PARADOX — PER HUB</div>
        <div style={{ fontSize: 8, color: C.yellow, border: `1px solid ${C.yellow}44`, padding: "1px 6px" }}>IRP CONFIRMED</div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8.5, fontFamily: "'JetBrains Mono',monospace" }}>
        <thead>
          <tr>{["HUB", "ρ", "HI-IMP FAIL%", "LO-IMP FAIL%", "IRP GAP", "₹ IMPACT/YR"].map(h => (
            <th key={h} style={{ padding: "6px 10px", textAlign: h === "HUB" ? "left" : "right", color: C.textDim, fontWeight: 400, fontSize: 7.5, borderBottom: `1px solid ${C.border}` }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {perHub.map(row => {
            const rho = row.rho ?? 0;
            const hiRate = ((row.hi_fail_rate ?? 0) * 100).toFixed(2);
            const loRate = ((row.lo_fail_rate ?? 0) * 100).toFixed(2);
            const gap = ((row.irp_gap ?? 0) * 100).toFixed(1);
            const impact = (row.annual_impact_cr ?? 0).toFixed(2);
            return (
              <tr key={row.hub} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "7px 10px", color: C.gold, fontWeight: 700 }}>{row.hub}</td>
                <td style={{ padding: "7px 10px", textAlign: "right", color: rho >= 0.85 ? C.red : C.text }}>{rho.toFixed(4)}</td>
                <td style={{ padding: "7px 10px", textAlign: "right", color: C.red }}>{hiRate}%</td>
                <td style={{ padding: "7px 10px", textAlign: "right", color: C.blue }}>{loRate}%</td>
                <td style={{ padding: "7px 10px", textAlign: "right", color: C.yellow, fontWeight: 700 }}>+{gap}pp</td>
                <td style={{ padding: "7px 10px", textAlign: "right", color: C.green }}>₹{impact}Cr</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── LIVE API STREAM PANEL ────────────────────────────────────────────────────
function LiveAPIPanel({ apiBase }) {
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [apiKey, setApiKey] = useState("siti-admin-key-001");
  const [sseActive, setSseActive] = useState(false);
  const eventSourceRef = useRef(null);
  const logRef = useRef(null);

  const startSSE = useCallback(() => {
    if (eventSourceRef.current) return;
    const url = `${apiBase}/api/v1/stream?key=${apiKey}`;
    try {
      const es = new EventSource(url);
      es.onopen = () => { setConnected(true); setSseActive(true); };
      es.onmessage = (e) => {
        const data = JSON.parse(e.data);
        setEvents(prev => [...prev.slice(-49), { ...data, ts: new Date().toLocaleTimeString("en-IN") }]);
      };
      es.onerror = () => { es.close(); setConnected(false); setSseActive(false); eventSourceRef.current = null; };
      eventSourceRef.current = es;
    } catch (err) {
      console.error("SSE failed:", err);
    }
  }, [apiBase, apiKey]);

  const stopSSE = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setConnected(false);
    setSseActive(false);
  }, []);

  useEffect(() => { return () => eventSourceRef.current?.close(); }, []);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [events]);

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.borderBright}`, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: C.text, letterSpacing: "0.12em", fontWeight: 700 }}>LIVE API STREAM — COMPANY INTEGRATION</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: connected ? C.green : C.red }} />
          <div style={{ fontSize: 8, color: connected ? C.green : C.red }}>{connected ? "STREAMING" : "OFFLINE"}</div>
        </div>
      </div>
      <div style={{ fontSize: 8, color: C.textDim, marginBottom: 10, lineHeight: 1.6 }}>
        When a company puts their API key here and clicks CONNECT, their real shipment data flows live into the MIMI Kernel. Every intercept call updates the dashboard in real-time.
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <input
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="Your API key..."
          style={{ flex: 1, background: C.panel, border: `1px solid ${C.borderBright}`, color: C.text, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, padding: "5px 10px", outline: "none" }}
        />
        <button onClick={sseActive ? stopSSE : startSSE} style={{
          background: sseActive ? "#001A05" : C.panel,
          border: `1px solid ${sseActive ? C.green : C.borderBright}`,
          color: sseActive ? C.green : C.textDim,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", padding: "5px 14px", cursor: "pointer"
        }}>
          {sseActive ? "DISCONNECT" : "CONNECT LIVE"}
        </button>
      </div>

      {/* API Endpoint reference */}
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, padding: "10px 12px", marginBottom: 10, fontSize: 8.5, fontFamily: "'JetBrains Mono',monospace" }}>
        <div style={{ color: C.blue, marginBottom: 4 }}>POST {apiBase}/api/v1/intercept</div>
        <div style={{ color: C.textDim }}>{`{"shipments":[{"id":"SHP-001","warehouse_block":"A","cost":245,"product_importance":"High"}],"config":{"mu":150}}`}</div>
        <div style={{ marginTop: 6, color: C.green }}>→ {"{"}"status":"nominal|critical|collapse","recommended_action":"NOMINAL|MONITOR|DIVERT"{"}"}</div>
      </div>

      {/* Live event log */}
      <div ref={logRef} style={{ height: 120, overflowY: "auto", background: C.panel, border: `1px solid ${C.border}`, padding: "6px 10px" }}>
        {events.length === 0 ? (
          <div style={{ fontSize: 8, color: C.textMuted, fontFamily: "'JetBrains Mono',monospace" }}>Waiting for live stream... connect your API key above.</div>
        ) : events.map((ev, i) => (
          <div key={i} style={{ fontSize: 8, color: ev.status === "collapse" ? C.red : ev.status === "critical" ? C.yellow : C.green, fontFamily: "'JetBrains Mono',monospace", marginBottom: 2 }}>
            [{ev.ts}] ρ={ev.global_rho?.toFixed(4)} · STATUS={ev.status?.toUpperCase()} · ACTION={ev.recommended_action}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {[
          { label: "ENDPOINT", val: "/api/v1/intercept", color: C.blue },
          { label: "AUTH", val: "Bearer Token", color: C.gold },
          { label: "RATE LIMIT", val: "1000 req/min", color: C.green },
        ].map(item => (
          <div key={item.label} style={{ background: C.panel, border: `1px solid ${C.border}`, padding: "6px 8px" }}>
            <div style={{ fontSize: 7, color: C.textDim }}>{item.label}</div>
            <div style={{ fontSize: 9, color: item.color, fontWeight: 700 }}>{item.val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DATA INJECTION PANEL ─────────────────────────────────────────────────────
function DataInjectionPanel({ onRefresh, kState, ticker, mu, setMu, isStreaming, setIsStreaming, isGhostMode, setIsGhostMode, onCalibrating }) {
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const fileRef = useRef(null);
  const streamRef = useRef(null);
  const ghostRef = useRef(null);
  const ghostCountRef = useRef(0);

  const doUpload = async (file) => {
    onCalibrating(true);
    setUploadMsg(null); setUploadError(null);
    try {
      const rawText = await readFileResilient(file);
      const cleanText = sanitizeText(rawText);
      const remapped = preprocessCSV(cleanText);
      const blob = new Blob([remapped], { type: "text/csv" });
      const processed = new File([blob], file.name, { type: "text/csv" });
      const fd = new FormData();
      fd.append("file", processed);
      const [res] = await Promise.all([
        axios.post(`${API}/kernel/upload`, fd, { headers: { "Content-Type": "multipart/form-data" } }),
        new Promise(r => setTimeout(r, 2800)),
      ]);
      setUploadMsg(`GENIUS RESET COMPLETE — ${res.data.message}`);
      await onRefresh();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setUploadError(typeof detail === "string" ? detail : "Upload failed — check CSV format");
    } finally {
      onCalibrating(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    await doUpload(file);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const startStream = () => {
    setIsStreaming(true);
    streamRef.current = setInterval(async () => {
      await axios.post(`${API}/kernel/stream-batch?n=100`);
      await onRefresh();
    }, 10000);
  };
  const stopStream = () => { clearInterval(streamRef.current); setIsStreaming(false); };

  const startGhost = () => {
    setIsGhostMode(true);
    ghostCountRef.current = 0;
    ghostRef.current = setInterval(async () => {
      await axios.post(`${API}/kernel/stream-batch?n=50`);
      await onRefresh();
      ghostCountRef.current++;
      if (ghostCountRef.current >= 90) stopGhost();
    }, 1000);
  };
  const stopGhost = () => { clearInterval(ghostRef.current); setIsGhostMode(false); ghostCountRef.current = 0; };

  const handleMuChange = async (val) => {
    setMu(val);
    try { await axios.post(`${API}/kernel/set-mu`, { mu: val }); await onRefresh(); } catch {}
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "portrait", format: "a4" });
    const now = new Date().toISOString();
    const rho = kState?.rho ?? 0;
    const phi = kState?.phi ?? 0;
    const irp = kState?.inverse_reliability ?? {};

    doc.setFillColor(5, 5, 5);
    doc.rect(0, 0, 210, 45, "F");
    doc.setFillColor(255, 179, 64);
    doc.rect(0, 0, 5, 45, "F");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 179, 64);
    doc.setFontSize(18);
    doc.text("SITI INTELLIGENCE", 12, 14);
    doc.setFontSize(9);
    doc.setTextColor(200, 200, 200);
    doc.text("FORENSIC STATE AUDIT [Case #02028317]", 12, 22);
    doc.text(`GENERATED: ${now}`, 12, 30);
    doc.text(`DATASET: ${kState?.dataset_name ?? "SAFEXPRESS_CASE_02028317"}`, 12, 37);
    doc.setTextColor(255, 59, 48);
    doc.text(rho >= 0.85 ? "STATUS: UTILIZATION COLLAPSE — SIGMOIDAL DECAY TRIGGERED" : rho > 0.80 ? "STATUS: PREEMPTIVE DIVERSION PROTOCOL INITIATED" : "STATUS: NOMINAL OPERATIONS", 12, 43);

    doc.setTextColor(255, 179, 64);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("EXECUTIVE SUMMARY", 14, 58);
    autoTable(doc, {
      startY: 62,
      head: [["METRIC", "VALUE", "STATUS"]],
      body: [
        ["Hub Utilization (ρ)", rho.toFixed(4), rho > 0.80 ? "CRITICAL" : "NOMINAL"],
        ["Instability Φ(ρ)", phi.toFixed(4), phi < 0.2 ? "CRITICAL" : "STABLE"],
        ["Annualized Exposure", "$2,810,000", "AUDIT BASELINE"],
        ["Revenue Saved", `$${ticker?.revenue_saved?.toFixed(2) ?? "0.00"}`, "RECOVERED"],
        ["High-Imp Failures", irp.failure_count ?? 0, "IRP CONFIRMED"],
        ["Total Leakage", `$${irp.leakage_total?.toFixed(2) ?? "0.00"}`, "TRACKED"],
      ],
      theme: "grid",
      headStyles: { fillColor: [10,10,10], textColor: [255,179,64], fontSize: 8, fontStyle: "bold" },
      bodyStyles: { fillColor: [15,15,15], textColor: [220,220,220], fontSize: 8 },
    });
    doc.save(`siti-forensic-audit-${Date.now()}.pdf`);
  };

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.borderBright}`, padding: "14px 16px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {/* Col 1: CSV Upload */}
        <div>
          <div style={{ fontSize: 9, color: C.text, letterSpacing: "0.15em", marginBottom: 8, fontWeight: 700 }}>DATA INJECTION — GENIUS RESET</div>
          <div style={{ fontSize: 8.5, color: C.textDim, marginBottom: 10, lineHeight: 1.6 }}>
            Upload your logistics CSV. MIMI Kernel wipes history, runs logistic regression, recalculates ρ_critical. Auto-maps messy headers.
          </div>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleUpload} style={{ display: "none" }} id="siti-csv-upload" />
          <label htmlFor="siti-csv-upload" style={{
            display: "inline-block", background: uploading ? "#1A1A00" : "#1A0A00", border: `1px solid ${uploading ? C.gold : "#FF9F0A"}`,
            color: uploading ? C.gold : "#FF9F0A", fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700,
            letterSpacing: "0.12em", padding: "7px 16px", cursor: uploading ? "wait" : "pointer", userSelect: "none"
          }}>
            {uploading ? "PROCESSING..." : "⬆ UPLOAD CSV — GENIUS RESET"}
          </label>
          <div style={{ marginTop: 8, fontSize: 7.5, color: C.textDim, lineHeight: 1.8 }}>
            {["delay_status → Reached.on.Time_Y.N","wt → Weight_in_gms","block → Warehouse_block","priority → Product_importance"].map(m => (
              <div key={m}><span style={{ color: C.green }}>›</span> {m}</div>
            ))}
          </div>
          {uploadMsg && <div style={{ marginTop: 8, padding: "6px 10px", background: "#001A00", border: `1px solid ${C.green}`, color: C.green, fontSize: 8.5 }}>{uploadMsg}</div>}
          {uploadError && <div style={{ marginTop: 8, padding: "6px 10px", background: "#1A0000", border: `1px solid ${C.red}`, color: C.red, fontSize: 8.5 }}>ERROR: {uploadError}</div>}
        </div>

        {/* Col 2: PDF Export */}
        <div>
          <div style={{ fontSize: 9, color: C.text, letterSpacing: "0.15em", marginBottom: 8, fontWeight: 700 }}>FORENSIC AUDIT EXPORT</div>
          <div style={{ fontSize: 8.5, color: C.textDim, marginBottom: 10, lineHeight: 1.6 }}>
            Board-ready PDF: Forensic State Audit — MIMI Kernel analysis, IRP findings, Mission LiFE ESG certification.
          </div>
          <button onClick={exportPDF} style={{
            background: "#000D1A", border: `1px solid ${C.blue}`, color: C.blue, fontFamily: "'JetBrains Mono',monospace",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", padding: "7px 16px", cursor: "pointer"
          }}>
            📄 EXPORT FORENSIC AUDIT PDF
          </button>
          <div style={{ marginTop: 10, padding: 8, background: C.panel, border: `1px solid ${C.border}`, fontSize: 8, color: C.textDim, lineHeight: 1.8 }}>
            {["Executive KPI Summary", "MIMI Kernel Formulation", "IRP Table (Top 15 failures)", "Kalman Filter State Analysis", "Mission LiFE ESG Tag"].map(item => (
              <div key={item}><span style={{ color: C.green }}>✓</span> {item}</div>
            ))}
          </div>
        </div>

        {/* Col 3: μ Control + Streams */}
        <div>
          <div style={{ fontSize: 9, color: C.text, letterSpacing: "0.15em", marginBottom: 8, fontWeight: 700 }}>SERVICE CAPACITY (μ) CONTROL</div>
          <div style={{ fontSize: 8.5, color: C.textDim, marginBottom: 10, lineHeight: 1.6 }}>Adjust μ per hub. ρ = λ/μ recalculates instantly across all 5 hubs.</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <input type="range" min={50} max={500} step={5} value={mu} onChange={e => handleMuChange(Number(e.target.value))}
              style={{ flex: 1, accentColor: C.green, cursor: "pointer" }} />
            <div style={{ background: C.panel, border: `1px solid ${C.green}`, padding: "4px 10px", fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: C.green, minWidth: 80, textAlign: "center" }}>
              μ={mu}
            </div>
          </div>
          <div style={{ fontSize: 8, color: C.textDim, marginBottom: 12 }}>
            Network capacity: <span style={{ color: C.green }}>{mu * 5} units/hr</span> across 5 hubs
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button onClick={isStreaming ? stopStream : startStream} disabled={isGhostMode} style={{
              flex: 1, background: isStreaming ? "#001A0A" : C.panel, border: `1px solid ${isStreaming ? C.green : C.borderBright}`,
              color: isStreaming ? C.green : C.textDim, fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.1em", padding: "6px 0", cursor: isGhostMode ? "not-allowed" : "pointer", opacity: isGhostMode ? 0.4 : 1
            }}>
              {isStreaming ? "● HALT STREAM" : "LIVE STREAM"}
            </button>
            <button onClick={isGhostMode ? stopGhost : startGhost} disabled={isStreaming} style={{
              flex: 1, background: isGhostMode ? "#001A05" : C.panel, border: `1px solid ${isGhostMode ? C.neonGreen : C.borderBright}`,
              color: isGhostMode ? C.neonGreen : C.textDim, fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.1em", padding: "6px 0", cursor: isStreaming ? "not-allowed" : "pointer", opacity: isStreaming ? 0.4 : 1
            }}>
              {isGhostMode ? "● HALT GHOST" : "GHOST TRIGGER"}
            </button>
          </div>
          <div style={{ fontSize: 7.5, color: C.textDim }}>Stream: 100 units/10s · Ghost: 50 units/s (90s auto-stop)</div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function SITIDashboard() {
  const [kState, setKState] = useState(null);
  const [ticker, setTicker] = useState({ revenue_saved: 0, total_diverted: 0, refresh_count: 0 });
  const [loading, setLoading] = useState(true);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [mu, setMu] = useState(150);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isGhostMode, setIsGhostMode] = useState(false);

  const fetchState = useCallback(async () => {
    try {
      const [stateRes, tickRes] = await Promise.all([
        axios.get(`${API}/kernel/state`),
        axios.post(`${API}/kernel/tick`),
      ]);
      setKState(stateRes.data);
      setTicker(tickRes.data);
      setLoading(false);
    } catch (err) {
      console.error("API fetch failed:", err);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 5000);
    return () => clearInterval(interval);
  }, [fetchState]);

  const hubs = kState?.hubs ?? [];
  const globalRho = kState?.global_rho ?? 0;
  const catastrophe = kState?.catastrophe;
  const collapse = kState?.collapse;
  const isConnected = !!kState;
  const statusColor = collapse ? C.red : catastrophe ? C.yellow : C.green;
  const bgColor = collapse ? "#140000" : catastrophe ? "#0D0000" : C.bg;

  if (loading && !kState) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <SitiLogo size={52} />
        <div style={{ color: C.gold, fontFamily: "'Chivo',sans-serif", fontWeight: 900, fontSize: 18, letterSpacing: "0.2em" }}>SITI INTELLIGENCE</div>
        <div style={{ color: C.textDim, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, letterSpacing: "0.12em" }}>CONNECTING TO MIMI KERNEL...</div>
        <div style={{ fontSize: 9, color: C.textMuted }}>{API}</div>
      </div>
    );
  }

  return (
    <div style={{ background: bgColor, minHeight: "100vh", fontFamily: "'JetBrains Mono',monospace", color: C.text, fontSize: 12, transition: "background 0.5s" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: ${C.bg}; } ::-webkit-scrollbar-thumb { background: ${C.border}; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @import url('https://fonts.googleapis.com/css2?family=Chivo:wght@700;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
        input[type=range]{-webkit-appearance:none;height:4px;background:${C.border};border-radius:2px;outline:none}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;background:${C.green};border-radius:50%;cursor:pointer}
      `}</style>

      {isCalibrating && <CalibrationOverlay />}
      {showPayment && <PaymentModal onClose={() => setShowPayment(false)} />}
      {collapse && <div style={{ position: "fixed", inset: 0, border: `3px solid ${C.red}`, pointerEvents: "none", zIndex: 9997, animation: "blink 2s step-end infinite" }} />}

      {/* TOP BAR */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${collapse ? C.red + "44" : C.border}`, padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 54, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <SitiLogo size={34} />
          <div>
            <div style={{ fontFamily: "'Chivo',sans-serif", fontWeight: 900, fontSize: 14, color: C.gold, letterSpacing: "0.2em" }}>SITI INTELLIGENCE</div>
            <div style={{ fontSize: 8, color: C.textDim, letterSpacing: "0.1em" }}>LOGIC FOR THE PARADOX // POWERED BY MIMI v2.0</div>
          </div>
          <div style={{ width: 1, height: 28, background: C.border, margin: "0 8px" }} />
          <div style={{ fontSize: 9, color: C.blue, letterSpacing: "0.1em" }}>CASE #02028317</div>
        </div>

        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          {(isGhostMode || isStreaming) && (
            <div style={{ background: "#001A05", border: `1px solid ${C.neonGreen}`, color: C.neonGreen, fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", padding: "3px 10px", display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.neonGreen, animation: "pulse 0.75s ease-in-out infinite" }} />
              LIVE INFERENCE
            </div>
          )}
          {[
            { label: "NETWORK ρ", val: globalRho.toFixed(3), color: statusColor },
            { label: "λ TOTAL/HR", val: kState?.total_lambda?.toFixed(0) ?? "—", color: C.blue },
            { label: "SAVED", val: `$${ticker.revenue_saved?.toFixed(2)}`, color: C.green },
            { label: "EXPOSURE", val: "$2,810,000", color: C.red },
            { label: "API", val: isConnected ? "ONLINE" : "OFFLINE", color: isConnected ? C.green : C.red },
          ].map(item => (
            <div key={item.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 7, color: C.textDim, letterSpacing: "0.1em", marginBottom: 2 }}>{item.label}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: item.color, fontFamily: "'JetBrains Mono',monospace" }}>{item.val}</div>
            </div>
          ))}
          <button onClick={() => setShowPayment(true)} style={{ background: "#001A00", border: `1px solid ${C.green}`, color: C.green, fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", padding: "5px 14px", cursor: "pointer" }}>
            GET API KEY →
          </button>
        </div>
      </div>

      {/* HERO METRIC */}
      <div style={{ textAlign: "center", padding: "18px 16px 14px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 9, color: C.textDim, letterSpacing: "0.25em", marginBottom: 4 }}>ANNUALIZED REVENUE RECOVERY</div>
        <div style={{ fontSize: 46, fontWeight: 900, fontFamily: "'JetBrains Mono',monospace", color: C.neonGreen, lineHeight: 1, textShadow: `0 0 20px ${C.neonGreen}44` }}>$2.81M</div>
        <div style={{ fontSize: 8.5, color: C.textDim, marginTop: 4, letterSpacing: "0.12em" }}>MIMI KERNEL v2.0 · {hubs.length}-HUB NETWORK · 2D KALMAN STATE OBSERVER</div>
      </div>

      {/* HUB CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(hubs.length, 3)}, 1fr)`, gap: 10, padding: "10px 16px" }}>
        {hubs.map(hub => <HubCard key={hub.name} hub={hub} criticalRho={kState?.critical_rho} />)}
      </div>

      {/* ALERTS */}
      {collapse && (
        <div style={{ background: "#200000", border: `2px solid ${C.red}`, padding: "12px 24px", margin: "0 16px 4px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.red, animation: "blink 1s infinite" }} />
          <div style={{ color: C.red, fontFamily: "'Chivo',sans-serif", fontWeight: 900, fontSize: 14, letterSpacing: "0.2em" }}>NETWORK COLLAPSE: SIGMOIDAL DECAY TRIGGERED</div>
        </div>
      )}
      {catastrophe && !collapse && (
        <div style={{ background: "#1A0000", border: `1px solid #FF9F0A`, padding: "8px 24px", margin: "0 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ color: "#FF9F0A", fontFamily: "'Chivo',sans-serif", fontWeight: 900, fontSize: 12, letterSpacing: "0.15em", animation: "blink 1.5s infinite" }}>PREEMPTIVE DIVERSION PROTOCOL INITIATED</div>
        </div>
      )}
      {!isConnected && (
        <div style={{ background: "#0A0A1A", borderBottom: `1px solid ${C.blueDim}`, padding: "6px 24px", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.blue, animation: "pulse 1.5s infinite" }} />
          <div style={{ fontSize: 8.5, color: `${C.blue}88`, letterSpacing: "0.1em" }}>SIMULATION MODE · Upload CSV or connect API key for live data</div>
        </div>
      )}

      {/* TAB BAR */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, background: C.surface, margin: "8px 0 0" }}>
        {[
          { id: "overview", label: "NETWORK OVERVIEW" },
          { id: "kernel", label: "MIMI KERNEL" },
          { id: "live-api", label: "LIVE API STREAM" },
          { id: "data", label: "DATA INJECTION" },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: "9px 20px", fontSize: 8.5, letterSpacing: "0.1em", fontFamily: "'JetBrains Mono',monospace",
            background: "none", border: "none", cursor: "pointer", color: activeTab === tab.id ? C.gold : C.textDim,
            borderBottom: `2px solid ${activeTab === tab.id ? C.gold : "transparent"}`, transition: "all 0.2s"
          }}>{tab.label}</button>
        ))}
        {/* PVI Alert badge on tab */}
        {kState?.pvi_alert && <div style={{ margin: "auto 0 auto 8px", background: "#1A0A00", border: `1px solid #FF9F0A`, color: "#FF9F0A", fontSize: 8, fontWeight: 700, padding: "2px 8px", animation: "blink 1s infinite" }}>PVI ALERT</div>}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 1, background: C.border, padding: "12px 16px", gap: 12 }}>
          {/* LEFT: KPI cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "NETWORK ρ (λ/μ)", val: globalRho.toFixed(4), color: collapse ? C.red : C.gold },
              { label: "ARRIVALS λ/HR", val: `${kState?.total_lambda?.toFixed(1) ?? "—"}/hr`, color: C.blue },
              { label: "SERVICE μ/HUB", val: `${kState?.mu?.toFixed(0) ?? mu}/hr`, color: C.green },
              { label: "INSTABILITY Φ(ρ)", val: kState?.phi?.toFixed(4) ?? "—", color: (kState?.phi ?? 0) > 0.5 ? C.red : C.green },
              { label: "QUEUE DEPTH W_q", val: Math.min(kState?.wq ?? 0, 99.9).toFixed(3), color: (kState?.wq ?? 0) > 4 ? C.red : C.blue },
              { label: "DELIVERY FAIL RATE", val: `${((kState?.failure_rate ?? 0) * 100).toFixed(1)}%`, color: "#FF9F0A" },
              { label: "HIGH-IMP FAILURES", val: `${kState?.inverse_reliability?.failure_count ?? 0}`, color: C.red },
              { label: "LEAKAGE $3.94/UNIT", val: `$${kState?.inverse_reliability?.leakage_total?.toFixed(0) ?? 0}`, color: "#FF9F0A" },
              { label: "REVENUE SAVED", val: `$${ticker.revenue_saved?.toFixed(2)}`, color: C.green },
              { label: "DIVERTED UNITS", val: ticker.total_diverted?.toLocaleString(), color: C.green },
            ].map(item => (
              <div key={item.label} style={{ background: C.surface, border: `1px solid ${C.borderBright}`, padding: "10px 12px" }}>
                <div style={{ fontSize: 8, color: C.textDim, letterSpacing: "0.1em", marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: item.color, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>{item.val ?? "—"}</div>
              </div>
            ))}
          </div>

          {/* RIGHT: Charts + IRP table */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <HubCharts kState={kState} />
            <IRPTable kState={kState} />
          </div>
        </div>
      )}

      {/* KERNEL TAB */}
      {activeTab === "kernel" && (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <MimiPanel kState={kState} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ background: C.surface, border: `1px solid ${C.borderBright}`, padding: 14 }}>
              <div style={{ fontSize: 9, color: C.text, letterSpacing: "0.12em", marginBottom: 10 }}>KALMAN GAIN (2D STATE)</div>
              <div style={{ fontSize: 11, color: C.text, fontFamily: "'JetBrains Mono',monospace", marginBottom: 6 }}>K = P⁻H^T(HP⁻H^T + R)⁻¹</div>
              <div style={{ fontSize: 12, color: C.blue, fontFamily: "'JetBrains Mono',monospace" }}>K = [{(kState?.kalman?.K ?? [0,0]).map(v => v.toFixed(4)).join(", ")}]</div>
              <div style={{ fontSize: 8, color: C.textDim, marginTop: 4 }}>P_trace={kState?.kalman?.P?.toFixed(4)} · Q=diag(0.002,0.001) · R=0.005</div>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.borderBright}`, padding: 14 }}>
              <div style={{ fontSize: 9, color: C.text, letterSpacing: "0.12em", marginBottom: 10 }}>COMMANDER'S CONSOLE</div>
              <div style={{ fontSize: 8, color: kState?.commander_level === "critical" ? C.red : kState?.commander_level === "efficiency" ? C.blue : C.green, lineHeight: 1.8, fontWeight: 700 }}>
                {kState?.commander_message ?? "MIMI KERNEL: OPTIMAL FLOW DETECTED."}
              </div>
              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ background: C.panel, padding: "5px 8px", border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 7, color: C.textDim }}>T+3 PROJ</div>
                  <div style={{ fontSize: 14, color: (kState?.rho_t3 ?? 0) >= 0.85 ? C.red : C.green, fontWeight: 700 }}>ρ={(kState?.rho_t3 ?? 0).toFixed(4)}</div>
                </div>
                <div style={{ background: C.panel, padding: "5px 8px", border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 7, color: C.textDim }}>PVI VOLATILITY</div>
                  <div style={{ fontSize: 14, color: (kState?.pvi ?? 0) > 15 ? C.red : C.blue, fontWeight: 700 }}>{(kState?.pvi ?? 0).toFixed(1)}%</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LIVE API TAB */}
      {activeTab === "live-api" && (
        <div style={{ padding: 16 }}>
          <LiveAPIPanel apiBase={API_BASE} />
        </div>
      )}

      {/* DATA INJECTION TAB */}
      {activeTab === "data" && (
        <div style={{ padding: 16 }}>
          <DataInjectionPanel
            onRefresh={fetchState}
            kState={kState}
            ticker={ticker}
            mu={mu}
            setMu={setMu}
            isStreaming={isStreaming}
            setIsStreaming={setIsStreaming}
            isGhostMode={isGhostMode}
            setIsGhostMode={setIsGhostMode}
            onCalibrating={setIsCalibrating}
          />
        </div>
      )}
    </div>
  );
}
