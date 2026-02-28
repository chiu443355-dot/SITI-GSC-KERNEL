import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend, ReferenceLine
} from "recharts";

const DARK_TOOLTIP = {
  contentStyle: { background: '#0A0A0A', border: '1px solid #2A2A2A', color: '#FFB340', fontFamily: 'JetBrains Mono', fontSize: 10 },
  labelStyle: { color: '#A1A1AA', fontSize: 9 },
  cursor: { fill: '#FFB34011' },
};

// Importance colors: High=danger, Medium=warning, Low=success
const IMPORTANCE_COLORS = { High: '#FF3B30', Medium: '#FF9F0A', Low: '#32D74B' };
const IMPORTANCE_COLOR_LIST = ['#FF3B30', '#FF9F0A', '#32D74B'];

// Custom label for bar chart
const DelayBarLabel = ({ x, y, width, value }) => {
  if (!value) return null;
  return (
    <text x={x + width / 2} y={y - 4} fill="#FFB340" fontSize={9}
      fontFamily="JetBrains Mono" textAnchor="middle">
      {`${value}h`}
    </text>
  );
};

// Custom label for pie slices
const PieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, value, name }) => {
  if (!value) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#ffffff" fontSize={9} fontFamily="JetBrains Mono" textAnchor="middle" dominantBaseline="central">
      {value.toLocaleString()}
    </text>
  );
};

export default function HubCharts({ kState }) {
  // ── Bar Chart: Average Delay per Warehouse Block ──────────────
  const delayData = (kState?.average_delay ?? []).map(d => ({
    block: d.block,
    avg_delay: d.avg_delay,
    n_late: d.n_late,
    n_total: d.n_total,
  }));

  // ── Pie Chart: Red Zone Product Importance Distribution ────────
  const importanceData = (kState?.red_zone_importance ?? []).filter(d => d.value > 0);
  const totalRedZone = importanceData.reduce((s, d) => s + d.value, 0);

  // ── ρ History Area Chart ───────────────────────────────────────
  const rhoHistory = (kState?.rho_history ?? []).map((h) => ({
    time: h.time,
    rho_pct: +(h.rho * 100).toFixed(2),
    t1_pct: +(h.t1 * 100).toFixed(2),
    t3_pct: +(h.t3 * 100).toFixed(2),
  }));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

      {/* ── BAR CHART: Average Delay per Warehouse Block ───────── */}
      <div data-testid="avg-delay-chart" style={{ background: '#0A0A0A', border: '1px solid #1F1F1F', padding: '10px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 9, color: '#A1A1AA', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              AVERAGE DELAY · PER WAREHOUSE BLOCK
            </div>
            <div style={{ fontSize: 8, color: '#555', marginTop: 2 }}>
              Proxy: Customer Care Calls × Mode Factor × 8h
            </div>
          </div>
          <div style={{ background: '#1A0A00', border: '1px solid #FF9F0A', padding: '2px 6px', fontSize: 8, color: '#FF9F0A', letterSpacing: '0.08em' }}>
            HRS
          </div>
        </div>
        <ResponsiveContainer width="100%" height={155}>
          <BarChart data={delayData} barCategoryGap="35%" margin={{ top: 18, right: 8, left: -15, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#141414" />
            <XAxis dataKey="block" stroke="#2A2A2A"
              tick={{ fill: '#A1A1AA', fontSize: 9, fontFamily: 'JetBrains Mono' }} />
            <YAxis stroke="#2A2A2A"
              tick={{ fill: '#A1A1AA', fontSize: 9, fontFamily: 'JetBrains Mono' }}
              tickFormatter={v => `${v}h`} domain={[0, 'auto']} />
            <Tooltip {...DARK_TOOLTIP}
              formatter={(v, _, p) => [`${v}h avg delay (${p.payload.n_late?.toLocaleString()} late)`, 'Avg Delay']} />
            <Bar dataKey="avg_delay" radius={[2, 2, 0, 0]}
              label={<DelayBarLabel />}>
              {delayData.map((d, i) => {
                const isMax = d.avg_delay === Math.max(...delayData.map(x => x.avg_delay));
                return <Cell key={i} fill={isMax ? '#FF3B30' : '#FFB340'} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── PIE CHART: Red Zone Product Importance ─────────────── */}
      <div data-testid="red-zone-importance-chart" style={{ background: '#0A0A0A', border: '1px solid #1F1F1F', padding: '10px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 9, color: '#A1A1AA', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              RED ZONE FAILURES · PRODUCT IMPORTANCE
            </div>
            <div style={{ fontSize: 8, color: '#555', marginTop: 2 }}>
              Late shipments from blocks with ρ &gt; 0.80
            </div>
          </div>
          <div style={{ background: '#1A0000', border: '1px solid #FF3B30', padding: '2px 6px', fontSize: 8, color: '#FF3B30', letterSpacing: '0.08em' }}>
            {totalRedZone.toLocaleString()} UNITS
          </div>
        </div>
        <ResponsiveContainer width="100%" height={155}>
          <PieChart>
            <Pie
              data={importanceData}
              dataKey="value"
              nameKey="name"
              cx="45%"
              cy="50%"
              outerRadius={58}
              innerRadius={26}
              stroke="none"
              labelLine={false}
              label={<PieLabel />}
              isAnimationActive={false}
            >
              {importanceData.map((d, i) => (
                <Cell key={i} fill={IMPORTANCE_COLORS[d.name] ?? IMPORTANCE_COLOR_LIST[i]} />
              ))}
            </Pie>
            <Tooltip
              {...DARK_TOOLTIP}
              formatter={(v, n) => [`${v.toLocaleString()} (${totalRedZone ? ((v / totalRedZone) * 100).toFixed(1) : 0}%)`, n]}
            />
            <Legend
              layout="vertical" align="right" verticalAlign="middle" iconType="circle" iconSize={7}
              wrapperStyle={{ color: '#FFFFFF', fontFamily: 'JetBrains Mono', fontSize: 9 }}
              formatter={(v) => (
                <span style={{ color: IMPORTANCE_COLORS[v] ?? '#FFFFFF', fontSize: 9, fontFamily: 'JetBrains Mono' }}>
                  {v}
                </span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* ── AREA CHART: ρ Real-Time Trajectory ────────────────── */}
      <div data-testid="rho-history-chart"
        style={{ background: '#0A0A0A', border: '1px solid #1F1F1F', padding: '10px 12px', gridColumn: '1 / -1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: '#A1A1AA', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            ρ REAL-TIME TRAJECTORY · KALMAN T+3 PROJECTION
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 9 }}>
            <span><span style={{ color: '#FFB340' }}>—</span> <span style={{ color: '#666' }}>ρ observed</span></span>
            <span><span style={{ color: '#64D2FF' }}>—</span> <span style={{ color: '#666' }}>T+3 predicted</span></span>
            <span><span style={{ color: '#FF3B30' }}>—</span> <span style={{ color: '#666' }}>0.80 diversion</span></span>
            <span><span style={{ color: '#FF6B6B' }}>···</span> <span style={{ color: '#666' }}>0.85 collapse</span></span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={118}>
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
              <linearGradient id="t3Grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#64D2FF" stopOpacity={0.1} />
                <stop offset="95%" stopColor="#64D2FF" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="#141414" />
            <XAxis dataKey="time" stroke="#2A2A2A"
              tick={{ fill: '#555', fontSize: 8, fontFamily: 'JetBrains Mono' }} />
            <YAxis stroke="#2A2A2A" tick={{ fill: '#555', fontSize: 8, fontFamily: 'JetBrains Mono' }}
              tickFormatter={v => `${v}%`} domain={[60, 100]} />
            <Tooltip {...DARK_TOOLTIP} formatter={v => [`${v}%`]} />
            <ReferenceLine y={80} stroke="#FF3B3066" strokeDasharray="4 2" label={{ value: '0.80', fill: '#FF3B30', fontSize: 8 }} />
            <ReferenceLine y={85} stroke="#FF3B3044" strokeDasharray="2 3" label={{ value: '0.85', fill: '#FF6B6B', fontSize: 8 }} />
            <Area type="monotone" dataKey="rho_pct" stroke="#FFB340" strokeWidth={2}
              fill="url(#rhoGrad)" dot={false} name="ρ observed" />
            <Area type="monotone" dataKey="t3_pct" stroke="#64D2FF" strokeWidth={1} strokeDasharray="4 2"
              fill="url(#t3Grad)" dot={false} name="T+3 predicted" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}
