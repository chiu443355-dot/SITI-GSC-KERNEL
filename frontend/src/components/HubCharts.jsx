import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend
} from "recharts";

const DARK_TOOLTIP = {
  contentStyle: { background: '#0A0A0A', border: '1px solid #2A2A2A', color: '#FFB340', fontFamily: 'JetBrains Mono', fontSize: 10 },
  labelStyle: { color: '#A1A1AA', fontSize: 9 },
  cursor: { fill: '#FFB34011' },
};

const PIE_COLORS = ['#FFB340', '#64D2FF', '#32D74B'];

export default function HubCharts({ kState }) {
  const warehouseData = (kState?.warehouse_metrics ?? []).map(d => ({
    ...d,
    utilization_pct: +(d.utilization * 100).toFixed(1),
  }));

  const modeData = (kState?.mode_metrics ?? []).map(d => ({
    name: d.mode,
    value: d.total,
    late: d.late,
    rate: +(d.rate * 100).toFixed(1),
  }));

  const rhoHistory = (kState?.rho_history ?? []).map((h, i) => ({
    ...h,
    index: i,
    rho_pct: +(h.rho * 100).toFixed(2),
    t1_pct: +(h.t1 * 100).toFixed(2),
  }));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {/* Warehouse Utilization */}
      <div data-testid="warehouse-chart" style={{ background: '#0A0A0A', border: '1px solid #1F1F1F', padding: '10px 12px' }}>
        <div style={{ fontSize: 9, color: '#A1A1AA', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
          WAREHOUSE BLOCK UTILIZATION
        </div>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={warehouseData} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke="#141414" />
            <XAxis dataKey="block" stroke="#2A2A2A" tick={{ fill: '#A1A1AA', fontSize: 9, fontFamily: 'JetBrains Mono' }} />
            <YAxis stroke="#2A2A2A" tick={{ fill: '#A1A1AA', fontSize: 9, fontFamily: 'JetBrains Mono' }}
              tickFormatter={v => `${v}%`} domain={[0, 100]} />
            <Tooltip {...DARK_TOOLTIP} formatter={(v) => [`${v}%`, 'Utilization']} />
            <Bar dataKey="utilization_pct" fill="#FFB340" radius={[2, 2, 0, 0]}
              label={{ position: 'top', fill: '#FFB340', fontSize: 9, fontFamily: 'JetBrains Mono', formatter: v => `${v}%` }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Shipment Mode Distribution */}
      <div data-testid="mode-chart" style={{ background: '#0A0A0A', border: '1px solid #1F1F1F', padding: '10px 12px' }}>
        <div style={{ fontSize: 9, color: '#A1A1AA', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
          SHIPMENT MODE DISTRIBUTION
        </div>
        <ResponsiveContainer width="100%" height={150}>
          <PieChart>
            <Pie data={modeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55} innerRadius={25}
              stroke="none">
              {modeData.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip {...DARK_TOOLTIP} formatter={(v, n, p) => [`${v.toLocaleString()} (${p.payload.rate}% late)`, n]} />
            <Legend iconType="circle" iconSize={6}
              formatter={(v) => <span style={{ color: '#A1A1AA', fontSize: 9, fontFamily: 'JetBrains Mono' }}>{v}</span>} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* ρ History Area Chart */}
      <div data-testid="rho-history-chart" style={{ background: '#0A0A0A', border: '1px solid #1F1F1F', padding: '10px 12px', gridColumn: '1 / -1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: '#A1A1AA', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            ρ REAL-TIME TRAJECTORY
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 9, color: '#555' }}>
            <span><span style={{ color: '#FFB340' }}>— </span>ρ observed</span>
            <span><span style={{ color: '#64D2FF' }}>— </span>T+1 predicted</span>
            <span style={{ color: '#FF3B30' }}>— 0.80 critical</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={rhoHistory}>
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
            <XAxis dataKey="time" stroke="#2A2A2A" tick={{ fill: '#555', fontSize: 8, fontFamily: 'JetBrains Mono' }} />
            <YAxis stroke="#2A2A2A" tick={{ fill: '#555', fontSize: 8, fontFamily: 'JetBrains Mono' }}
              tickFormatter={v => `${v}%`} domain={[60, 100]} />
            <Tooltip {...DARK_TOOLTIP} formatter={v => [`${v}%`]} />
            <Area type="monotone" dataKey="rho_pct" stroke="#FFB340" strokeWidth={2}
              fill="url(#rhoGrad)" dot={false} name="ρ observed" />
            <Area type="monotone" dataKey="t1_pct" stroke="#64D2FF" strokeWidth={1} strokeDasharray="4 2"
              fill="url(#t1Grad)" dot={false} name="T+1 predicted" />
            {/* Critical line at 80% */}
            <CartesianGrid stroke="#FF3B3033" horizontal={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
