import React from "react";
import axios from "axios";
import ExecutiveHUD from "./ExecutiveHUD";
import MIMIPanel from "./MIMIPanel";
import HubCharts from "./HubCharts";
import FailureTable from "./FailureTable";
import DataInjection from "./DataInjection";

export default function Dashboard({ kState, ticker, loading, apiBase, onRefresh }) {
  const catastrophe = kState?.catastrophe;   // ρ > 0.80
  const collapse = kState?.collapse;          // ρ ≥ 0.85

  if (loading && !kState) {
    return (
      <div style={{ background: '#050505', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#FFB340', fontFamily: 'JetBrains Mono', fontSize: 14, letterSpacing: '0.2em' }}>
            INITIALIZING MIMI KERNEL...
          </div>
          <div style={{ color: '#A1A1AA', fontFamily: 'JetBrains Mono', fontSize: 11, marginTop: 8, letterSpacing: '0.1em' }}>
            SAFEXPRESS CASE #02028317 · LOADING DATASET
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="main-dashboard"
      className={catastrophe ? 'catastrophe-mode' : ''}
      style={{
        background: collapse ? '#140000' : catastrophe ? '#0D0000' : '#050505',
        minHeight: '100vh',
        transition: 'background 0.5s ease',
        fontFamily: 'JetBrains Mono, monospace',
      }}
    >
      {/* Executive HUD */}
      <ExecutiveHUD kState={kState} ticker={ticker} catastrophe={catastrophe} />

      {/* Collapse Banner — ρ ≥ 0.85 */}
      {collapse && (
        <div
          data-testid="collapse-banner"
          className="pulse-border-red"
          style={{ background: '#200000', border: '2px solid #FF3B30', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12, margin: '0 16px 4px' }}
        >
          <span className="status-dot red" />
          <span
            className="blink-critical"
            style={{ color: '#FF3B30', fontFamily: 'Chivo, sans-serif', fontWeight: 900, fontSize: 15, letterSpacing: '0.2em' }}
          >
            UTILIZATION COLLAPSE: SIGMOIDAL DECAY TRIGGERED
          </span>
          <span style={{ color: '#FF8888', fontSize: 10, marginLeft: 'auto' }}>Φ={kState?.phi?.toFixed(4)} &gt; 0.50 TIPPING POINT</span>
        </div>
      )}

      {/* Diversion Banner — ρ > 0.80, below 0.85 */}
      {catastrophe && !collapse && (
        <div
          data-testid="catastrophe-banner"
          className="pulse-border-red"
          style={{ background: '#1A0000', border: '1px solid #FF9F0A', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 12, margin: '0 16px' }}
        >
          <span className="status-dot amber" />
          <span
            className="blink-critical"
            style={{ color: '#FF9F0A', fontFamily: 'Chivo, sans-serif', fontWeight: 900, fontSize: 13, letterSpacing: '0.15em' }}
          >
            PREEMPTIVE DIVERSION PROTOCOL INITIATED
          </span>
          <span style={{ color: '#AA7700', fontSize: 10, marginLeft: 'auto' }}>
            ρ={kState?.rho?.toFixed(4)} · T+1={kState?.kalman?.rho_t1?.toFixed(4)} · E[ρ(T+1)]&gt;0.80
          </span>
        </div>
      )}

      {/* Main Grid */}
      <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: '280px 1fr 280px', gap: 12 }}>

        {/* LEFT: KPI Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <KPICard label="HUB UTILIZATION ρ" value={kState?.rho?.toFixed(4)} unit=""
            color={collapse ? '#FF3B30' : catastrophe ? '#FF9F0A' : '#FFB340'}
            testId="kpi-rho" />
          <KPICard label="INSTABILITY INDEX Φ(ρ)" value={kState?.phi?.toFixed(4)} unit={`k=${kState?.k_decay ?? 20} · ρ_c=${kState?.critical_rho?.toFixed(2) ?? '0.85'}`}
            color={kState?.phi > 0.5 ? '#FF3B30' : kState?.phi > 0.3 ? '#FF9F0A' : '#32D74B'}
            testId="kpi-phi" />
          <KPICard label="QUEUE WAIT  W_q" value={kState?.wq?.toFixed(3)} unit="norm. units"
            color={kState?.wq > 4 ? '#FF3B30' : '#64D2FF'} testId="kpi-wq" />
          <KPICard label="HIGH IMP. FAILURE RATE" value={`${((kState?.inverse_reliability?.failure_rate ?? 0) * 100).toFixed(1)}%`} unit={`${kState?.inverse_reliability?.failure_count ?? 0} of ${kState?.inverse_reliability?.total_high ?? 0}`}
            color="#FF3B30" testId="kpi-failure-rate" />
          <KPICard label="LEAKAGE  $1.20 + $2.74" value={`$${kState?.inverse_reliability?.leakage_total?.toLocaleString('en-US', { minimumFractionDigits: 0 }) ?? '0'}`} unit="total priority leakage"
            color="#FF9F0A" testId="kpi-leakage" />
          <KPICard label="ANNUALIZED EXPOSURE" value="$2.81M" unit="AUDIT BASELINE"
            color="#FF3B30" testId="kpi-exposure" />
          <KPICard label="KALMAN T+1 · 45-MIN" value={kState?.kalman?.rho_t1?.toFixed(4)} unit=""
            color={kState?.collapse_predicted ? '#FF3B30' : kState?.catastrophe_predicted ? '#FF9F0A' : '#32D74B'}
            testId="kpi-kalman-t1" />
        </div>

        {/* CENTER: MIMI Panel + Charts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <MIMIPanel kState={kState} catastrophe={catastrophe} />
          <HubCharts kState={kState} />
        </div>

        {/* RIGHT: Failure Table + Recovery + Kalman */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <RecoveryWidget ticker={ticker} kState={kState} />
          <KalmanWidget kState={kState} />
          <FailureTable kState={kState} />
        </div>
      </div>

      {/* Bottom: Data Injection */}
      <DataInjection apiBase={apiBase} onRefresh={onRefresh} kState={kState} ticker={ticker} />
    </div>
  );
}

function KPICard({ label, value, unit, color, testId }) {
  return (
    <div
      data-testid={testId}
      className="ng-card"
      style={{
        background: '#0A0A0A',
        border: '1px solid #1F1F1F',
        padding: '10px 12px',
      }}
    >
      <div style={{ color: '#A1A1AA', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ color: color, fontSize: 22, fontWeight: 700, fontFamily: 'JetBrains Mono', lineHeight: 1 }}>
        {value ?? '—'}
      </div>
      {unit && <div style={{ color: '#555', fontSize: 9, marginTop: 2, letterSpacing: '0.1em' }}>{unit}</div>}
    </div>
  );
}

function RecoveryWidget({ ticker, kState }) {
  return (
    <div
      data-testid="recovery-counter"
      style={{ background: '#0A0A0A', border: '1px solid #1F1F1F', padding: '12px' }}
    >
      <div style={{ color: '#A1A1AA', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
        REVENUE SAVED · RECOVERY COUNTER
      </div>
      <div
        className="glow-amber"
        style={{ color: '#32D74B', fontSize: 28, fontWeight: 700, fontFamily: 'JetBrains Mono', lineHeight: 1 }}
      >
        ${ticker?.revenue_saved?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'}
      </div>
      <div style={{ color: '#A1A1AA', fontSize: 10, marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
        <span>{ticker?.total_diverted?.toLocaleString() ?? 0} units diverted</span>
        <span style={{ color: '#32D74B' }}>× ${kState?.leakage_seed ?? 3.94}/unit</span>
      </div>
      <div style={{ marginTop: 8, height: 2, background: '#1F1F1F' }}>
        <div style={{ height: '100%', background: '#32D74B', width: `${Math.min(100, (ticker?.refresh_count ?? 0) * 3.33)}%`, transition: 'width 0.4s' }} />
      </div>
      <div style={{ color: '#555', fontSize: 9, marginTop: 4, letterSpacing: '0.1em' }}>
        REFRESH #{ticker?.refresh_count ?? 0} · 4s INTERVAL
      </div>
    </div>
  );
}

function KalmanWidget({ kState }) {
  const k = kState?.kalman;
  const isCritical = kState?.catastrophe_predicted;
  return (
    <div
      data-testid="kalman-widget"
      style={{ background: '#0A0A0A', border: `1px solid ${isCritical ? '#FF3B30' : '#1F1F1F'}`, padding: '12px' }}
    >
      <div style={{ color: '#A1A1AA', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
        KALMAN STATE ESTIMATOR // T+1
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {[
          { label: 'x̂_k', value: k?.x_hat?.toFixed(4), color: '#64D2FF' },
          { label: 'T+1', value: k?.rho_t1?.toFixed(4), color: isCritical ? '#FF3B30' : '#32D74B' },
          { label: 'K', value: k?.K?.toFixed(4), color: '#FFB340' },
          { label: 'P', value: k?.P?.toExponential(2), color: '#A1A1AA' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#111', padding: '6px 8px', border: '1px solid #161616' }}>
            <div style={{ color: '#555', fontSize: 9, letterSpacing: '0.1em' }}>{label}</div>
            <div style={{ color, fontSize: 13, fontWeight: 700 }}>{value ?? '—'}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, color: '#555', fontSize: 9, letterSpacing: '0.08em' }}>
        Q=0.002 · R=0.005 · F=I · H=I
      </div>
    </div>
  );
}
