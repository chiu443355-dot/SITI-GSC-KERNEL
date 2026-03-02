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
          {/* Mini SITI sigmoid in loading screen */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <svg width="40" height="40" viewBox="0 0 34 34" fill="none">
              <path d="M 24 7 C 30 7, 30 15, 17 17 C 4 19, 4 27, 10 27" stroke="#FFB340" strokeWidth="2.2" strokeLinecap="round" fill="none" />
              <circle cx="24" cy="7" r="2.4" fill="#FFB340" />
              <circle cx="10" cy="27" r="2.4" fill="#FFB340" opacity="0.7" />
              <circle cx="17" cy="17" r="1.2" fill="#FFB34055" />
            </svg>
          </div>
          <div style={{ color: '#FFB340', fontFamily: 'Chivo, sans-serif', fontWeight: 900, fontSize: 16, letterSpacing: '0.2em' }}>
            SITI INTELLIGENCE HUD
          </div>
          <div style={{ color: '#555', fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.18em', marginTop: 4 }}>
            LOGIC FOR THE PARADOX // PROPRIETARY KERNEL V2.0
          </div>
          <div style={{ color: '#A1A1AA', fontFamily: 'JetBrains Mono', fontSize: 11, marginTop: 16, letterSpacing: '0.12em' }}>
            INITIALIZING MIMI KERNEL...
          </div>
          <div style={{ color: '#3A3A3A', fontFamily: 'JetBrains Mono', fontSize: 9, marginTop: 6, letterSpacing: '0.1em' }}>
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
          <KPICard label="ANNUALIZED EXPOSURE" value={`$${((kState?.annualized_exposure ?? 2810000) / 1000000).toFixed(2)}M`} unit="AUDIT BASELINE"
            color="#FF3B30" testId="kpi-exposure" />
          <KPICard label="KALMAN T+3 · 135-MIN" value={kState?.kalman?.rho_t3?.toFixed(4)} unit=""
            color={kState?.collapse_predicted ? '#FF3B30' : kState?.catastrophe_predicted ? '#FF9F0A' : '#32D74B'}
            testId="kpi-kalman-t3" />
        </div>

        {/* CENTER: MIMI Panel + Charts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <MIMIPanel kState={kState} catastrophe={catastrophe} />
          <HubCharts kState={kState} />
        </div>

        {/* RIGHT: Recovery + Kalman + Routing + Failure Table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <RecoveryWidget ticker={ticker} kState={kState} />
          <KalmanWidget kState={kState} />
          <RoutingWidget kState={kState} />
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
  const isCollapse = kState?.collapse_predicted;
  return (
    <div
      data-testid="kalman-widget"
      style={{ background: '#0A0A0A', border: `1px solid ${isCollapse ? '#FF3B30' : isCritical ? '#FF9F0A' : '#1F1F1F'}`, padding: '12px' }}
    >
      <div style={{ color: '#A1A1AA', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
        KALMAN STATE ESTIMATOR // 135-MIN T+3
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {[
          { label: 'x̂_k', value: k?.x_hat?.toFixed(4), color: '#64D2FF' },
          { label: 'T+3', value: k?.rho_t3?.toFixed(4), color: isCollapse ? '#FF3B30' : isCritical ? '#FF9F0A' : '#32D74B' },
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
        Q=f(Φ') · R=0.005 · F=[[1,1],[0,1]] · T+3≡135min
      </div>
    </div>
  );
}

function RoutingWidget({ kState }) {
  const routing = kState?.routing;
  const overloaded = routing?.overloaded_blocks ?? [];
  const available = routing?.available_blocks ?? [];
  const active = routing?.diversion_active;

  return (
    <div
      data-testid="routing-widget"
      style={{ background: '#0A0A0A', border: `1px solid ${active ? '#FF9F0A' : '#1F1F1F'}`, padding: '10px 12px' }}
    >
      <div style={{ fontSize: 9, color: '#A1A1AA', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
        <span>SITI ROUTING LOGIC</span>
        <span style={{ color: active ? '#FF9F0A' : '#555', fontSize: 9 }}>
          {active ? 'DIVERT ACTIVE' : 'STANDBY'}
        </span>
      </div>
      <div style={{ fontSize: 8, color: '#555', marginBottom: 8, lineHeight: 1.7, letterSpacing: '0.07em' }}>
        If ρ_HubA &gt; 0.85 ∧ ρ_HubB &lt; ρ_c − ε → Divert(Vp)
        <br />ε = {routing?.epsilon ?? '0.05'} · ρ_threshold = {routing?.threshold ?? '—'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div style={{ background: '#110500', border: '1px solid #3A1400', padding: '6px 8px' }}>
          <div style={{ fontSize: 8, color: '#FF3B30', letterSpacing: '0.1em', marginBottom: 4 }}>OVERLOADED &gt;0.85</div>
          {overloaded.length > 0
            ? overloaded.map(w => (
              <div key={w.block} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#FF9F0A' }}>
                <span>HUB {w.block}</span>
                <span>{(w.utilization * 100).toFixed(1)}%</span>
              </div>
            ))
            : <div style={{ color: '#555', fontSize: 9 }}>NONE</div>
          }
        </div>
        <div style={{ background: '#001500', border: '1px solid #003A00', padding: '6px 8px' }}>
          <div style={{ fontSize: 8, color: '#32D74B', letterSpacing: '0.1em', marginBottom: 4 }}>AVAILABLE &lt;ρ_c-ε</div>
          {available.length > 0
            ? available.map(w => (
              <div key={w.block} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#32D74B' }}>
                <span>HUB {w.block}</span>
                <span>{(w.utilization * 100).toFixed(1)}%</span>
              </div>
            ))
            : <div style={{ color: '#555', fontSize: 9 }}>NONE</div>
          }
        </div>
      </div>
    </div>
  );
}
