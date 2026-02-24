import React from "react";
import Marquee from "react-fast-marquee";

export default function ExecutiveHUD({ kState, ticker, catastrophe }) {
  const rho = kState?.rho ?? 0;
  const status = rho > 0.80 ? 'CRITICAL' : rho > 0.75 ? 'WARNING' : 'NOMINAL';
  const statusColor = rho > 0.80 ? '#FF3B30' : rho > 0.75 ? '#FF9F0A' : '#32D74B';

  const tickerItems = [
    { label: 'ρ', value: kState?.rho?.toFixed(4) ?? '---', color: catastrophe ? '#FF3B30' : '#FFB340' },
    { label: 'Φ(ρ)', value: kState?.phi?.toFixed(4) ?? '---', color: '#64D2FF' },
    { label: 'T+1', value: kState?.kalman?.rho_t1?.toFixed(4) ?? '---', color: kState?.catastrophe_predicted ? '#FF3B30' : '#32D74B' },
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
        background: '#080808',
        borderBottom: `1px solid ${catastrophe ? '#FF3B30' : '#1F1F1F'}`,
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        transition: 'border-color 0.3s',
      }}
    >
      {/* Top Row: Logo + Status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '1px solid #141414' }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, background: '#FFB340', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Chivo', fontWeight: 900, fontSize: 12, color: '#000'
            }}>NG</div>
            <div>
              <div style={{ fontFamily: 'Chivo, sans-serif', fontWeight: 900, fontSize: 14, color: '#FFB340', letterSpacing: '0.15em' }}>
                NODEGUARD GSC
              </div>
              <div style={{ fontSize: 9, color: '#555', letterSpacing: '0.12em' }}>
                PREDICTIVE LOGISTICS RECOVERY · MIMI KERNEL v2.0
              </div>
            </div>
          </div>
          <div style={{ width: 1, height: 28, background: '#1F1F1F', margin: '0 8px' }} />
          <div style={{ fontSize: 9, color: '#555', letterSpacing: '0.1em' }}>
            CASE <span style={{ color: '#64D2FF' }}>#02028317</span>
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
