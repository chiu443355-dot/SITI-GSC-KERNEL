import React, { useMemo } from "react";
import ExecutiveHUD from "./ExecutiveHUD";
import MIMIPanel from "./MIMIPanel";
import HubCharts from "./HubCharts";
import HubCard from "./HubCard";
import FailureTable from "./FailureTable";
import DataInjection from "./DataInjection";
import ApiDocsPanel from "./ApiDocsPanel";

/* ── Calibration Overlay ────────────────────────────────────── */
const KERNEL_LINES = Array.from({ length: 90 }, (_, i) => {
  const w1 = (Math.sin(i * 1.234 + 0.5) * 0.9).toFixed(7);
  const w2 = (Math.cos(i * 0.876 - 0.3) * 0.7).toFixed(7);
  const b  = (Math.sin(i * 2.345 + 1.1) * 0.1).toFixed(7);
  return `LR[${i % 10}][${(i * 3) % 7}] = ${w1}  |  BIAS: ${b}  |  ∇L = ${w2}`;
});
const KERNEL_LOOP = [...KERNEL_LINES, ...KERNEL_LINES];

function CalibrationOverlay() {
  return (
    <div data-testid="calibration-overlay"
      style={{ position: "fixed", inset: 0, background: "#000000",
        zIndex: 9999, display: "flex", alignItems: "center",
        justifyContent: "center", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.13, overflow: "hidden" }}>
        <div className="scroll-kernel-weights" style={{
          fontFamily: "JetBrains Mono", fontSize: 11, color: "#FFB340",
          lineHeight: 2.1, whiteSpace: "nowrap", padding: "0 32px" }}>
          {KERNEL_LOOP.map((line, i) => <div key={i}>{line}</div>)}
        </div>
      </div>
      <div style={{ textAlign: "center", zIndex: 1, padding: "0 32px" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
          <svg width="52" height="52" viewBox="0 0 34 34" fill="none">
            <path d="M 24 7 C 30 7, 30 15, 17 17 C 4 19, 4 27, 10 27" stroke="#FFB340" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <circle cx="24" cy="7" r="2.8" fill="#FFB340" />
            <circle cx="10" cy="27" r="2.8" fill="#FFB340" opacity="0.7" />
          </svg>
        </div>
        <div className="calibrate-pulse-text" style={{
          color: "#FFB340", fontFamily: "Chivo, sans-serif", fontWeight: 900,
          fontSize: 22, letterSpacing: "0.28em", textTransform: "uppercase", marginBottom: 10 }}>
          MIMI INTELLIGENCE
        </div>
        <div style={{ color: "#FFB340", fontFamily: "JetBrains Mono", fontSize: 13,
          letterSpacing: "0.16em", marginBottom: 8, opacity: 0.9 }}>
          RE-CALIBRATING STATE OBSERVER...
        </div>
        <div style={{ width: 320, height: 2, background: "#1A1A1A", margin: "0 auto 14px", borderRadius: 1 }}>
          <div className="calibrate-progress-bar" style={{ height: "100%", background: "#FFB340", width: "0%", borderRadius: 1 }} />
        </div>
      </div>
    </div>
  );
}

/* ── Commander's Console ───────────────────────────────────── */
function CommanderConsole({ kState }) {
  const msg       = kState?.commander_message ?? "";
  const level     = kState?.commander_level ?? "stable";
  const rho_t3    = kState?.rho_t3 ?? 0;
  const pvi       = kState?.pvi ?? 0;
  const pviAlert  = kState?.pvi_alert ?? false;
  const cascade   = kState?.cascade_events ?? [];

  const colorMap = { critical: "#FF3B30", efficiency: "#64D2FF", stable: "#32D74B" };
  const bgMap    = { critical: "#1A0000", efficiency: "#00101A", stable: "#001A05" };
  const labelMap = { critical: "CRITICAL", efficiency: "UNDER-UTILIZED", stable: "NOMINAL" };
  const statusColor = colorMap[level] ?? "#32D74B";
  const bgColor = bgMap[level] ?? "#001A05";

  return (
    <div data-testid="commander-console"
      style={{ background: "#0A0A0A", border: `1px solid ${statusColor}55`, padding: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 9, color: "#D4D4D8", letterSpacing: "0.14em", textTransform: "uppercase" }}>
          COMMANDER'S MESSAGE CONSOLE
        </div>
        <div style={{ fontSize: 8, color: statusColor, fontWeight: 700, letterSpacing: "0.1em" }}>
          {labelMap[level] ?? "ACTIVE"}
        </div>
      </div>

      {pviAlert && (
        <div data-testid="pvi-alert" className="blink-critical"
          style={{ fontSize: 8, color: "#FF3B30", letterSpacing: "0.1em", marginBottom: 6,
            padding: "3px 8px", background: "#200000", border: "1px solid #FF3B3066" }}>
          PVI = {pvi.toFixed(1)}% — VOLATILITY &gt; 15% THRESHOLD
        </div>
      )}

      <div style={{ background: bgColor, border: `1px solid ${statusColor}33`, padding: "9px 10px", marginBottom: 8 }}>
        {msg.split("\n").map((line, i) => (
          <div key={i} style={{
            fontSize: 9.5, color: statusColor, fontFamily: "JetBrains Mono",
            fontWeight: 700, letterSpacing: "0.08em", lineHeight: 1.9 }}>
            {line}
          </div>
        ))}
      </div>

      {/* Cascade events summary */}
      {cascade.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {cascade.map((ev, i) => (
            <div key={i} style={{
              fontSize: 8, color: "#FFD60A", letterSpacing: "0.08em",
              padding: "3px 8px", background: "#1A1500", border: "1px solid #FFD60A33",
              marginBottom: 2 }}>
              {ev.from_hub} → {ev.to_hub}: {ev.excess_lambda} units/hr diverted
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <div style={{ background: "#111", padding: "5px 8px", border: "1px solid #1A1A1A" }}>
          <div style={{ fontSize: 8, color: "#888", letterSpacing: "0.08em" }}>T+3 PROJ (135-MIN)</div>
          <div style={{ fontSize: 13, color: rho_t3 >= 0.85 ? "#FF3B30" : "#39FF14",
            fontWeight: 700, fontFamily: "JetBrains Mono" }}>
            ρ={rho_t3.toFixed(4)}
          </div>
        </div>
        <div style={{ background: "#111", padding: "5px 8px", border: "1px solid #1A1A1A" }}>
          <div style={{ fontSize: 8, color: "#888", letterSpacing: "0.08em" }}>PVI (VOLATILITY)</div>
          <div style={{ fontSize: 13,
            color: pvi > 15 ? "#FF3B30" : pvi > 8 ? "#FFB340" : "#32D74B",
            fontWeight: 700, fontFamily: "JetBrains Mono" }}>
            {pvi.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Dashboard ─────────────────────────────────────────── */
export default function Dashboard({
  kState, ticker, loading, apiBase, onRefresh,
  isCalibrating, setCalibrating,
  isStreaming, onStreamStart, onStreamStop,
  isGhostMode, onGhostStart, onGhostStop,
  mu, onMuChange, activeTab, setActiveTab,
}) {
  const catastrophe = kState?.catastrophe;
  const collapse    = kState?.collapse;
  const hubs        = kState?.hubs ?? [];
  const bgColor = collapse ? "#140000" : catastrophe ? "#0D0000" : "#050505";

  if (loading && !kState) {
    return (
      <div style={{ background: "#050505", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <svg width="40" height="40" viewBox="0 0 34 34" fill="none">
              <path d="M 24 7 C 30 7, 30 15, 17 17 C 4 19, 4 27, 10 27" stroke="#FFB340" strokeWidth="2.2" strokeLinecap="round" fill="none" />
              <circle cx="24" cy="7" r="2.4" fill="#FFB340" />
              <circle cx="10" cy="27" r="2.4" fill="#FFB340" opacity="0.7" />
            </svg>
          </div>
          <div style={{ color: "#FFB340", fontFamily: "Chivo, sans-serif", fontWeight: 900, fontSize: 16, letterSpacing: "0.2em" }}>
            SITI INTELLIGENCE
          </div>
          <div style={{ color: "#CCCCCC", fontFamily: "JetBrains Mono", fontSize: 11, marginTop: 16, letterSpacing: "0.12em" }}>
            INITIALIZING 3-HUB NETWORK...
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {collapse && <div className="collapse-screen-border" />}
      {isCalibrating && <CalibrationOverlay />}

      <div data-testid="main-dashboard"
        className={catastrophe ? "catastrophe-mode" : ""}
        style={{ background: bgColor, minHeight: "100vh", transition: "background 0.5s ease",
          fontFamily: "JetBrains Mono, monospace" }}>

        {/* Executive HUD */}
        <ExecutiveHUD kState={kState} ticker={ticker} catastrophe={catastrophe}
          isStreaming={isStreaming} isGhostMode={isGhostMode} />

        {/* ── HERO METRIC: $2.81M ────────────────────────── */}
        <div data-testid="hero-metric" style={{
          textAlign: "center", padding: "20px 16px 14px",
          borderBottom: "1px solid #1A1A1A",
        }}>
          <div style={{ fontSize: 10, color: "#888", letterSpacing: "0.25em", textTransform: "uppercase", marginBottom: 4 }}>
            ANNUALIZED REVENUE RECOVERY
          </div>
          <div className="hero-neon-text" style={{
            fontSize: 48, fontWeight: 900, fontFamily: "JetBrains Mono",
            color: "#39FF14", lineHeight: 1,
            textShadow: "0 0 20px #39FF1466, 0 0 40px #39FF1433, 0 0 80px #39FF1420",
          }}>
            $2.81M
          </div>
          <div style={{ fontSize: 9, color: "#555", letterSpacing: "0.15em", marginTop: 4 }}>
            MIMI KERNEL v2.0 · 3-HUB NETWORK · 2D KALMAN STATE OBSERVER
          </div>
        </div>

        {/* ── 3-HUB NETWORK CARDS ───────────────────────── */}
        <div data-testid="hub-cards-row" className="hub-cards-grid"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, padding: "10px 16px" }}>
          {hubs.map(hub => (
            <HubCard key={hub.name} hub={hub} criticalRho={kState?.critical_rho ?? 0.85} />
          ))}
        </div>

        {/* PVI Alert */}
        {kState?.pvi_alert && !collapse && (
          <div data-testid="pvi-alert-banner"
            style={{ background: "#1A0A00", border: "1px solid #FF9F0A",
              padding: "8px 24px", display: "flex", alignItems: "center", gap: 12,
              margin: "0 16px 4px" }}>
            <span className="blink-critical" style={{ color: "#FF9F0A", fontSize: 10,
              fontWeight: 700, letterSpacing: "0.12em", fontFamily: "JetBrains Mono" }}>
              PREDICTIVE VOLATILITY INDEX: {(kState?.pvi ?? 0).toFixed(1)}% — T+3 RISING UNCERTAINTY
            </span>
          </div>
        )}

        {/* Collapse Banner */}
        {collapse && (
          <div data-testid="collapse-banner"
            style={{ background: "#200000", border: "2px solid #FF3B30",
              padding: "14px 24px", display: "flex", alignItems: "center", gap: 12,
              margin: "0 16px 4px" }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#FF3B30" }} />
            <span className="blink-critical" style={{
              color: "#FF3B30", fontFamily: "Chivo, sans-serif", fontWeight: 900,
              fontSize: 15, letterSpacing: "0.2em" }}>
              NETWORK COLLAPSE: SIGMOIDAL DECAY TRIGGERED
            </span>
          </div>
        )}

        {/* Catastrophe (diversion) banner */}
        {catastrophe && !collapse && (
          <div data-testid="catastrophe-banner"
            style={{ background: "#1A0000", border: "1px solid #FF9F0A",
              padding: "10px 24px", display: "flex", alignItems: "center", gap: 12,
              margin: "0 16px" }}>
            <span className="blink-critical" style={{
              color: "#FF9F0A", fontFamily: "Chivo, sans-serif", fontWeight: 900,
              fontSize: 13, letterSpacing: "0.15em" }}>
              PREEMPTIVE DIVERSION PROTOCOL INITIATED
            </span>
          </div>
        )}

        {/* ── MAIN 3-COL GRID ──────────────────────────────── */}
        <div className="main-content-grid"
          style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "260px 1fr 260px", gap: 12 }}>

          {/* LEFT: KPI Cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <KPICard label="NETWORK ρ (λ/μ)" value={kState?.global_rho?.toFixed(4)}
              color={collapse ? "#FF3B30" : catastrophe ? "#FF9F0A" : "#FFB340"} testId="kpi-rho" />
            <KPICard label="TOTAL ARRIVAL λ" value={`${kState?.total_lambda?.toFixed(1) ?? "—"}/hr`}
              color="#64D2FF" testId="kpi-lambda" />
            <KPICard label="SERVICE CAPACITY μ" value={`${kState?.mu?.toFixed(0) ?? "150"}/hr`}
              unit="per hub" color="#32D74B" testId="kpi-mu" />
            <KPICard label="INSTABILITY Φ(ρ)" value={kState?.phi?.toFixed(4)}
              unit={`k=${kState?.k_decay ?? 20} · ρ_c=${kState?.critical_rho?.toFixed(2) ?? "0.85"}`}
              color={kState?.phi > 0.5 ? "#FF3B30" : kState?.phi > 0.3 ? "#FF9F0A" : "#32D74B"} testId="kpi-phi" />
            <KPICard label="QUEUE DEPTH W_q" value={kState?.wq?.toFixed(3)} unit="norm. units"
              color={kState?.wq > 4 ? "#FF3B30" : "#64D2FF"} testId="kpi-wq" />
            <KPICard label="DELIVERY FAILURE RATE"
              value={`${((kState?.failure_rate ?? 0) * 100).toFixed(1)}%`}
              unit="N_late / N_total" color="#FF9F0A" testId="kpi-failure-rate" />
            <KPICard label="HIGH-IMP FAILURE"
              value={`${((kState?.inverse_reliability?.failure_rate ?? 0) * 100).toFixed(1)}%`}
              unit={`${kState?.inverse_reliability?.failure_count ?? 0} of ${kState?.inverse_reliability?.total_high ?? 0}`}
              color="#FF3B30" testId="kpi-high-imp" />
            <KPICard label="LEAKAGE $3.94/unit"
              value={`$${kState?.inverse_reliability?.leakage_total?.toLocaleString("en-US", { minimumFractionDigits: 0 }) ?? "0"}`}
              color="#FF9F0A" testId="kpi-leakage" />
          </div>

          {/* CENTER: MIMI Panel + Charts */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <MIMIPanel kState={kState} catastrophe={catastrophe} />
            <HubCharts kState={kState} />
          </div>

          {/* RIGHT: Commander Console + Widgets */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <CommanderConsole kState={kState} />
            <RecoveryWidget ticker={ticker} kState={kState} />
            <KalmanWidget kState={kState} />
            <FailureTable kState={kState} />
          </div>
        </div>

        {/* ── BOTTOM: Tab Navigation ────────────────────────── */}
        <div style={{ padding: "0 16px 4px" }}>
          <div data-testid="bottom-tabs" style={{ display: "flex", gap: 0, borderBottom: "1px solid #1F1F1F" }}>
            {[
              { id: "network", label: "NETWORK CONTROL" },
              { id: "api-docs", label: "API INTEGRATION" },
            ].map(tab => (
              <button key={tab.id} data-testid={`tab-${tab.id}`}
                onClick={() => setActiveTab?.(tab.id)}
                style={{
                  background: activeTab === tab.id ? "#0A0A0A" : "transparent",
                  border: "none", borderBottom: activeTab === tab.id ? "2px solid #FFB340" : "2px solid transparent",
                  color: activeTab === tab.id ? "#FFB340" : "#555",
                  fontFamily: "JetBrains Mono", fontSize: 10, fontWeight: 700,
                  letterSpacing: "0.15em", padding: "10px 20px",
                  cursor: "pointer", transition: "all 0.2s",
                }}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === "api-docs" ? (
          <div style={{ padding: "0 16px 16px" }}>
            <ApiDocsPanel />
          </div>
        ) : (
          <DataInjection
            apiBase={apiBase} onRefresh={onRefresh} kState={kState} ticker={ticker}
            onCalibrating={setCalibrating}
            isStreaming={isStreaming} onStreamStart={onStreamStart} onStreamStop={onStreamStop}
            isGhostMode={isGhostMode} onGhostStart={onGhostStart} onGhostStop={onGhostStop}
            mu={mu} onMuChange={onMuChange}
          />
        )}
      </div>
    </>
  );
}

/* ── Sub-components ─────────────────────────────────────────── */

function KPICard({ label, value, unit, color, testId }) {
  return (
    <div data-testid={testId} style={{ background: "#0A0A0A", border: "1px solid #1F1F1F", padding: "10px 12px" }}>
      <div style={{ color: "#D4D4D8", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ color, fontSize: 22, fontWeight: 700, fontFamily: "JetBrains Mono", lineHeight: 1 }}>
        {value ?? "—"}
      </div>
      {unit && <div style={{ color: "#888", fontSize: 9, marginTop: 2, letterSpacing: "0.1em" }}>{unit}</div>}
    </div>
  );
}

function RecoveryWidget({ ticker, kState }) {
  return (
    <div data-testid="recovery-counter" style={{ background: "#0A0A0A", border: "1px solid #1F1F1F", padding: "12px" }}>
      <div style={{ color: "#D4D4D8", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
        REVENUE SAVED · RECOVERY COUNTER
      </div>
      <div style={{ color: "#32D74B", fontSize: 28, fontWeight: 700, fontFamily: "JetBrains Mono", lineHeight: 1 }}>
        ${ticker?.revenue_saved?.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "0.00"}
      </div>
      <div style={{ color: "#CCCCCC", fontSize: 10, marginTop: 6, display: "flex", justifyContent: "space-between" }}>
        <span>{ticker?.total_diverted?.toLocaleString() ?? 0} units diverted</span>
        <span style={{ color: "#32D74B" }}>x ${kState?.leakage_seed ?? 3.94}/unit</span>
      </div>
      <div style={{ marginTop: 8, height: 2, background: "#1F1F1F" }}>
        <div style={{
          height: "100%", background: "#32D74B",
          width: `${Math.min(100, (ticker?.refresh_count ?? 0) * 3.33)}%`,
          transition: "width 0.4s",
        }} />
      </div>
    </div>
  );
}

function KalmanWidget({ kState }) {
  const k = kState?.kalman;
  const rhoDot = k?.rho_dot ?? 0;
  return (
    <div data-testid="kalman-widget" style={{
      background: "#0A0A0A", border: "1px solid #1F1F1F", padding: "12px",
    }}>
      <div style={{ color: "#D4D4D8", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
        2D KALMAN STATE · x = [ρ, ρ dot]
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {[
          { label: "x[0] = ρ", value: k?.x_hat?.toFixed(4), color: "#64D2FF" },
          { label: "x[1] = ρ dot", value: rhoDot !== 0 ? (rhoDot > 0 ? "+" : "") + rhoDot.toFixed(6) : "0.000000",
            color: rhoDot > 0 ? "#FF9F0A" : "#64D2FF" },
          { label: "T+1 (45m)", value: k?.rho_t1?.toFixed(4),
            color: k?.rho_t1 >= 0.85 ? "#FF3B30" : "#32D74B" },
          { label: "T+3 (135m)", value: k?.rho_t3?.toFixed(4),
            color: k?.rho_t3 >= 0.85 ? "#FF3B30" : "#32D74B" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "#111", padding: "6px 8px", border: "1px solid #161616" }}>
            <div style={{ color: "#888", fontSize: 9, letterSpacing: "0.1em" }}>{label}</div>
            <div style={{ color, fontSize: 13, fontWeight: 700 }}>{value ?? "—"}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, color: "#888", fontSize: 9, letterSpacing: "0.08em" }}>
        F=[[1,dt],[0,1]] · H=[[1,0]] · Q=diag(0.002,0.001) · R=0.005
      </div>
    </div>
  );
}
