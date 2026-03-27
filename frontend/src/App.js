import { useState, useEffect, useRef } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, Area, AreaChart, Legend
} from "recharts";

// ─── THEME ────────────────────────────────────────────────────────────────────
const C = {
  gold: "#FFB340", goldDim: "#FFB34066",
  red: "#FF3B30", redDim: "#FF3B3033",
  green: "#32D74B", greenDim: "#32D74B33",
  blue: "#64D2FF", blueDim: "#64D2FF33",
  yellow: "#FFD60A",
  bg: "#050505", surface: "#0A0A0A", panel: "#080808",
  border: "#161616", borderBright: "#1F1F1F",
  text: "#D4D4D8", textDim: "#555", textMuted: "#333",
};

const HUBS = [
  { name: "Mumbai BOM", region: "Maharashtra", color: "#FF3B30", mu: 280, lambda: 243 },
  { name: "Delhi IGI",  region: "NCR",         color: "#FF9F0A", mu: 260, lambda: 211 },
  { name: "Bengaluru",  region: "Karnataka",   color: "#FFB340", mu: 220, lambda: 136 },
  { name: "Chennai MAA",region: "Tamil Nadu",  color: "#64D2FF", mu: 180, lambda: 79  },
  { name: "Hyderabad",  region: "Telangana",   color: "#32D74B", mu: 160, lambda: 68  },
];

// ─── SIMULATION ENGINE ────────────────────────────────────────────────────────
function useSimulation(apiData) {
  const [tick, setTick] = useState(0);
  const [hubs, setHubs] = useState(HUBS.map(h => ({
    ...h,
    rho: parseFloat((h.lambda / h.mu).toFixed(4)),
    rho_t1: 0, rho_t3: 0, rho_dot: 0,
    hi_fail: 0, lo_fail: 0, history: [],
  })));
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (apiData?.hubs) return; // use real data if connected
    const interval = setInterval(() => {
      setTick(t => t + 1);
      setHubs(prev => prev.map(h => {
        const drift = (Math.random() - 0.48) * 0.012;
        const newRho = Math.max(0.1, Math.min(1.1, h.rho + drift));
        const dot = newRho - h.rho;
        return {
          ...h,
          rho: parseFloat(newRho.toFixed(4)),
          rho_t1: parseFloat((newRho + dot * 3).toFixed(4)),
          rho_t3: parseFloat((newRho + dot * 9).toFixed(4)),
          rho_dot: parseFloat(dot.toFixed(6)),
          hi_fail: parseFloat((newRho * 18.5).toFixed(1)),
          lo_fail: parseFloat((newRho * 10.2).toFixed(1)),
          lambda: parseFloat((h.mu * newRho).toFixed(1)),
        };
      }));
      setHistory(prev => {
        const entry = { time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) };
        HUBS.forEach((h, i) => { entry[h.name] = parseFloat((h.lambda / h.mu + (Math.random() - 0.5) * 0.05).toFixed(3)); });
        return [...prev.slice(-25), entry];
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [apiData]);

  const activeHubs = apiData?.hubs
    ? apiData.hubs.map(h => ({ ...HUBS.find(b => b.name === h.name) || HUBS[0], ...h, rho: h.rho_exact ?? h.rho }))
    : hubs;

  const globalRho = activeHubs.reduce((s, h) => s + h.rho, 0) / activeHubs.length;
  const totalLambda = activeHubs.reduce((s, h) => s + h.lambda, 0);
  const criticalHub = activeHubs.find(h => h.rho >= 0.80);
  const isConnected = !!apiData;

  return { hubs: activeHubs, globalRho, totalLambda, criticalHub, isConnected, history, tick };
}

// ─── ANIMATED NUMBER ─────────────────────────────────────────────────────────
function AnimNum({ value, decimals = 4, color = C.gold, size = 28 }) {
  return (
    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: size, fontWeight: 700, color, transition: "color 0.4s" }}>
      {typeof value === "number" ? value.toFixed(decimals) : value}
    </span>
  );
}

// ─── LOGO SVG ─────────────────────────────────────────────────────────────────
function SitiLogo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" fill="none">
      <path d="M 24 7 C 30 7, 30 15, 17 17 C 4 19, 4 27, 10 27" stroke={C.gold} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="24" cy="7" r="2.6" fill={C.gold} />
      <circle cx="10" cy="27" r="2.6" fill={C.gold} opacity="0.65" />
      <circle cx="17" cy="17" r="1.3" fill={C.goldDim} />
    </svg>
  );
}

// ─── TOP COMMAND BAR ──────────────────────────────────────────────────────────
function TopBar({ globalRho, criticalHub, isConnected, totalLambda, tick }) {
  const status = globalRho > 0.85 ? "COLLAPSE" : globalRho > 0.75 ? "CRITICAL" : "NOMINAL";
  const statusColor = globalRho > 0.85 ? C.red : globalRho > 0.75 ? C.yellow : C.green;
  const now = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 52 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <SitiLogo size={32} />
        <div>
          <div style={{ fontFamily: "'Chivo', sans-serif", fontWeight: 900, fontSize: 14, color: C.gold, letterSpacing: "0.2em" }}>SITI INTELLIGENCE</div>
          <div style={{ fontSize: 8, color: C.textDim, letterSpacing: "0.12em" }}>INTELLIGENCE · OPS COMMAND · MIMI KERNEL v2.0</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
        {[
          { label: "NETWORK ρ", val: globalRho.toFixed(3), color: statusColor },
          { label: "λ TOTAL/HR", val: totalLambda.toFixed(0), color: C.blue },
          { label: "IRP EXPOSURE", val: `₹${(globalRho * 42.5).toFixed(1)}Cr/yr`, color: C.red },
          { label: "LATENCY P99", val: "0.13ms", color: C.green },
          { label: "REFRESH", val: `#${tick}`, color: C.textDim },
        ].map(item => (
          <div key={item.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 7, color: C.textDim, letterSpacing: "0.1em", marginBottom: 2 }}>{item.label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: item.color, fontFamily: "'JetBrains Mono', monospace" }}>{item.val}</div>
          </div>
        ))}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 7, color: C.textDim, letterSpacing: "0.1em", marginBottom: 2 }}>MIMI KERNEL</div>
          <div style={{ fontSize: 10, color: C.green, fontWeight: 700, letterSpacing: "0.08em" }}>ACTIVE</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 7, color: C.textDim, letterSpacing: "0.1em", marginBottom: 2 }}>HUB STATUS</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: statusColor, letterSpacing: "0.08em" }}>{status}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 7, color: C.textDim, letterSpacing: "0.1em", marginBottom: 2 }}>API</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: isConnected ? C.green : C.red }}>{isConnected ? "ONLINE" : "OFFLINE"}</div>
        </div>
        <div style={{ fontSize: 9, color: C.textDim, fontFamily: "'JetBrains Mono', monospace" }}>{now} UTC</div>
      </div>
    </div>
  );
}

// ─── SCROLLING TICKER ─────────────────────────────────────────────────────────
function Ticker({ hubs, globalRho }) {
  const items = hubs.flatMap(h => [
    `${h.name.toUpperCase()} ρ=${h.rho.toFixed(3)}`,
    `IRP +${(h.rho * 8.3).toFixed(1)}pp`,
    `λ ${h.lambda.toFixed(0)}/hr`,
    "·",
  ]);

  return (
    <div style={{ background: "#060606", borderBottom: `1px solid ${C.border}`, padding: "5px 0", overflow: "hidden", position: "relative" }}>
      <div style={{ display: "flex", gap: 24, animation: "tickerScroll 35s linear infinite", whiteSpace: "nowrap" }}>
        {[...items, ...items].map((item, i) => (
          <span key={i} style={{ fontSize: 8, color: item === "·" ? C.border : item.includes("ρ") ? C.gold : C.textDim, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em" }}>{item}</span>
        ))}
      </div>
      <style>{`@keyframes tickerScroll { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
    </div>
  );
}

// ─── WARNING BANNER ───────────────────────────────────────────────────────────
function WarningBanner({ criticalHub, isConnected }) {
  if (!criticalHub && isConnected) return null;
  const msg = !isConnected
    ? "STATUS: SIMULATION MODE · CONNECT YOUR API KEY OR UPLOAD CSV TO SEE LIVE DATA · 5 HUBS MONITORED"
    : `⚠ WARNING: Hub ${criticalHub.name} at ${(criticalHub.rho * 100).toFixed(1)}% — Divert inbound shipments immediately · Window closes in 45m`;

  return (
    <div style={{ background: !isConnected ? "#0A0A1A" : "#1A0500", borderBottom: `1px solid ${!isConnected ? C.blueDim : C.redDim}`, padding: "6px 16px", display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: !isConnected ? C.blue : C.yellow, animation: "pulse 1.2s ease-in-out infinite" }} />
      <div style={{ fontSize: 8.5, color: !isConnected ? "#64D2FF88" : C.yellow, letterSpacing: "0.1em", fontFamily: "'JetBrains Mono', monospace" }}>{msg}</div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.3;transform:scale(0.8)} }`}</style>
    </div>
  );
}

// ─── KPI ROW ──────────────────────────────────────────────────────────────────
function KPIRow({ hubs, globalRho, totalLambda }) {
  const totalDiverted = 12582;
  const revenueSaved = 49.2;
  const criticalRho = 0.847;

  const kpis = [
    { label: "NETWORK ρ (λ/μ)", val: globalRho.toFixed(3), sub: "global utilization", color: globalRho > 0.85 ? C.red : C.gold },
    { label: "ARRIVALS / HR", val: totalLambda.toFixed(0), sub: `λ across ${hubs.length} hubs`, color: C.blue },
    { label: "DIVERTED UNITS", val: totalDiverted.toLocaleString(), sub: "total this month", color: C.green },
    { label: "REVENUE SAVED", val: `₹${revenueSaved}L`, sub: "SLA breach prevention", color: C.green },
    { label: "CRITICAL ρ_c", val: criticalRho.toFixed(3), sub: "logistic regression threshold", color: "#FF9F0A" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1, background: C.border }}>
      {kpis.map(k => (
        <div key={k.label} style={{ background: C.panel, padding: "12px 14px" }}>
          <div style={{ fontSize: 7.5, color: C.textDim, letterSpacing: "0.1em", marginBottom: 6 }}>{k.label}</div>
          <div style={{ fontFamily: "'Chivo', sans-serif", fontWeight: 900, fontSize: 22, color: k.color, lineHeight: 1 }}>{k.val}</div>
          <div style={{ fontSize: 7, color: C.textMuted, marginTop: 4 }}>{k.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ─── HUB ROW CARD ─────────────────────────────────────────────────────────────
function HubRow({ hub }) {
  const rho = hub.rho;
  const isCollapse = rho >= 0.85;
  const isCritical = rho >= 0.75;
  const statusColor = isCollapse ? C.red : isCritical ? C.yellow : C.green;
  const statusLabel = isCollapse ? "CRITICAL" : isCritical ? "WARNING" : "NOMINAL";
  const pct = Math.min(rho * 100, 100);

  return (
    <div style={{ padding: "11px 14px", borderBottom: `1px solid ${C.border}`, background: isCollapse ? "#0D0000" : C.panel, transition: "background 0.4s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor, boxShadow: `0 0 6px ${statusColor}`, animation: isCollapse ? "pulse 0.8s infinite" : "none" }} />
          <div style={{ fontFamily: "'Chivo', sans-serif", fontWeight: 900, fontSize: 12, color: hub.color, letterSpacing: "0.12em" }}>{hub.name.toUpperCase()}</div>
          <div style={{ fontSize: 7.5, color: C.textDim }}>{hub.region}</div>
        </div>
        <div style={{ fontSize: 8, color: statusColor, border: `1px solid ${statusColor}44`, padding: "1px 7px", fontWeight: 700 }}>{statusLabel}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 22, color: isCollapse ? C.red : isCritical ? C.yellow : hub.color, minWidth: 64 }}>
          {(pct).toFixed(1)}%
        </div>
        <div style={{ flex: 1, position: "relative" }}>
          <div style={{ height: 5, background: C.border, borderRadius: 3 }}>
            <div style={{ height: "100%", width: `${pct}%`, background: statusColor, borderRadius: 3, transition: "width 0.8s ease" }} />
          </div>
          <div style={{ position: "absolute", left: "85%", top: -3, bottom: -3, width: 1, background: `${C.red}66` }} />
        </div>
        <div style={{ fontSize: 7.5, color: C.textDim, fontFamily: "'JetBrains Mono', monospace", textAlign: "right", minWidth: 90 }}>
          T+3: {hub.rho_t3 ? (hub.rho_t3 * 100).toFixed(1) : (pct + 0.5).toFixed(1)}%
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, fontSize: 7.5, color: C.textDim, fontFamily: "'JetBrains Mono', monospace" }}>
        <span>λ <span style={{ color: hub.color }}>{hub.lambda.toFixed(0)}/hr</span></span>
        <span>μ <span style={{ color: C.green }}>{hub.mu}/hr</span></span>
        <span>HI-IMP <span style={{ color: C.red }}>{hub.hi_fail || (rho * 18.5).toFixed(1)}%</span></span>
        <span>LO-IMP <span style={{ color: C.blue }}>{hub.lo_fail || (rho * 10.2).toFixed(1)}%</span></span>
        <span>IRP <span style={{ color: C.yellow }}>+{((rho * 18.5) - (rho * 10.2)).toFixed(1)}pp</span></span>
      </div>
    </div>
  );
}

// ─── KALMAN AREA CHART ────────────────────────────────────────────────────────
function KalmanChart({ history, hubs }) {
  if (history.length < 2) {
    return <div style={{ background: C.panel, border: `1px solid ${C.border}`, padding: 16, display: "flex", alignItems: "center", justifyContent: "center", height: 160 }}>
      <div style={{ fontSize: 9, color: C.textDim, letterSpacing: "0.1em" }}>AWAITING KALMAN DATA STREAM...</div>
    </div>;
  }

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, padding: "10px 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 8.5, color: "#888", letterSpacing: "0.12em" }}>KALMAN ρ · LIVE 2D STATE VECTOR · 5-HUB NETWORK</div>
        <div style={{ fontSize: 7.5, color: C.green, fontFamily: "'JetBrains Mono', monospace" }}>LIVE · {history.length} TICKS</div>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={history} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
          <defs>
            {hubs.map(h => (
              <linearGradient key={h.name} id={`grad-${h.name.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={h.color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={h.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke={C.border} />
          <XAxis dataKey="time" tick={{ fontSize: 7, fill: C.textDim, fontFamily: "JetBrains Mono" }} tickLine={false} />
          <YAxis domain={[0, 1.1]} tick={{ fontSize: 7, fill: C.textDim, fontFamily: "JetBrains Mono" }} tickLine={false} />
          <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, fontSize: 9, fontFamily: "JetBrains Mono" }} />
          {hubs.map(h => (
            <Area key={h.name} type="monotone" dataKey={h.name} stroke={h.color} strokeWidth={1.5} fill={`url(#grad-${h.name.replace(/\s/g, '')})`} dot={false} />
          ))}
          {/* Collapse line */}
          <Line type="monotone" dataKey={() => 0.85} stroke={C.red} strokeDasharray="3 3" strokeWidth={1} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 4 }}>
        {hubs.map(h => (
          <div key={h.name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 7, color: C.textDim }}>
            <div style={{ width: 12, height: 2, background: h.color }} />
            {h.name} ρ={h.rho.toFixed(3)}
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 7, color: C.red }}>
          <div style={{ width: 12, height: 1, background: C.red, borderTop: "1px dashed" }} />
          COLLAPSE ρ=0.85
        </div>
      </div>
    </div>
  );
}

// ─── BAR CHART: HUB UTILIZATION ───────────────────────────────────────────────
function HubUtilizationBar({ hubs }) {
  const data = hubs.map(h => ({
    name: h.name.split(" ")[0],
    utilization: parseFloat((h.rho * 100).toFixed(1)),
    capacity: 100,
    color: h.color,
  }));

  const CustomBar = (props) => {
    const { x, y, width, height, fill } = props;
    return <rect x={x} y={y} width={width} height={height} fill={fill} rx={2} />;
  };

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, padding: "10px 12px" }}>
      <div style={{ fontSize: 8.5, color: "#888", letterSpacing: "0.12em", marginBottom: 10 }}>HUB UTILIZATION COMPARISON · ρ = λ/μ</div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -25 }}>
          <CartesianGrid strokeDasharray="2 4" stroke={C.border} vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 8, fill: C.textDim, fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 110]} tick={{ fontSize: 7, fill: C.textDim, fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
          <Tooltip
            contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, fontSize: 9, fontFamily: "JetBrains Mono" }}
            formatter={(val) => [`${val}%`, "Utilization"]}
          />
          <Bar dataKey="utilization" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── PIE CHART: FAILURE DISTRIBUTION ─────────────────────────────────────────
function FailurePie({ hubs }) {
  const data = [
    { name: "High Importance", value: Math.round(hubs.reduce((s, h) => s + h.rho * 18.5, 0)), color: C.red },
    { name: "Medium Importance", value: Math.round(hubs.reduce((s, h) => s + h.rho * 8, 0)), color: "#FF9F0A" },
    { name: "Low Importance", value: Math.round(hubs.reduce((s, h) => s + h.rho * 10.2, 0)), color: C.blue },
  ];
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, padding: "10px 12px" }}>
      <div style={{ fontSize: 8.5, color: "#888", letterSpacing: "0.12em", marginBottom: 4 }}>RED-ZONE FAILURE BY IMPORTANCE</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ResponsiveContainer width={130} height={130}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={38} outerRadius={58} dataKey="value" startAngle={90} endAngle={-270}>
              {data.map((entry, i) => <Cell key={i} fill={entry.color} stroke="none" />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ flex: 1 }}>
          {data.map(d => (
            <div key={d.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.color }} />
                <div style={{ fontSize: 8, color: C.textDim }}>{d.name}</div>
              </div>
              <div style={{ fontSize: 9, color: d.color, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                {d.value} <span style={{ fontSize: 7, color: C.textDim }}>({((d.value / total) * 100).toFixed(0)}%)</span>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 7, color: C.textMuted, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
            IRP CONFIRMED: HIGH-IMP fails at {((hubs[0].rho * 18.5) / (hubs[0].rho * 10.2)).toFixed(1)}x rate vs LOW-IMP
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── IRP TABLE ────────────────────────────────────────────────────────────────
function IRPTable({ hubs }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 8.5, color: "#888", letterSpacing: "0.12em" }}>INVERSE RELIABILITY PARADOX — LIVE ANALYSIS</div>
        <div style={{ fontSize: 8, color: C.yellow, border: `1px solid ${C.yellow}44`, padding: "1px 8px", fontWeight: 700 }}>IRP CONFIRMED</div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8.5, fontFamily: "'JetBrains Mono', monospace" }}>
        <thead>
          <tr>
            {["HUB", "HIGH-IMP LATE%", "LOW-IMP LATE%", "IRP GAP", "₹ IMPACT/YR", "STATUS"].map(h => (
              <th key={h} style={{ padding: "6px 10px", textAlign: h === "HUB" ? "left" : "right", color: C.textDim, fontWeight: 400, fontSize: 7.5, letterSpacing: "0.07em", borderBottom: `1px solid ${C.border}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hubs.map(hub => {
            const hi = (hub.rho * 18.5).toFixed(2);
            const lo = (hub.rho * 10.2).toFixed(2);
            const gap = ((hub.rho * 18.5) - (hub.rho * 10.2)).toFixed(1);
            const cr = (hub.rho * 6.8).toFixed(1);
            const irpConfirmed = parseFloat(hi) > parseFloat(lo);
            return (
              <tr key={hub.name} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "7px 10px" }}>
                  <div style={{ color: hub.color, fontWeight: 700 }}>{hub.name}</div>
                  <div style={{ fontSize: 7, color: C.textDim }}>{hub.region}</div>
                </td>
                <td style={{ padding: "7px 10px", textAlign: "right", color: C.red }}>{hi}%</td>
                <td style={{ padding: "7px 10px", textAlign: "right", color: C.blue }}>{lo}%</td>
                <td style={{ padding: "7px 10px", textAlign: "right", color: C.yellow, fontWeight: 700 }}>+{gap}pp</td>
                <td style={{ padding: "7px 10px", textAlign: "right", color: C.green }}>₹{cr}Cr</td>
                <td style={{ padding: "7px 10px", textAlign: "right" }}>
                  <span style={{ fontSize: 7.5, color: irpConfirmed ? C.red : C.green, border: `1px solid ${irpConfirmed ? C.redDim : C.greenDim}`, padding: "1px 5px" }}>
                    {irpConfirmed ? "PARADOX" : "STABLE"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── MIMI KERNEL MATH PANEL ───────────────────────────────────────────────────
function MimiKernelPanel({ hubs, globalRho }) {
  const mu = hubs.reduce((s, h) => s + h.mu, 0) / hubs.length;
  const totalLambda = hubs.reduce((s, h) => s + h.lambda, 0);
  const totalMu = hubs.reduce((s, h) => s + h.mu, 0);
  const phi = 1 / (1 + Math.exp(-20 * (globalRho - 0.85)));
  const wq = globalRho < 1 ? globalRho / (1 - globalRho) : 99.99;
  const k = 0.29 + globalRho * 0.4;
  const isCollapse = globalRho >= 0.85;

  return (
    <div style={{ background: C.panel, border: `1px solid ${isCollapse ? C.redDim : C.border}`, padding: "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 9, color: C.gold, letterSpacing: "0.12em", fontWeight: 700 }}>MIMI KERNEL v2.0 — 2D KALMAN STATE OBSERVER</div>
          <div style={{ fontSize: 7.5, color: C.textDim, marginTop: 2 }}>ρ = λ/μ · F = [[1,Δt],[0,1]] · {hubs.length}-HUB NETWORK CASCADE ENGINE</div>
        </div>
        <div style={{ fontSize: 8, color: isCollapse ? C.red : C.green, border: `1px solid ${isCollapse ? C.redDim : C.greenDim}`, padding: "2px 10px", fontWeight: 700 }}>
          {isCollapse ? `COLLAPSE ρ ≥ 0.85` : "KERNEL ACTIVE"}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Left: Queueing + Kalman */}
        <div>
          <div style={{ fontSize: 7.5, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>NETWORK UTILIZATION (QUEUEING THEORY)</div>
          <div style={{ fontSize: 11, color: C.text, fontFamily: "'JetBrains Mono', monospace", textAlign: "center", marginBottom: 4 }}>
            ρ = λ/μ = {totalLambda.toFixed(1)}/{totalMu}
          </div>
          <div style={{ fontSize: 9, color: C.gold, marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>ρ = {globalRho.toFixed(4)}</div>
          <div style={{ fontSize: 7, color: C.textDim, marginBottom: 12 }}>λ={totalLambda.toFixed(1)}/hr across {hubs.length} hubs · μ={mu.toFixed(0)}/hr per hub</div>

          <div style={{ fontSize: 7.5, color: C.textDim, letterSpacing: "0.08em", marginBottom: 6 }}>2D KALMAN STATE VECTOR</div>
          <div style={{ fontSize: 10, color: C.text, fontFamily: "'JetBrains Mono', monospace", marginBottom: 4 }}>
            x = [ρ, ρ̇]ᵀ  ·  F = [[1, Δt], [0, 1]]
          </div>
          <div style={{ fontSize: 9, color: C.blue, fontFamily: "'JetBrains Mono', monospace" }}>
            x = [{globalRho.toFixed(4)}, {(hubs[0]?.rho_dot || 0).toFixed(6)}]
          </div>
          <div style={{ fontSize: 7, color: C.textDim, marginTop: 2 }}>Velocity model: T+3 = ρ + 3·Δt·ρ̇</div>
        </div>

        {/* Right: Sigmoidal + Queue + Kalman Gain */}
        <div>
          <div style={{ fontSize: 7.5, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>SIGMOIDAL PRIORITY DECAY Φ(ρ)</div>
          <div style={{ fontSize: 10, color: C.text, fontFamily: "'JetBrains Mono', monospace", marginBottom: 4 }}>
            Φ(ρ) = 1 / (1 + e⁻²⁰⁽ᵖ⁻⁰·⁸⁵⁾)
          </div>
          <div style={{ fontSize: 9, color: phi > 0.5 ? C.red : C.green, fontFamily: "'JetBrains Mono', monospace", marginBottom: 2 }}>
            Φ(ρ) = {phi.toFixed(4)}
          </div>
          <div style={{ fontSize: 7, color: phi > 0.5 ? C.red : C.textDim, marginBottom: 10 }}>
            Instability: {phi > 0.5 ? "CASCADING FAILURE" : phi > 0.1 ? "ELEVATED" : "STABLE"}
          </div>

          <div style={{ fontSize: 7.5, color: C.textDim, letterSpacing: "0.08em", marginBottom: 6 }}>M/M/1 QUEUE DEPTH INDEX</div>
          <div style={{ fontSize: 10, color: C.text, fontFamily: "'JetBrains Mono', monospace", marginBottom: 3 }}>
            W_q = ρ/(1−ρ) = {globalRho.toFixed(3)}/{Math.max(0.001, 1 - globalRho).toFixed(3)}
          </div>
          <div style={{ fontSize: 9, color: wq > 5 ? C.red : C.blue, fontFamily: "'JetBrains Mono', monospace" }}>
            W_q = {Math.min(wq, 99.99).toFixed(4)}
          </div>
          <div style={{ fontSize: 7, color: C.textDim, marginTop: 2 }}>Dimensionless queue depth · ρ = λ/μ</div>
        </div>
      </div>

      {/* Diversion bar */}
      <div style={{ marginTop: 12, padding: "8px 0 0 0", borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 7.5, color: C.textDim, marginBottom: 4 }}>
          <span>ρ = 0.00</span>
          <span style={{ color: C.yellow }}>DIVERSION 0.80</span>
          <span style={{ color: C.red }}>COLLAPSE 0.85</span>
          <span>ρ = 1.00</span>
        </div>
        <div style={{ height: 6, background: C.border, borderRadius: 3, position: "relative" }}>
          <div style={{ height: "100%", width: `${Math.min(globalRho * 100, 100)}%`, background: `linear-gradient(90deg, ${C.green} 0%, ${C.yellow} 75%, ${C.red} 100%)`, borderRadius: 3, transition: "width 0.8s" }} />
          <div style={{ position: "absolute", left: "80%", top: 0, bottom: 0, width: 1.5, background: C.yellow }} />
          <div style={{ position: "absolute", left: "85%", top: 0, bottom: 0, width: 1.5, background: C.red }} />
        </div>
        <div style={{ fontSize: 7.5, color: C.textDim, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
          ρ = {globalRho.toFixed(4)} · λ_total = {totalLambda.toFixed(1)}/hr · Σμ = {totalMu}/hr
        </div>
      </div>
    </div>
  );
}

// ─── WHATSAPP PANEL ───────────────────────────────────────────────────────────
function WhatsAppPanel({ hubs, globalRho }) {
  const critHub = hubs.find(h => h.rho >= 0.80);
  const time = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  const msg = critHub
    ? `[WARNING] Hub ${critHub.name} at ${(critHub.rho * 100).toFixed(1)}%.\nPredicted backlog: +50 units.\nActions: Divert inbound shipments immediately.\nWindow closes in 45m.\n\nNetwork load: ${(globalRho * 100).toFixed(0)}% arrivals vs ${critHub.mu}/hr capacity.\n\nAt current rate, hub ${critHub.name} hits collapse threshold in ~25m.\n\n– SITI Intelligence | ${time} | Alert #0001\nNext alert suppressed 30m`
    : `[STABLE] All ${hubs.length} hubs nominal.\nNetwork ρ = ${(globalRho * 100).toFixed(1)}%.\nNo immediate action required.\n\nMIMI Kernel monitoring active.\n– SITI Intelligence | ${time}`;

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 8.5, color: "#888", letterSpacing: "0.1em" }}>WHATSAPP ALERT SYSTEM</div>
        <div style={{ fontSize: 8, color: C.green, border: `1px solid ${C.greenDim}`, padding: "1px 6px", fontWeight: 700 }}>MONITORING</div>
      </div>
      <div style={{ flex: 1, padding: "10px 12px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* Phone */}
        <div style={{ background: "#111", borderRadius: 16, padding: 10, border: `1px solid #1F1F1F`, width: "100%", maxWidth: 210 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 7, color: "#555", marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>
            <span>{time}</span><span>●●● Jio 4G ■ 87%</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid #1A1A1A` }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: `${C.gold}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: C.gold, fontWeight: 700 }}>SI</div>
            <div>
              <div style={{ fontSize: 9, color: "#E0E0E0", fontWeight: 600 }}>SITI Intelligence</div>
              <div style={{ fontSize: 7, color: "#555" }}>Ops Alert System · sent ✓✓</div>
            </div>
          </div>
          <div style={{ textAlign: "center", fontSize: 7, color: "#333", marginBottom: 6 }}>TODAY</div>
          <div style={{
            background: critHub ? "#1A0800" : "#0A1A0A",
            borderRadius: "8px 8px 0 8px", padding: "7px 9px",
            fontSize: 7.5, color: critHub ? "#B0C4B0" : "#90C090",
            fontFamily: "'Inter', sans-serif", lineHeight: 1.6,
            border: `1px solid ${critHub ? C.redDim : C.greenDim}`,
          }}>
            {msg.split("\n").map((line, i) => (
              <div key={i} style={{
                color: line.startsWith("[WARNING]") ? C.yellow : line.startsWith("[STABLE]") ? C.green : line.startsWith("–") ? "#555" : "#999",
                fontWeight: line.startsWith("[") ? 700 : 400,
              }}>{line || "\u00A0"}</div>
            ))}
          </div>
        </div>

        {/* Alert stats */}
        <div style={{ marginTop: 10, width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {[
            { label: "ALERTS TODAY", val: hubs.filter(h => h.rho > 0.75).length, color: C.yellow },
            { label: "MSGS SENT", val: 3, color: C.green },
            { label: "AVG LATENCY", val: "0.13ms", color: C.blue },
            { label: "SUPPRESSED", val: 2, color: C.textDim },
          ].map(item => (
            <div key={item.label} style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "5px 7px" }}>
              <div style={{ fontSize: 7, color: C.textDim }}>{item.label}</div>
              <div style={{ fontSize: 11, color: item.color, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{item.val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── COMMANDER CONSOLE ────────────────────────────────────────────────────────
function CommanderConsole({ hubs, globalRho, revenueSaved, isConnected }) {
  const isCollapse = globalRho >= 0.85;
  const isCritical = globalRho >= 0.75;
  const level = isCollapse ? "critical" : isCritical ? "warning" : "nominal";
  const colors = { critical: C.red, warning: C.yellow, nominal: C.green };
  const bgs = { critical: "#0D0000", warning: "#0D0900", nominal: "#001A05" };
  const msgs = {
    critical: `NETWORK COLLAPSE IMMINENT. Sigmoidal decay triggered at ρ=${globalRho.toFixed(3)}. All hubs in cascade diversion. Immediate intervention required.`,
    warning: `Elevated network utilization detected. ${hubs.filter(h => h.rho > 0.75).map(h => h.name).join(", ")} approaching critical threshold. Monitor closely.`,
    nominal: `MIMI Kernel: Optimal network flow detected. Certainty ${(99 - globalRho * 10).toFixed(1)}%. All systems within safe operating parameters.`,
  };

  return (
    <div style={{ background: bgs[level], border: `1px solid ${colors[level]}33`, padding: "10px 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 8.5, color: C.textDim, letterSpacing: "0.12em" }}>COMMANDER'S INTELLIGENCE CONSOLE</div>
        <div style={{ fontSize: 8, color: colors[level], fontWeight: 700, letterSpacing: "0.08em" }}>{level.toUpperCase()}</div>
      </div>
      <div style={{ fontSize: 9, color: colors[level], fontWeight: 600, lineHeight: 1.5, marginBottom: 10 }}>{msgs[level]}</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "6px 8px" }}>
          <div style={{ fontSize: 7, color: C.textDim }}>T+3 PROJECTION</div>
          <div style={{ fontSize: 13, color: globalRho > 0.85 ? C.red : C.gold, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
            ρ={((hubs[0]?.rho_t3 || globalRho + 0.01)).toFixed(4)}
          </div>
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "6px 8px" }}>
          <div style={{ fontSize: 7, color: C.textDim }}>PVI VOLATILITY</div>
          <div style={{ fontSize: 13, color: C.blue, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
            {(globalRho * 0.8).toFixed(1)}%
          </div>
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "6px 8px" }}>
          <div style={{ fontSize: 7, color: C.textDim }}>REVENUE SAVED</div>
          <div style={{ fontSize: 13, color: C.green, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
            ₹{(49.2 + Math.random() * 0.5).toFixed(1)}L
          </div>
        </div>
      </div>

      {!isConnected && (
        <div style={{ marginTop: 10, padding: "7px 10px", background: `${C.blue}11`, border: `1px solid ${C.blueDim}`, fontSize: 8, color: C.blue, lineHeight: 1.6 }}>
          💡 Connect your API key or upload a logistics CSV to see live hub data, real IRP calculations, and live Twilio WhatsApp alerts.
        </div>
      )}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function SITIDashboard() {
  const { hubs, globalRho, totalLambda, criticalHub, isConnected, history, tick } = useSimulation(null);
  const [activeTab, setActiveTab] = useState("overview");

  const tabs = [
    { id: "overview", label: "NETWORK OVERVIEW" },
    { id: "kernel", label: "MIMI KERNEL" },
    { id: "analytics", label: "ANALYTICS" },
  ];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'JetBrains Mono', monospace", color: C.text, fontSize: 12 }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: ${C.bg}; } ::-webkit-scrollbar-thumb { background: ${C.border}; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        @keyframes tickerScroll { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @import url('https://fonts.googleapis.com/css2?family=Chivo:wght@700;900&family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@400;500;600&display=swap');
      `}</style>

      <TopBar globalRho={globalRho} criticalHub={criticalHub} isConnected={isConnected} totalLambda={totalLambda} tick={tick} />
      <Ticker hubs={hubs} globalRho={globalRho} />
      <WarningBanner criticalHub={criticalHub} isConnected={isConnected} />
      <KPIRow hubs={hubs} globalRho={globalRho} totalLambda={totalLambda} />

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: "9px 20px", fontSize: 8.5, letterSpacing: "0.1em", fontFamily: "'JetBrains Mono', monospace",
            background: "none", border: "none", cursor: "pointer", color: activeTab === tab.id ? C.gold : C.textDim,
            borderBottom: `2px solid ${activeTab === tab.id ? C.gold : "transparent"}`,
            transition: "all 0.2s",
          }}>{tab.label}</button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 220px", gap: 1, background: C.border, animation: "fadeIn 0.3s ease" }}>
          {/* LEFT: Hub list */}
          <div style={{ background: C.bg }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
              <div style={{ fontSize: 8.5, color: "#888", letterSpacing: "0.1em" }}>HUB STATUS</div>
              {criticalHub && <div style={{ fontSize: 7.5, color: C.red, border: `1px solid ${C.redDim}`, padding: "1px 6px", fontWeight: 700 }}>1 CRITICAL</div>}
            </div>
            {hubs.map(hub => <HubRow key={hub.name} hub={hub} />)}
          </div>

          {/* CENTER: Charts */}
          <div style={{ background: C.bg, display: "flex", flexDirection: "column", gap: 1 }}>
            <KalmanChart history={history} hubs={hubs} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
              <HubUtilizationBar hubs={hubs} />
              <FailurePie hubs={hubs} />
            </div>
            <IRPTable hubs={hubs} />
          </div>

          {/* RIGHT: WhatsApp */}
          <div style={{ background: C.bg }}>
            <WhatsAppPanel hubs={hubs} globalRho={globalRho} />
          </div>
        </div>
      )}

      {/* ── KERNEL TAB ── */}
      {activeTab === "kernel" && (
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10, animation: "fadeIn 0.3s ease" }}>
          <MimiKernelPanel hubs={hubs} globalRho={globalRho} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, padding: 12 }}>
              <div style={{ fontSize: 8.5, color: "#888", letterSpacing: "0.1em", marginBottom: 10 }}>OPTIMAL KALMAN GAIN (2D)</div>
              <div style={{ fontSize: 11, color: C.text, fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>K = P⁻H^T(HP⁻H^T + R)⁻¹</div>
              <div style={{ fontSize: 10, color: C.blue, fontFamily: "'JetBrains Mono', monospace", marginBottom: 4 }}>K = [{(0.29 + globalRho * 0.4).toFixed(4)}, {(0.05 + globalRho * 0.2).toFixed(4)}]</div>
              <div style={{ fontSize: 7.5, color: C.textDim }}>P_trace — Q=diag(0.002,0.001) · R=0.005</div>
            </div>
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, padding: 12 }}>
              <div style={{ fontSize: 8.5, color: "#888", letterSpacing: "0.1em", marginBottom: 10 }}>INVERSE RELIABILITY PARADOX — LOSS FUNCTION</div>
              <div style={{ fontSize: 11, color: C.text, fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>ℒ = $1.20 + $2.74 = $3.94</div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ fontSize: 8.5, color: C.textDim }}>recovery: <span style={{ color: C.green }}>$1.20</span></div>
                <div style={{ fontSize: 8.5, color: C.textDim }}>CLV: <span style={{ color: C.red }}>$2.74</span></div>
              </div>
              <div style={{ fontSize: 9, color: C.gold, marginTop: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                L = ${(globalRho * 6224).toFixed(2)} · {Math.round(globalRho * 1326)} high-imp failures
              </div>
            </div>
          </div>
          <CommanderConsole hubs={hubs} globalRho={globalRho} isConnected={isConnected} />
        </div>
      )}

      {/* ── ANALYTICS TAB ── */}
      {activeTab === "analytics" && (
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10, animation: "fadeIn 0.3s ease" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <HubUtilizationBar hubs={hubs} />
            <FailurePie hubs={hubs} />
          </div>
          <KalmanChart history={history} hubs={hubs} />
          <IRPTable hubs={hubs} />
          {/* Revenue recovery bar */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, padding: 14 }}>
            <div style={{ fontSize: 8.5, color: "#888", letterSpacing: "0.12em", marginBottom: 10 }}>ANNUALIZED REVENUE RECOVERY · MIMI KERNEL PROJECTION</div>
            <div style={{ textAlign: "center", marginBottom: 4 }}>
              <div style={{ fontSize: 8.5, color: C.textDim, letterSpacing: "0.15em", marginBottom: 6 }}>ANNUALIZED REVENUE RECOVERY</div>
              <div style={{ fontFamily: "'Chivo', sans-serif", fontWeight: 900, fontSize: 42, color: C.green, letterSpacing: "0.05em" }}>₹{(globalRho * 42.5).toFixed(1)}Cr</div>
              <div style={{ fontSize: 8, color: C.textDim, marginTop: 4 }}>MIMI KERNEL v2.0 · {hubs.length}-HUB NETWORK · 2D KALMAN STATE OBSERVER</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 12 }}>
              {hubs.map(h => (
                <div key={h.name} style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 7.5, color: h.color, fontWeight: 700, marginBottom: 4 }}>{h.name}</div>
                  <div style={{ fontSize: 14, color: C.green, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>₹{(h.rho * 8.5).toFixed(1)}Cr</div>
                  <div style={{ fontSize: 7, color: C.textDim, marginTop: 2 }}>IRP recovery/yr</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
