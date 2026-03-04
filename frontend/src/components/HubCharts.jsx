import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend, ReferenceLine,
} from "recharts";

/* ── Tooltip: white text on dark gray ───────────────────────── */
const DARK_TOOLTIP = {
  contentStyle: {
    background: "#1F2937",
    border: "1px solid #374151",
    color: "#FFFFFF",
    fontFamily: "JetBrains Mono",
    fontSize: 10,
    borderRadius: 2,
  },
  labelStyle: { color: "#FFFFFF", fontSize: 9 },
  itemStyle: { color: "#FFFFFF" },
  cursor: { fill: "#FFB34011" },
};

const IMPORTANCE_COLORS = { High: "#FF3B30", Medium: "#FF9F0A", Low: "#32D74B" };
const IMPORTANCE_COLOR_LIST = ["#FF3B30", "#FF9F0A", "#32D74B"];

/* ── Bar chart: value labels above bars ─────────────────────── */
const DelayBarLabel = ({ x, y, width, value }) => {
  if (!value) return null;
  return (
    <text x={x + width / 2} y={y - 5} fill="#FFFFFF" fontSize={9}
      fontFamily="JetBrains Mono" textAnchor="middle" fontWeight="600">
      {`${value}h`}
    </text>
  );
};

/* ── Pie chart: external labels with connector lines ────────── */
const RADIAN = Math.PI / 180;
const PieExternalLabel = ({ cx, cy, midAngle, outerRadius, value, name, percent }) => {
  if (!value) return null;
  const r     = outerRadius + 28;
  const x     = cx + r * Math.cos(-midAngle * RADIAN);
  const y     = cy + r * Math.sin(-midAngle * RADIAN);
  const lx1   = cx + (outerRadius + 6) * Math.cos(-midAngle * RADIAN);
  const ly1   = cy + (outerRadius + 6) * Math.sin(-midAngle * RADIAN);
  const lx2   = cx + (outerRadius + 20) * Math.cos(-midAngle * RADIAN);
  const ly2   = cy + (outerRadius + 20) * Math.sin(-midAngle * RADIAN);
  return (
    <g>
      <line x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke="#555" strokeWidth={1} />
      <text x={x} y={y - 4} fill="#FFFFFF" fontSize={8.5} fontFamily="JetBrains Mono"
        textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontWeight="600">
        {name}
      </text>
      <text x={x} y={y + 9} fill={IMPORTANCE_COLORS[name] ?? "#A1A1AA"} fontSize={8}
        fontFamily="JetBrains Mono" textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central">
        {value.toLocaleString()} ({(percent * 100).toFixed(0)}%)
      </text>
    </g>
  );
};

/* ── Kill Zone badge (HTML overlay) on bar chart ─────────────── */
const KillZoneBadge = () => (
  <div style={{
    position: "absolute", top: 44, right: 8, zIndex: 10,
    display: "flex", alignItems: "center", gap: 4,
    background: "#200000", border: "1px dashed #FF3B30",
    padding: "3px 8px", pointerEvents: "none",
  }}>
    <span style={{ display: "inline-block", width: 20, height: 1.5, background: "#FF3B30", marginRight: 4 }} />
    <span style={{ fontFamily: "JetBrains Mono", fontSize: 7.5, color: "#FF3B30", letterSpacing: "0.08em" }}>
      COLLAPSE THRESHOLD ρ=0.85
    </span>
  </div>
);

export default function HubCharts({ kState }) {
  const delayData      = (kState?.average_delay ?? []).map(d => ({ ...d }));
  const importanceData = (kState?.red_zone_importance ?? []).filter(d => d.value > 0);
  const totalRedZone   = importanceData.reduce((s, d) => s + d.value, 0);
  const rhoHistory     = (kState?.rho_history ?? []).map(h => ({
    time: h.time,
    rho_pct:  +(h.rho  * 100).toFixed(2),
    t1_pct:   +(h.t1   * 100).toFixed(2),
  }));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

      {/* ── BAR CHART: Average Delay ───────────────────────────── */}
      <div data-testid="avg-delay-chart"
        style={{ background: "#0A0A0A", border: "1px solid #1F1F1F", padding: "10px 12px", position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 9, color: "#D4D4D8", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              AVERAGE DELAY · PER WAREHOUSE BLOCK
            </div>
            <div style={{ fontSize: 8, color: "#888", marginTop: 2 }}>
              Proxy: Customer Care Calls × Mode Factor × 8h
            </div>
          </div>
          <div style={{ background: "#1A0A00", border: "1px solid #FF9F0A", padding: "2px 6px", fontSize: 8, color: "#FF9F0A", letterSpacing: "0.08em" }}>
            HRS
          </div>
        </div>

        {/* Kill-zone badge overlay */}
        <KillZoneBadge />

        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={delayData} barCategoryGap="35%" margin={{ top: 22, right: 8, left: -15, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#141414" />
            <XAxis dataKey="block" stroke="#2A2A2A"
              tick={{ fill: "#CCCCCC", fontSize: 9, fontFamily: "JetBrains Mono" }} />
            <YAxis stroke="#2A2A2A"
              tick={{ fill: "#CCCCCC", fontSize: 9, fontFamily: "JetBrains Mono" }}
              tickFormatter={v => `${v}h`} domain={[0, "auto"]} />
            <Tooltip {...DARK_TOOLTIP}
              formatter={(v, _, p) => [`${v}h avg delay (${p.payload.n_late?.toLocaleString()} late)`, "Avg Delay"]} />
            {/* Collapse threshold — bold dashed red line at y=0.85 */}
            <ReferenceLine y={0.85} stroke="#FF3B30" strokeWidth={2} strokeDasharray="6 3" />
            <Bar dataKey="avg_delay" radius={[2, 2, 0, 0]} isAnimationActive={false}
              label={<DelayBarLabel />}>
              {delayData.map((d, i) => {
                const isMax = d.avg_delay === Math.max(...delayData.map(x => x.avg_delay));
                return <Cell key={i} fill={isMax ? "#FF3B30" : "#FFB340"} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── PIE CHART: Red Zone Product Importance ─────────────── */}
      <div data-testid="red-zone-importance-chart"
        style={{ background: "#0A0A0A", border: "1px solid #1F1F1F", padding: "10px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 9, color: "#D4D4D8", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              RED ZONE FAILURES · PRODUCT IMPORTANCE
            </div>
            <div style={{ fontSize: 8, color: "#888", marginTop: 2 }}>
              Late shipments from blocks with ρ &gt; 0.80
            </div>
          </div>
          <div style={{ background: "#1A0000", border: "1px solid #FF3B30", padding: "2px 6px", fontSize: 8, color: "#FF3B30", letterSpacing: "0.08em" }}>
            {totalRedZone.toLocaleString()} UNITS
          </div>
        </div>

        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={importanceData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={90}
              innerRadius={38}
              paddingAngle={3}
              stroke="none"
              isAnimationActive={false}
              labelLine={false}
              label={<PieExternalLabel />}
            >
              {importanceData.map((d, i) => (
                <Cell key={i} fill={IMPORTANCE_COLORS[d.name] ?? IMPORTANCE_COLOR_LIST[i]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: "#1F2937", border: "1px solid #374151", color: "#FFFFFF", fontFamily: "JetBrains Mono", fontSize: 10 }}
              itemStyle={{ color: "#FFFFFF" }}
              formatter={(v, n) => [
                `${v.toLocaleString()} (${totalRedZone ? ((v / totalRedZone) * 100).toFixed(1) : 0}%)`, n,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* ── AREA CHART: ρ Real-Time Trajectory ────────────────── */}
      <div data-testid="rho-history-chart"
        style={{ background: "#0A0A0A", border: "1px solid #1F1F1F", padding: "10px 12px", gridColumn: "1 / -1" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: "#D4D4D8", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            ρ REAL-TIME TRAJECTORY · KALMAN T+1 PROJECTION
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: 9 }}>
            <span><span style={{ color: "#FFB340" }}>—</span> <span style={{ color: "#CCCCCC" }}>ρ observed</span></span>
            <span><span style={{ color: "#64D2FF" }}>—</span> <span style={{ color: "#CCCCCC" }}>T+1 predicted</span></span>
            <span><span style={{ color: "#FF3B30" }}>—</span> <span style={{ color: "#CCCCCC" }}>0.80 diversion</span></span>
            <span><span style={{ color: "#FF6B6B" }}>···</span> <span style={{ color: "#CCCCCC" }}>0.85 collapse</span></span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={rhoHistory} margin={{ top: 4, right: 8, left: -15, bottom: 0 }}>
            <defs>
              <linearGradient id="rhoGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#FFB340" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#FFB340" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="t1Grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#64D2FF" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#64D2FF" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="#141414" />
            <XAxis dataKey="time" stroke="#2A2A2A"
              tick={{ fill: "#888", fontSize: 8, fontFamily: "JetBrains Mono" }} />
            <YAxis stroke="#2A2A2A"
              tick={{ fill: "#888", fontSize: 8, fontFamily: "JetBrains Mono" }}
              tickFormatter={v => `${v}%`} domain={[60, 100]} />
            <Tooltip {...DARK_TOOLTIP} formatter={v => [`${v}%`]} />
            <ReferenceLine y={80} stroke="#FF3B3066" strokeDasharray="4 2"
              label={{ value: "0.80", fill: "#FF3B30", fontSize: 8 }} />
            <ReferenceLine y={85} stroke="#FF3B3044" strokeDasharray="2 3"
              label={{ value: "0.85", fill: "#FF6B6B", fontSize: 8 }} />
            <Area type="monotone" dataKey="rho_pct" stroke="#FFB340" strokeWidth={2}
              fill="url(#rhoGrad)" dot={false} name="ρ observed" />
            <Area type="monotone" dataKey="t1_pct" stroke="#64D2FF" strokeWidth={1} strokeDasharray="4 2"
              fill="url(#t1Grad)" dot={false} name="T+1 predicted" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}
