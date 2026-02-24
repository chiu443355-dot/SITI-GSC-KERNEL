import React, { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

function Formula({ math, display = false, color = '#FFB340' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      try {
        katex.render(math, ref.current, {
          throwOnError: false,
          displayMode: display,
          output: 'html',
        });
      } catch {
        ref.current.textContent = math;
      }
    }
  }, [math, display]);
  return <span ref={ref} style={{ color, fontFamily: 'KaTeX_Main, serif' }} />;
}

export default function MIMIPanel({ kState, catastrophe }) {
  const rho = kState?.rho ?? 0.82;
  const phi = kState?.phi ?? 0.12;
  const critRho = kState?.critical_rho ?? 0.85;
  const xhat = kState?.kalman?.x_hat ?? rho;
  const K = kState?.kalman?.K ?? 0.29;

  const formulas = [
    {
      id: 'rho',
      title: 'HUB UTILIZATION STATE OBSERVER',
      latex: `\\rho = \\dfrac{N_{\\text{late}}}{N_{\\text{total}}}`,
      value: `ρ = ${rho.toFixed(4)}`,
      desc: `${kState?.inverse_reliability?.failure_count?.toLocaleString() ?? '—'} late of ${kState?.n_total?.toLocaleString() ?? '—'} total`,
      color: catastrophe ? '#FF3B30' : '#FFB340',
    },
    {
      id: 'phi',
      title: 'SIGMOIDAL DECAY — LOGIC HEALTH',
      latex: `\\Phi(\\rho) = \\dfrac{1}{1 + e^{15(\\rho - ${critRho.toFixed(2)})}}`,
      value: `Φ(ρ) = ${phi.toFixed(4)}`,
      desc: `Logic Health: ${phi > 0.5 ? 'STABLE' : phi > 0.2 ? 'DEGRADED' : 'CRITICAL'}`,
      color: phi > 0.5 ? '#32D74B' : phi > 0.2 ? '#FF9F0A' : '#FF3B30',
    },
    {
      id: 'leakage',
      title: 'INVERSE RELIABILITY PARADOX',
      latex: `\\mathcal{L} = \\sum_{i \\in \\mathcal{F}_H} \\$3.94`,
      value: `L = $${kState?.inverse_reliability?.leakage_total?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '0.00'}`,
      desc: `${kState?.inverse_reliability?.failure_count ?? '—'} HIGH-importance failures × $3.94`,
      color: '#FF9F0A',
    },
    {
      id: 'kalman',
      title: 'KALMAN FILTER STATE ESTIMATOR',
      latex: `\\hat{x}_{k+1} = \\hat{x}_k + K_k(z_k - \\hat{x}_k)`,
      value: `x̂ = ${xhat.toFixed(4)}`,
      desc: `Kalman gain K = ${K.toFixed(4)}`,
      color: '#64D2FF',
    },
    {
      id: 'kalman-gain',
      title: 'OPTIMAL KALMAN GAIN',
      latex: `K_k = \\dfrac{P_k^-}{P_k^- + R}`,
      value: `K = ${K.toFixed(4)}`,
      desc: `P⁻=${kState?.kalman?.P?.toExponential(2) ?? '—'} · Q=0.002 · R=0.005`,
      color: '#64D2FF',
    },
  ];

  return (
    <div
      data-testid="mimi-panel"
      style={{
        background: '#0A0A0A',
        border: `1px solid ${catastrophe ? '#FF3B30' : '#1F1F1F'}`,
        transition: 'border-color 0.3s',
      }}
    >
      {/* Header */}
      <div style={{
        borderBottom: '1px solid #1F1F1F',
        padding: '8px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#070707',
      }}>
        <div>
          <div style={{ fontFamily: 'Chivo, sans-serif', fontWeight: 900, fontSize: 11, color: '#FFB340', letterSpacing: '0.15em' }}>
            MIMI KERNEL — MATHEMATICAL STATE OBSERVER
          </div>
          <div style={{ fontSize: 9, color: '#555', letterSpacing: '0.1em', marginTop: 2 }}>
            MACHINE INTELLIGENCE · MATHEMATICAL INFERENCE ENGINE
          </div>
        </div>
        <div style={{
          background: catastrophe ? '#2A0000' : '#0F1A00',
          border: `1px solid ${catastrophe ? '#FF3B30' : '#32D74B'}`,
          padding: '3px 10px',
          fontSize: 9,
          color: catastrophe ? '#FF3B30' : '#32D74B',
          letterSpacing: '0.12em',
          fontWeight: 700,
        }}>
          {catastrophe ? 'CATASTROPHE ρ > 0.80' : 'KERNEL ACTIVE'}
        </div>
      </div>

      {/* Formula Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
        {formulas.map((f, i) => (
          <div
            key={f.id}
            data-testid={`formula-${f.id}`}
            style={{
              padding: '12px 14px',
              borderRight: i % 2 === 0 ? '1px solid #141414' : 'none',
              borderBottom: i < formulas.length - 2 ? '1px solid #141414' : 'none',
            }}
          >
            <div style={{ fontSize: 8, color: '#555', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
              {f.title}
            </div>
            <div style={{ marginBottom: 6 }}>
              <Formula math={f.latex} display color={f.color} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: f.color, letterSpacing: '0.05em', marginBottom: 2 }}>
              {f.value}
            </div>
            <div style={{ fontSize: 9, color: '#666', letterSpacing: '0.08em' }}>
              {f.desc}
            </div>
          </div>
        ))}
      </div>

      {/* Footer: ρ Gauge */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid #141414', background: '#070707' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 9, color: '#555', letterSpacing: '0.1em' }}>
          <span>ρ = 0.00</span>
          <span style={{ color: '#FF9F0A' }}>WARNING 0.75</span>
          <span style={{ color: '#FF3B30' }}>CRITICAL 0.80</span>
          <span>ρ = 1.00</span>
        </div>
        <div style={{ height: 6, background: '#161616', borderRadius: 1, overflow: 'hidden', position: 'relative' }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${rho * 100}%`,
            background: catastrophe ? '#FF3B30' : rho > 0.75 ? '#FF9F0A' : '#FFB340',
            transition: 'width 0.5s, background 0.3s',
          }} />
          {/* Warning marker at 0.75 */}
          <div style={{ position: 'absolute', left: '75%', top: 0, bottom: 0, width: 1, background: '#FF9F0A' }} />
          {/* Critical marker at 0.80 */}
          <div style={{ position: 'absolute', left: '80%', top: 0, bottom: 0, width: 1, background: '#FF3B30' }} />
        </div>
        <div style={{ fontSize: 9, color: '#555', marginTop: 4, textAlign: 'center', letterSpacing: '0.1em' }}>
          CURRENT ρ = <span style={{ color: catastrophe ? '#FF3B30' : '#FFB340', fontWeight: 700 }}>{rho.toFixed(4)}</span>
          {' '}· CRITICAL ρ_c = <span style={{ color: '#FF9F0A' }}>{critRho.toFixed(4)}</span>
        </div>
      </div>
    </div>
  );
}
