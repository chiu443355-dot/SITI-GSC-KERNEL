import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, ReferenceLine,
} from "recharts";

/* ── HIGH CONTRAST DARK TOOLTIP — white bg, black text ──── */
const HC_TOOLTIP = {
  contentStyle: {
    background: "#FFFFFF",
    border: "1px solid #CCCCCC",
    color: "#000000",
    fontFamily: "JetBrains Mono",
    fontSize: 10,
    borderRadius: 2,
  },
  labelStyle:  { color: "#000000", fontSize: 9, fontWeight: 700 },
  itemStyle:   { color: "#111111" },
  cursor:      { fill: "#00000011" },
};

const IMPORTANCE_COLORS = { High: "#FF3B30", Medium: "#FF9F0A", Low: "#32D74B" };

/* ── Value labels above each bar ────────────────────────── */
const DelayBarLabel = ({ x, y, width, value }) => {
  if (!value) return null;
  return (
    <text x={x + width / 2} y={y - 7} fill="#FFFFFF" fontSize={10}
      fontFamily="JetBrains Mono" textAnchor="middle" fontWeight="700">
      {`${value}h`}
    </text>
  );
};

/* ── External pie labels with connector lines ───────────── */
const RADIAN = Math.PI / 180;
const PieExternalLabel = ({ cx, cy, midAngle, outerRadius, value, name, percent }) => {
  if (!value) return null;
  const r   = outerRadius + 32;
  const x   = cx + r * Math.cos(-midAngle * RADIAN);
  const y   = cy + r * Math.sin(-midAngle * RADIAN);
  const lx1 = cx + (outerRadius + 6)  * Math.cos(-midAngle * RADIAN);
  const ly1 = cy + (outerRadius + 6)  * Math.sin(-midAngle * RADIAN);
  const lx2 = cx + (outerRadius + 24) * Math.cos(-midAngle * RADIAN);
  const ly2 = cy + (outerRadius + 24) * Math.sin(-midAngle * RADIAN);
  return (
    <g>
      <line x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke="#666" strokeWidth={1} />
      <text x={x} y={y - 5} fill="#FFFFFF" fontSize={9} fontFamily="JetBrains Mono"
        textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontWeight="700">
        {name}
      </text>
      <text x={x} y={y + 11} fill={IMPORTANCE_COLORS[name] ?? "#CCCCCC"} fontSize={8.5}
        fontFamily="JetBrains Mono" textAnchor={x > cx ? "start" : "end"} dominantBaseline="central">
        {value.toLocaleString()} · {(percent * 100).toFixed(0)}%
      </text>
    </g>
  );
};

/* ── Kill Zone Badge overlay ────────────────────────────── */
const KillZoneBadge = () => (
  <div style={{
    position: "absolute", top: 46, right: 10, zIndex: 10,
    display: "flex", alignItems: "center", gap: 5,
    background: "#1A0000", border: "1.5px dashed #FF3B30",
    padding: "3px 10px", pointerEvents: "none",
  }}>
    <span style={{
      display: "inline-block", width: 18, height: 2,
      background: "#FF3B30", marginRight: 4,
    }} />
    <span style={{
      fontFamily: "JetBrains Mono", fontSize: 8, color: "#FF3B30",
      letterSpacing: "0.08em", fontWeight: 700,
    }}>
      COLLAPSE THRESHOLD  ρ = 0.85
    </span>
  </div>
);

export default function HubCharts({ kState }) {
  const delayData      = (kState?.average_delay ?? []).map(d => ({ ...d }));
  const importanceData = (kState?.red_zone_importance ?? []).filter(d => d.value > 0);
  const totalRedZone   = importanceData.reduce((s, d) => s + d.value, 0);

  const rhoHistory = (kState?.rho_history ?? []).map(h => ({
    time:    h.time,
    rho_pct: +(h.rho  * 100).toFixed(2),
    t1_pct:  +(h.t1   * 100).toFixed(2),
    gap:     +(Math.abs(h.rho - h.t1) * 100).toFixed(2),
  }));

  /* T+1 line thickness scales with average gap → "Rising Uncertainty" */
  const avgGap = rhoHistory.length > 1
    ? rhoHistory.reduce((s, h) => s + h.gap, 0) / rhoHistory.length
    : 1;
  const t1StrokeWidth = +(Math.min(5.5, Math.max(1.5, 1.5 + avgGap * 0.35))).toFixed(1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* ── BAR + PIE side-by-side ─────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

        {/* BAR CHART */}
        <div data-testid="avg-delay-chart"
          style={{ background: "#0A0A0A", border: "1px solid #1F1F1F", padding: "12px 14px", position: "relative" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 9, color: "#D4D4D8", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                AVG DELAY · PER WAREHOUSE BLOCK
              </div>
              <div style={{ fontSize: 8, color: "#888", marginTop: 2 }}>
                Customer Care Calls × Mode Factor × 8h
              </div>
            </div>
            <div style={{ background: "#1A0A00", border: "1px solid #FF9F0A", padding: "2px 8px", fontSize: 8, color: "#FF9F0A" }}>
              HRS
            </div>
          </div>
          <KillZoneBadge />
          <ResponsiveContainer width="100%" height={450}>
            <BarChart data={delayData} barCategoryGap="32%"
              margin={{ top: 24, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#141414" />
              <XAxis dataKey="block" stroke="#2A2A2A"
                tick={{ fill: "#CCCCCC", fontSize: 10, fontFamily: "JetBrains Mono" }} />
              <YAxis stroke="#2A2A2A"
                tick={{ fill: "#CCCCCC", fontSize: 10, fontFamily: "JetBrains Mono" }}
                tickFormatter={v => `${v}h`} domain={[0, "auto"]} />
              <Tooltip {...HC_TOOLTIP}
                formatter={(v, _, p) => [`${v}h avg (${p.payload.n_late?.toLocaleString()} late)`, "Avg Delay"]} />
              <ReferenceLine y={0.85} stroke="#FF3B30" strokeWidth={2} strokeDasharray="6 3" />
              <Bar dataKey="avg_delay" radius={[3, 3, 0, 0]} isAnimationActive={false}
                label={<DelayBarLabel />}>
                {delayData.map((d, i) => {
                  const isMax = d.avg_delay === Math.max(...delayData.map(x => x.avg_delay));
                  return <Cell key={i} fill={isMax ? "#FF3B30" : "#FFB340"} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* PIE CHART */}
        <div data-testid="red-zone-importance-chart"
          style={{ background: "#0A0A0A", border: "1px solid #1F1F1F", padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 9, color: "#D4D4D8", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                RED ZONE FAILURES · PRODUCT IMPORTANCE
              </div>
              <div style={{ fontSize: 8, color: "#888", marginTop: 2 }}>
                Late shipments from blocks with ρ &gt; 0.80
              </div>
            </div>
            <div style={{ background: "#1A0000", border: "1px solid #FF3B30", padding: "2px 8px", fontSize: 8, color: "#FF3B30" }}>
              {totalRedZone.toLocaleString()} UNITS
            </div>
          </div>
          <ResponsiveContainer width="100%" height={450}>
            <PieChart>
              <Pie data={importanceData} dataKey="value" nameKey="name"
                cx="50%" cy="50%" outerRadius={145} innerRadius={55}
                paddingAngle={4} stroke="none"
                isAnimationActive={false} labelLine={false} label={<PieExternalLabel />}>
                {importanceData.map((d, i) => (
                  <Cell key={i} fill={IMPORTANCE_COLORS[d.name] ?? "#888"} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "#FFFFFF", border: "1px solid #CCC", color: "#000000", fontFamily: "JetBrains Mono", fontSize: 10 }}
                itemStyle={{ color: "#111111" }}
                formatter={(v, n) => [`${v.toLocaleString()} (${totalRedZone ? ((v / totalRedZone) * 100).toFixed(1) : 0}%)`, n]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── AREA CHART — ρ Trajectory + Kalman Projection ──── */}
      <div data-testid="rho-history-chart"
        style={{ background: "#0A0A0A", border: "1px solid #1F1F1F", padding: "12px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: "#D4D4D8", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            ρ REAL-TIME TRAJECTORY · KALMAN STATE PROJECTION
          </div>
          <div style={{ display: "flex", gap: 18, fontSize: 9 }}>
            <span>
              <span style={{ color: "#FFB340", fontWeight: 700 }}>━</span>{" "}
              <span style={{ color: "#CCCCCC" }}>ρ OBSERVED</span>
            </span>
            <span>
              <span style={{ color: "#39FF14", fontWeight: 700 }}>╌</span>{" "}
              <span style={{ color: "#CCCCCC" }}>
                KALMAN PROJECTION (w={t1StrokeWidth}px · Δ={avgGap.toFixed(2)}%)
              </span>
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={450}>
          <AreaChart data={rhoHistory} margin={{ top: 16, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="rhoGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#FFB340" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#FFB340" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="t1Grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#39FF14" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#39FF14" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="#141414" />
            <XAxis dataKey="time" stroke="#2A2A2A"
              tick={{ fill: "#CCCCCC", fontSize: 9, fontFamily: "JetBrains Mono" }} />
            <YAxis stroke="#2A2A2A"
              tick={{ fill: "#CCCCCC", fontSize: 9, fontFamily: "JetBrains Mono" }}
              tickFormatter={v => `${v}%`} domain={[60, 100]} />
            <Tooltip {...HC_TOOLTIP} formatter={v => [`${v}%`]} />
            <ReferenceLine y={80} stroke="#FF3B3066" strokeDasharray="4 2"
              label={{ value: "0.80 DIVERSION", fill: "#FF9F0A", fontSize: 8 }} />
            <ReferenceLine y={85} stroke="#FF3B3044" strokeDasharray="2 3"
              label={{ value: "0.85 COLLAPSE", fill: "#FF6B6B", fontSize: 8 }} />
            {/* Observed ρ — Amber solid */}
            <Area type="monotone" dataKey="rho_pct"
              stroke="#FFB340" strokeWidth={2.5} fill="url(#rhoGrad)"
              dot={false} name="ρ OBSERVED" isAnimationActive={false} />
            {/* Kalman Projection — Neon Green dashed, variable width */}
            <Area type="monotone" dataKey="t1_pct"
              stroke="#39FF14" strokeWidth={t1StrokeWidth}
              strokeDasharray="10 5"
              fill="url(#t1Grad)"
              dot={false} name="KALMAN PROJECTION" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}
