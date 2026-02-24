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
  const phi = kState?.phi ?? 0.35;
  const critRho = kState?.critical_rho ?? 0.85;
  const kDecay = kState?.k_decay ?? 20;
  const xhat = kState?.kalman?.x_hat ?? rho;
  const K = kState?.kalman?.K ?? 0.29;
  const wq = kState?.wq ?? (rho / (1 - rho));
  const collapse = kState?.collapse;

  const formulas = [
    {
      id: 'rho',
      title: 'HUB UTILIZATION STATE OBSERVER',
      latex: `\\rho = \\dfrac{N_{\\text{late}}}{N_{\\text{total}}}`,
      value: `ρ = ${rho.toFixed(4)}`,
      desc: `${kState?.inverse_reliability?.failure_count?.toLocaleString() ?? '—'} late of ${kState?.n_total?.toLocaleString() ?? '—'} total`,
      color: collapse ? '#FF3B30' : (catastrophe ? '#FF9F0A' : '#FFB340'),
    },
    {
      id: 'phi',
      title: 'SIGMOIDAL PRIORITY DECAY  Φ(ρ)',
      latex: `\\Phi(\\rho) = \\dfrac{1}{1 + e^{-${kDecay}(\\rho - ${critRho.toFixed(2)})}}`,
      value: `Φ(ρ) = ${phi.toFixed(4)}`,
      desc: `Instability: ${phi > 0.5 ? 'CASCADING FAILURE' : phi > 0.3 ? 'WARNING ZONE' : 'STABLE'}`,
      color: phi > 0.5 ? '#FF3B30' : phi > 0.3 ? '#FF9F0A' : '#32D74B',
    },
    {
      id: 'leakage',
      title: 'INVERSE RELIABILITY PARADOX',
      latex: `\\mathcal{L} = \\underbrace{\\$1.20}_{\\text{recovery}} + \\underbrace{\\$2.74}_{\\text{CLV}} = \\$3.94`,
      value: `L = $${kState?.inverse_reliability?.leakage_total?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '0.00'}`,
      desc: `${kState?.inverse_reliability?.failure_count ?? '—'} high-importance failures · ${((kState?.inverse_reliability?.failure_rate ?? 0) * 100).toFixed(1)}% failure rate`,
      color: '#FF9F0A',
    },
    {
      id: 'wq',
      title: 'M/M/1 QUEUE WAIT TIME',
      latex: `W_q = \\dfrac{\\rho}{\\mu(1-\\rho)} = \\dfrac{${rho.toFixed(3)}}{${(1 - rho).toFixed(3)}}`,
      value: `W_q = ${wq.toFixed(4)}`,
      desc: `Mean wait per shipment · μ=1 normalized`,
      color: wq > 4 ? '#FF3B30' : '#64D2FF',
    },
    {
      id: 'kalman',
      title: 'KALMAN FILTER STATE ESTIMATOR',
      latex: `\\hat{x}_{k+1} = \\hat{x}_k + K_k(z_k - \\hat{x}_k)`,
      value: `x̂ = ${xhat.toFixed(4)}`,
      desc: `Kalman gain K = ${K.toFixed(4)} · 45-min projection`,
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
          background: collapse ? '#2A0000' : catastrophe ? '#1A0A00' : '#0F1A00',
          border: `1px solid ${collapse ? '#FF3B30' : catastrophe ? '#FF9F0A' : '#32D74B'}`,
          padding: '3px 10px',
          fontSize: 9,
          color: collapse ? '#FF3B30' : catastrophe ? '#FF9F0A' : '#32D74B',
          letterSpacing: '0.12em',
          fontWeight: 700,
        }}>
          {collapse ? 'COLLAPSE ρ ≥ 0.85' : catastrophe ? 'DIVERSION ρ > 0.80' : 'KERNEL ACTIVE'}
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
          <span style={{ color: '#FF9F0A' }}>DIVERSION 0.80</span>
          <span style={{ color: '#FF3B30' }}>COLLAPSE 0.85</span>
          <span>ρ = 1.00</span>
        </div>
        <div style={{ height: 6, background: '#161616', borderRadius: 1, overflow: 'hidden', position: 'relative' }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${rho * 100}%`,
            background: collapse ? '#FF3B30' : rho > 0.80 ? '#FF9F0A' : '#FFB340',
            transition: 'width 0.5s, background 0.3s',
          }} />
          <div style={{ position: 'absolute', left: '80%', top: 0, bottom: 0, width: 1, background: '#FF9F0A' }} />
          <div style={{ position: 'absolute', left: '85%', top: 0, bottom: 0, width: 1, background: '#FF3B30' }} />
        </div>
        <div style={{ fontSize: 9, color: '#555', marginTop: 4, textAlign: 'center', letterSpacing: '0.1em' }}>
          ρ = <span style={{ color: collapse ? '#FF3B30' : catastrophe ? '#FF9F0A' : '#FFB340', fontWeight: 700 }}>{rho.toFixed(4)}</span>
          {' '}· ρ_c = <span style={{ color: '#FF9F0A' }}>{critRho.toFixed(4)}</span>
          {' '}· Φ(ρ_c) = <span style={{ color: '#64D2FF' }}>0.5000</span>
          {' '}· ε=0.05
        </div>
      </div>
    </div>
  );
}
