import React from "react";

const STATUS_COLORS = {
  saturated: "#FF3B30",
  critical: "#FF9F0A",
  cascade: "#FFD60A",
  nominal: "#32D74B",
};

export default function HubCard({ hub, criticalRho = 0.85 }) {
  const rho = hub?.rho ?? 0;
  const rhoExact = hub?.rho_exact ?? rho;
  const isCascadeRisk = hub?.cascade_risk;
  const isCascadeSource = hub?.cascade_source;
  const isSaturation = hub?.saturation_protocol;
  const isCollapse = rhoExact >= 0.85;
  const isCritical = rhoExact > 0.75;

  let status, statusColor, borderColor;
  if (isSaturation) {
    status = "SATURATION"; statusColor = "#FF3B30"; borderColor = "#FF3B30";
  } else if (isCollapse || isCascadeSource) {
    status = isCascadeSource ? "DIVERTING" : "SATURATED";
    statusColor = "#FF3B30"; borderColor = "#FF3B30";
  } else if (isCascadeRisk) {
    status = "CASCADE RECV"; statusColor = "#FFD60A"; borderColor = "#FFD60A";
  } else if (isCritical) {
    status = "WARNING"; statusColor = "#FF9F0A"; borderColor = "#FF9F0A";
  } else {
    status = "NOMINAL"; statusColor = "#32D74B"; borderColor = "#1F1F1F";
  }

  const k = hub?.kalman ?? {};
  const rhoPct = Math.min(rhoExact * 100, 100);

  return (
    <div data-testid={`hub-card-${hub?.name?.toLowerCase()}`}
      className="hub-card-responsive"
      style={{
        background: "#0A0A0A",
        border: `1px solid ${borderColor}`,
        padding: "14px 16px",
        position: "relative",
        overflow: "hidden",
        transition: "border-color 0.3s",
      }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: statusColor,
            boxShadow: `0 0 6px ${statusColor}88`,
          }} />
          <div style={{
            fontFamily: "Chivo, sans-serif", fontWeight: 900,
            fontSize: 14, color: "#FFB340", letterSpacing: "0.15em",
          }}>
            HUB {hub?.name?.toUpperCase()}
          </div>
          <div style={{ fontSize: 8, color: "#555", letterSpacing: "0.08em" }}>
            [{hub?.blocks?.join(",")}]
          </div>
        </div>
        <div style={{
          fontSize: 8, fontWeight: 700, letterSpacing: "0.1em",
          color: statusColor, background: `${statusColor}15`,
          border: `1px solid ${statusColor}44`,
          padding: "2px 8px",
        }}>
          {status}
        </div>
      </div>

      {/* ρ Value */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
        <span style={{
          fontSize: 28, fontWeight: 700, fontFamily: "JetBrains Mono",
          color: isCollapse ? "#FF3B30" : isCritical ? "#FF9F0A" : "#FFB340",
        }}>
          {rho.toFixed(4)}
        </span>
        <span style={{ fontSize: 10, color: "#888", letterSpacing: "0.08em" }}>ρ = λ/μ</span>
      </div>

      {/* ρ Bar */}
      <div style={{ height: 4, background: "#161616", marginBottom: 10, position: "relative" }}>
        <div style={{
          height: "100%",
          width: `${rhoPct}%`,
          background: isCollapse ? "#FF3B30" : isCritical ? "#FF9F0A" : "#FFB340",
          transition: "width 0.5s, background 0.3s",
        }} />
        <div style={{ position: "absolute", left: "85%", top: -2, bottom: -2, width: 1, background: "#FF3B3088" }} />
      </div>

      {/* λ / μ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
        <div style={{ background: "#111", padding: "5px 8px", border: "1px solid #1A1A1A" }}>
          <div style={{ fontSize: 8, color: "#888", letterSpacing: "0.08em" }}>ARRIVAL λ</div>
          <div style={{ fontSize: 12, color: "#64D2FF", fontWeight: 700, fontFamily: "JetBrains Mono" }}>
            {hub?.effective_lambda?.toFixed(1) ?? "—"}<span style={{ fontSize: 8, color: "#555" }}>/hr</span>
          </div>
        </div>
        <div style={{ background: "#111", padding: "5px 8px", border: "1px solid #1A1A1A" }}>
          <div style={{ fontSize: 8, color: "#888", letterSpacing: "0.08em" }}>CAPACITY μ</div>
          <div style={{ fontSize: 12, color: "#32D74B", fontWeight: 700, fontFamily: "JetBrains Mono" }}>
            {hub?.mu?.toFixed(0) ?? "—"}<span style={{ fontSize: 8, color: "#555" }}>/hr</span>
          </div>
        </div>
      </div>

      {/* Kalman Projections */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, marginBottom: 8 }}>
        <div style={{ background: "#0D0D0D", padding: "4px 6px", border: "1px solid #161616" }}>
          <div style={{ fontSize: 7, color: "#555", letterSpacing: "0.06em" }}>T+1 (45m)</div>
          <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono",
            color: k.rho_t1 >= 0.85 ? "#FF3B30" : k.rho_t1 > 0.75 ? "#FF9F0A" : "#32D74B" }}>
            {k.rho_t1?.toFixed(4) ?? "—"}
          </div>
        </div>
        <div style={{ background: "#0D0D0D", padding: "4px 6px", border: "1px solid #161616" }}>
          <div style={{ fontSize: 7, color: "#555", letterSpacing: "0.06em" }}>T+3 (135m)</div>
          <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono",
            color: k.rho_t3 >= 0.85 ? "#FF3B30" : k.rho_t3 > 0.75 ? "#FF9F0A" : "#32D74B" }}>
            {k.rho_t3?.toFixed(4) ?? "—"}
          </div>
        </div>
        <div style={{ background: "#0D0D0D", padding: "4px 6px", border: "1px solid #161616" }}>
          <div style={{ fontSize: 7, color: "#555", letterSpacing: "0.06em" }}>VELOCITY</div>
          <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono",
            color: (k.rho_dot ?? 0) > 0 ? "#FF9F0A" : "#64D2FF" }}>
            {k.rho_dot !== undefined ? (k.rho_dot > 0 ? "+" : "") + k.rho_dot.toFixed(4) : "—"}
          </div>
        </div>
      </div>

      {/* Cascade Warning */}
      {isCascadeRisk && (
        <div data-testid={`cascade-warning-${hub?.name?.toLowerCase()}`}
          className="blink-critical"
          style={{
            fontSize: 8, color: "#FFD60A", letterSpacing: "0.1em",
            padding: "4px 8px", background: "#1A1500",
            border: "1px dashed #FFD60A66", fontWeight: 700,
          }}>
          CASCADE RISK — RECEIVING DIVERTED TRAFFIC
        </div>
      )}
      {isCascadeSource && (
        <div data-testid={`diversion-active-${hub?.name?.toLowerCase()}`}
          style={{
            fontSize: 8, color: "#FF3B30", letterSpacing: "0.1em",
            padding: "4px 8px", background: "#1A0000",
            border: "1px dashed #FF3B3066", fontWeight: 700,
          }}>
          AUTO-DIVERSION: EXCESS λ REROUTED
        </div>
      )}
    </div>
  );
}
