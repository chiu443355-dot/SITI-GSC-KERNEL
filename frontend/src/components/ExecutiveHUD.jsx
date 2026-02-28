import React from "react";
import Marquee from "react-fast-marquee";

// ── SITI Sigmoid Symbol ──────────────────────────────────────────────────────
function SITILogo({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg"
      title="SITI — We control the curve">
      {/* The Sigmoid S — stable to chaotic transition */}
      <path
        d="M 24 7 C 30 7, 30 15, 17 17 C 4 19, 4 27, 10 27"
        stroke="#FFB340"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Stable state endpoint (top) */}
      <circle cx="24" cy="7" r="2.4" fill="#FFB340" />
      {/* Chaotic state endpoint (bottom) */}
      <circle cx="10" cy="27" r="2.4" fill="#FFB340" opacity="0.7" />
      {/* Inflection point marker */}
      <circle cx="17" cy="17" r="1.2" fill="#FFB34055" />
    </svg>
  );
}

function PerformanceFeeCalculator({ totalDiverted, leakageSeed }) {
  const fee = (totalDiverted * leakageSeed) * 0.10;
  return (
    <div style={{ textAlign: 'right', borderLeft: '1px solid #1A1A1A', paddingLeft: 20 }}>
      <div style={{ fontSize: 8, color: '#64D2FF', letterSpacing: '0.12em', fontWeight: 700 }}>
        REAL-TIME EQUITY RECOVERY (10% OPTIMIZATION FEE)
      </div>
      <div style={{ fontSize: 16, color: '#32D74B', fontWeight: 900, fontFamily: 'JetBrains Mono', letterSpacing: '0.05em' }}>
        ${fee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  );
}

export default function ExecutiveHUD({ kState, ticker, catastrophe }) {
  const rho = kState?.rho ?? 0;
  const status = rho > 0.85 ? 'COLLAPSE' : rho > 0.80 ? 'CRITICAL' : rho > 0.75 ? 'WARNING' : 'NOMINAL';
  const statusColor = rho > 0.85 ? '#FF3B30' : rho > 0.80 ? '#FF9F0A' : rho > 0.75 ? '#FFB340' : '#32D74B';

  const tickerItems = [
    { label: 'ρ', value: kState?.rho?.toFixed(4) ?? '---', color: catastrophe ? '#FF3B30' : '#FFB340' },
    { label: 'Φ(ρ)', value: kState?.phi?.toFixed(4) ?? '---', color: '#64D2FF' },
    { label: 'T+1', value: kState?.kalman?.rho_t1?.toFixed(4) ?? '---', color: '#32D74B' },
    { label: 'T+3', value: kState?.kalman?.rho_t3?.toFixed(4) ?? '---', color: kState?.catastrophe_predicted ? '#FF3B30' : '#32D74B' },
    { label: 'W_q', value: kState?.wq?.toFixed(3) ?? '---', color: '#64D2FF' },
    { label: 'FAILURES', value: kState?.inverse_reliability?.failure_count?.toLocaleString() ?? '---', color: '#FF9F0A' },
    { label: 'LEAKAGE', value: `$${kState?.inverse_reliability?.leakage_total?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '0.00'}`, color: '#FF3B30' },
    { label: 'SAVED', value: `$${ticker?.revenue_saved?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '0.00'}`, color: '#32D74B' },
    { label: 'DIVERTED', value: `${ticker?.total_diverted?.toLocaleString() ?? 0} UNITS`, color: '#FFB340' },
    { label: 'RECORDS', value: kState?.n_total?.toLocaleString() ?? '---', color: '#A1A1AA' },
    { label: 'EXPOSURE', value: '$2.81M', color: '#FF3B30' },
    { label: 'DATASET', value: kState?.dataset_name ?? 'LOADING', color: '#A1A1AA' },
    { label: 'ρ_CRITICAL', value: kState?.critical_rho?.toFixed(4) ?? '0.8500', color: '#FF9F0A' },
  ];

  return (
    <div
      data-testid="executive-hud"
      style={{
        background: '#000000',
        borderBottom: `2px solid ${catastrophe ? '#FF3B30' : '#2A2A2A'}`,
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        transition: 'border-color 0.15s',
      }}
    >
      {/* Top Row: Logo + Status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #1A1A1A' }}>

        {/* SITI Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SITILogo size={36} />
            <div>
              <div style={{ fontFamily: 'Chivo, sans-serif', fontWeight: 900, fontSize: 16, color: '#FFB340', letterSpacing: '0.15em' }}>
                SITI INTELLIGENCE
              </div>
              <div style={{ fontSize: 9, color: '#666', letterSpacing: '0.12em', fontWeight: 700, marginTop: 1 }}>
                LOGIC FOR THE PARADOX // PROPRIETARY KERNEL V2.0
              </div>
            </div>
          </div>

          <div style={{ width: 1, height: 32, background: '#333', margin: '0 10px' }} />

          <div style={{ fontSize: 10, letterSpacing: '0.1em', fontWeight: 700, fontFamily: 'JetBrains Mono' }}>
            <span style={{ color: '#444' }}>CASE </span>
            <span style={{ color: '#64D2FF' }}>#02028317</span>
          </div>

          <div style={{ width: 1, height: 32, background: '#333', margin: '0 6px' }} />

          <div style={{ fontSize: 9, color: '#555', letterSpacing: '0.1em', fontWeight: 500 }}>
            AUDIT_MODE: STABLE_HORIZON
          </div>
        </div>

        {/* Status + Metrics */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: '#555', letterSpacing: '0.1em' }}>ANNUALIZED EXPOSURE</div>
            <div style={{ fontSize: 16, color: '#FF3B30', fontWeight: 700, letterSpacing: '0.05em' }}>$2,810,000</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: '#555', letterSpacing: '0.1em' }}>HUB STATUS</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className={`status-dot ${rho > 0.80 ? 'red' : rho > 0.75 ? 'amber' : 'green'}`} />
              <span style={{ fontSize: 12, fontWeight: 700, color: statusColor, letterSpacing: '0.1em' }}>{status}</span>
            </div>
          </div>

          <PerformanceFeeCalculator totalDiverted={ticker?.total_diverted ?? 0} leakageSeed={kState?.leakage_seed ?? 3.94} />

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: '#555', letterSpacing: '0.1em' }}>REFRESH</div>
            <div style={{ fontSize: 12, color: '#A1A1AA' }}>#{ticker?.refresh_count ?? 0}</div>
          </div>
        </div>
      </div>

      {/* Ticker Bar */}
      <div style={{ background: '#060606', borderTop: '1px solid #111', padding: '5px 0' }}>
        <Marquee speed={45} gradient={false} pauseOnHover>
          <div style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
            {tickerItems.map((item, i) => (
              <React.Fragment key={i}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 20px' }}>
                  <span style={{ color: '#555', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    {item.label}
                  </span>
                  <span style={{ color: item.color, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em' }}>
                    {item.value}
                  </span>
                </div>
                <span style={{ color: '#2A2A2A', fontSize: 11 }}>|</span>
              </React.Fragment>
            ))}
          </div>
        </Marquee>
      </div>
    </div>
  );
}
