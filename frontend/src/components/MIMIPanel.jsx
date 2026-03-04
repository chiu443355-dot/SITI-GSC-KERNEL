import React, { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

function Formula({ math, display = false, color = '#FFB340' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      try {
        katex.render(math, ref.current, { throwOnError: false, displayMode: display, output: 'html' });
      } catch {
        ref.current.textContent = math;
      }
    }
  }, [math, display]);
  return <span ref={ref} style={{ color, fontFamily: 'KaTeX_Main, serif' }} />;
}

export default function MIMIPanel({ kState, catastrophe }) {
  const rho = kState?.global_rho ?? kState?.rho ?? 0.68;
  const phi = kState?.phi ?? 0.05;
  const critRho = kState?.critical_rho ?? 0.85;
  const kDecay = kState?.k_decay ?? 20;
  const mu = kState?.mu ?? 150;
  const totalLambda = kState?.total_lambda ?? 0;
  const xhat = kState?.kalman?.x_hat ?? rho;
  const rhoDot = kState?.kalman?.rho_dot ?? 0;
  const K = kState?.kalman?.K ?? [0.29, 0.0];
  const wq = kState?.wq ?? (rho / (1 - rho));
  const collapse = kState?.collapse;

  const formulas = [
    {
      id: 'rho',
      title: 'NETWORK UTILIZATION (QUEUEING THEORY)',
      latex: `\\rho = \\dfrac{\\lambda}{\\mu} = \\dfrac{${totalLambda.toFixed(1)}}{${(mu * 3).toFixed(0)}}`,
      value: `ρ = ${rho.toFixed(4)}`,
      desc: `λ=${totalLambda.toFixed(1)}/hr across 3 hubs · μ=${mu}/hr per hub`,
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
      id: 'kalman-2d',
      title: '2D KALMAN STATE VECTOR',
      latex: `\\mathbf{x} = \\begin{bmatrix} \\rho \\\\ \\dot{\\rho} \\end{bmatrix}, \\quad F = \\begin{bmatrix} 1 & \\Delta t \\\\ 0 & 1 \\end{bmatrix}`,
      value: `x = [${xhat.toFixed(4)}, ${rhoDot >= 0 ? '+' : ''}${rhoDot.toFixed(6)}]`,
      desc: `Velocity model: T+3 = ρ + 3·Δt·ρ_dot`,
      color: '#64D2FF',
    },
    {
      id: 'wq',
      title: 'M/M/1 QUEUE DEPTH INDEX',
      latex: `W_q = \\dfrac{\\rho}{1-\\rho} = \\dfrac{${rho.toFixed(3)}}{${(1 - rho).toFixed(3)}}`,
      value: `W_q = ${wq.toFixed(4)}`,
      desc: `Dimensionless queue depth · ρ = λ/μ`,
      color: wq > 4 ? '#FF3B30' : '#64D2FF',
    },
    {
      id: 'leakage',
      title: 'INVERSE RELIABILITY PARADOX',
      latex: `\\mathcal{L} = \\underbrace{\\$1.20}_{\\text{recovery}} + \\underbrace{\\$2.74}_{\\text{CLV}} = \\$3.94`,
      value: `L = $${kState?.inverse_reliability?.leakage_total?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '0.00'}`,
      desc: `${kState?.inverse_reliability?.failure_count ?? '—'} high-imp failures`,
      color: '#FF9F0A',
    },
    {
      id: 'kalman-gain',
      title: 'OPTIMAL KALMAN GAIN (2D)',
      latex: `K = P^- H^T (H P^- H^T + R)^{-1}`,
      value: `K = [${Array.isArray(K) ? K.map(v => v.toFixed(4)).join(', ') : K.toFixed?.(4) ?? '—'}]`,
      desc: `P_trace=${kState?.kalman?.P?.toFixed?.(4) ?? '—'} · Q=diag(0.002,0.001) · R=0.005`,
      color: '#64D2FF',
    },
  ];

  return (
    <div data-testid="mimi-panel"
      style={{ background: '#0A0A0A', border: `1px solid ${catastrophe ? '#FF3B30' : '#1F1F1F'}`,
        transition: 'border-color 0.3s' }}>
      {/* Header */}
      <div style={{
        borderBottom: '1px solid #1F1F1F', padding: '8px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#070707',
      }}>
        <div>
          <div style={{ fontFamily: 'Chivo, sans-serif', fontWeight: 900, fontSize: 11, color: '#FFB340', letterSpacing: '0.15em' }}>
            MIMI KERNEL v2.0 — 2D KALMAN STATE OBSERVER
          </div>
          <div style={{ fontSize: 9, color: '#555', letterSpacing: '0.1em', marginTop: 2 }}>
            ρ = λ/μ · F = [[1,Δt],[0,1]] · 3-HUB NETWORK CASCADE ENGINE
          </div>
        </div>
        <div style={{
          background: collapse ? '#2A0000' : catastrophe ? '#1A0A00' : '#0F1A00',
          border: `1px solid ${collapse ? '#FF3B30' : catastrophe ? '#FF9F0A' : '#32D74B'}`,
          padding: '3px 10px', fontSize: 9,
          color: collapse ? '#FF3B30' : catastrophe ? '#FF9F0A' : '#32D74B',
          letterSpacing: '0.12em', fontWeight: 700,
        }}>
          {collapse ? 'COLLAPSE ρ ≥ 0.85' : catastrophe ? 'DIVERSION ρ > 0.80' : 'KERNEL ACTIVE'}
        </div>
      </div>

      {/* Formula Grid */}
      <div className="mimi-formula-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
        {formulas.map((f, i) => (
          <div key={f.id} data-testid={`formula-${f.id}`}
            style={{
              padding: '12px 14px',
              borderRight: i % 2 === 0 ? '1px solid #141414' : 'none',
              borderBottom: i < formulas.length - 2 ? '1px solid #141414' : 'none',
            }}>
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
            width: `${Math.min(rho * 100, 100)}%`,
            background: collapse ? '#FF3B30' : rho > 0.80 ? '#FF9F0A' : '#FFB340',
            transition: 'width 0.5s, background 0.3s',
          }} />
          <div style={{ position: 'absolute', left: '80%', top: 0, bottom: 0, width: 1, background: '#FF9F0A' }} />
          <div style={{ position: 'absolute', left: '85%', top: 0, bottom: 0, width: 1, background: '#FF3B30' }} />
        </div>
        <div style={{ fontSize: 9, color: '#555', marginTop: 4, textAlign: 'center', letterSpacing: '0.1em' }}>
          ρ = <span style={{ color: collapse ? '#FF3B30' : catastrophe ? '#FF9F0A' : '#FFB340', fontWeight: 700 }}>{rho.toFixed(4)}</span>
          {' '}· λ_total = <span style={{ color: '#64D2FF' }}>{totalLambda.toFixed(1)}/hr</span>
          {' '}· Σμ = <span style={{ color: '#32D74B' }}>{(mu * 3).toFixed(0)}/hr</span>
        </div>
      </div>
    </div>
  );
}
