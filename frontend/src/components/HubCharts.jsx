import React, { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  LineChart, Line, ReferenceLine,
  CartesianGrid,
} from "recharts";

const COLORS_WARM  = ["#FF3B30", "#FF9F0A", "#FFD60A", "#32D74B", "#64D2FF"];
const PIE_COLORS   = ["#FF3B30", "#FFB340", "#64D2FF"];
const HUB_COLORS   = { Alpha: "#FF3B30", Beta: "#64D2FF", Gamma: "#32D74B" };

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#111", border: "1px solid #2A2A2A", padding: "8px 12px", fontSize: 10, lineHeight: 1.8 }}>
      <div style={{ color: "#FFB340", fontWeight: 700 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color ?? "#CCCCCC" }}>
          {p.name}: <span style={{ fontWeight: 700 }}>{typeof p.value === "number" ? p.value.toFixed(4) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function HubCharts({ kState }) {
  const delay = kState?.average_delay ?? [];
  const rzImportance = kState?.red_zone_importance ?? [];
  const hubs = kState?.hubs ?? [];
  const rhoHistory = kState?.rho_history ?? [];
  const critRho = kState?.critical_rho ?? 0.85;

  // Hub comparison data
  const hubCompare = useMemo(() => hubs.map(h => ({
    name: h.name,
    rho: h.rho,
    rho_t1: h.kalman?.rho_t1 ?? 0,
    rho_t3: h.kalman?.rho_t3 ?? 0,
    lambda: h.effective_lambda,
    mu: h.mu,
  })), [hubs]);

  // Merge hub histories for trajectory chart
  const trajectoryData = useMemo(() => {
    if (!hubs.length) return [];
    const maxLen = Math.max(...hubs.map(h => h.rho_history?.length ?? 0));
    return Array.from({ length: maxLen }, (_, i) => {
      const point = { time: "" };
      hubs.forEach(h => {
        const entry = h.rho_history?.[i];
        if (entry) {
          point.time = entry.time;
          point[`${h.name}_rho`] = entry.rho;
          point[`${h.name}_t3`]  = entry.t3;
        }
      });
      return point;
    });
  }, [hubs]);

  return (
    <div data-testid="hub-charts" style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* ── HUB ρ COMPARISON ─────────────────────── */}
      <div style={{ background: "#0A0A0A", border: "1px solid #1F1F1F", padding: "14px" }}>
        <div style={{ fontSize: 9, color: "#D4D4D8", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
          HUB UTILIZATION COMPARISON · ρ = λ/μ
        </div>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hubCompare} barGap={4}>
              <CartesianGrid vertical={false} stroke="#161616" />
              <XAxis dataKey="name" tick={{ fill: "#888", fontSize: 10 }} axisLine={false} />
              <YAxis domain={[0, 1.0]} tick={{ fill: "#888", fontSize: 9 }} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={0.85} stroke="#FF3B30" strokeDasharray="4 4" label={{ value: "ρ_c=0.85", fill: "#FF3B30", fontSize: 8, position: "right" }} />
              <Bar dataKey="rho" name="ρ (current)" fill="#FFB340" radius={[2, 2, 0, 0]} />
              <Bar dataKey="rho_t1" name="T+1 (45m)" fill="#64D2FF" radius={[2, 2, 0, 0]} />
              <Bar dataKey="rho_t3" name="T+3 (135m)" fill="#FF9F0A" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── NETWORK ρ TRAJECTORY ──────────────────── */}
      <div style={{ background: "#0A0A0A", border: "1px solid #1F1F1F", padding: "14px" }}>
        <div style={{ fontSize: 9, color: "#D4D4D8", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
          NETWORK ρ TRAJECTORY · PER-HUB · T+3 FORECAST
        </div>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trajectoryData}>
              <CartesianGrid vertical={false} stroke="#161616" />
              <XAxis dataKey="time" tick={{ fill: "#555", fontSize: 8 }} axisLine={false} interval="preserveStartEnd" />
              <YAxis domain={[0, 1.0]} tick={{ fill: "#888", fontSize: 9 }} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={0.85} stroke="#FF3B30" strokeDasharray="4 4" />
              <ReferenceLine y={0.80} stroke="#FF9F0A" strokeDasharray="4 4" />
              {Object.keys(HUB_COLORS).map(name => [
                <Line key={`${name}_rho`} type="monotone" dataKey={`${name}_rho`} name={`${name} ρ`}
                  stroke={HUB_COLORS[name]} strokeWidth={2} dot={false} />,
                <Line key={`${name}_t3`} type="monotone" dataKey={`${name}_t3`} name={`${name} T+3`}
                  stroke={HUB_COLORS[name]} strokeWidth={1} strokeDasharray="4 2" dot={false} opacity={0.5} />,
              ]).flat()}
              <Legend wrapperStyle={{ fontSize: 9, color: "#888" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── DELAY BY BLOCK + IMPORTANCE ──────────── */}
      <div className="api-docs-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Delay */}
        <div style={{ background: "#0A0A0A", border: "1px solid #1F1F1F", padding: "14px" }}>
          <div style={{ fontSize: 9, color: "#D4D4D8", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
            AVG DELAY BY WAREHOUSE BLOCK
          </div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={delay}>
                <CartesianGrid vertical={false} stroke="#161616" />
                <XAxis dataKey="block" tick={{ fill: "#888", fontSize: 10 }} axisLine={false} />
                <YAxis tick={{ fill: "#888", fontSize: 9 }} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="avg_delay" name="Avg Delay (hrs)" radius={[3, 3, 0, 0]}>
                  {delay.map((_, i) => <Cell key={i} fill={COLORS_WARM[i % COLORS_WARM.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Importance */}
        <div style={{ background: "#0A0A0A", border: "1px solid #1F1F1F", padding: "14px" }}>
          <div style={{ fontSize: 9, color: "#D4D4D8", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
            RED-ZONE FAILURE BY IMPORTANCE
          </div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={rzImportance} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={70} innerRadius={30}>
                  {rzImportance.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 9, color: "#888" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
