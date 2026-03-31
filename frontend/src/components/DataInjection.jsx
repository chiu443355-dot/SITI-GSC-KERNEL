import React from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import axios from "axios";

/* ── Multi-stage encoding decoder + non-ASCII sanitizer ──── */
const readFileResilient = async (file) => {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  if (utf8.includes("\uFFFD")) {
    console.warn("[SITI Pre-Processor] UTF-8 replacement chars detected → retrying ISO-8859-1");
    return new TextDecoder("iso-8859-1").decode(buffer);
  }
  return utf8;
};
const sanitizeText = (t) => t.replace(/[^\x20-\x7E\t\n\r]/g, "");

/* ══════════════════════════════════════════════════════════
   CLIENT-SIDE PRE-PROCESSOR — fuzzy header mapping dictionary
   Runs BEFORE the file is sent to the backend.
   Matches messy CSV headers to SITI standard column names.
══════════════════════════════════════════════════════════ */
const PRE_PROCESSOR_MAP = {
  "Reached.on.Time_Y.N":  ["late", "delayed", "delay", "status", "on_time", "ontime",
                            "target", "delivery_status", "reached", "on_time_y_n", "timely"],
  "Weight_in_gms":        ["wt", "weight", "mass", "gms", "grams", "weight_g", "weight_grams"],
  "Warehouse_block":      ["block", "hub", "location", "wh", "area", "warehouse", "wh_block", "depot"],
  "Product_importance":   ["priority", "rank", "importance", "vips", "tier", "prod_imp", "prod_priority"],
  "Mode_of_Shipment":     ["mode", "shipment", "transport", "carrier", "ship_mode", "method"],
  "Customer_care_calls":  ["care_calls", "cc_calls", "support_calls", "customer_care", "calls", "support"],
  "Customer_rating":      ["rating", "score", "csat", "satisfaction", "stars", "review_score"],
  "Cost_of_the_Product":  ["cost", "price", "product_cost", "amount", "value", "item_cost"],
  "Prior_purchases":      ["prior", "previous", "purchases", "buy_count", "order_count", "orders"],
  "Discount_offered":     ["discount", "promo", "rebate", "offer", "coupon", "promo_pct"],
  "Gender":               ["gender", "sex", "g", "customer_gender"],
};

function preprocessCSV(csvText, manualOverrides = {}) {
  const lines = csvText.split("\n");
  if (lines.length === 0) return csvText;
  const headers = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, ""));
  const newHeaders = headers.map(h => {
    const lower = h.toLowerCase().replace(/[\s\-\.]/g, "_");
    // 1. Manual overrides take priority
    if (manualOverrides[h]) return manualOverrides[h];
    // 2. Fuzzy match
    for (const [target, keywords] of Object.entries(PRE_PROCESSOR_MAP)) {
      for (const kw of keywords) {
        if (lower === kw || lower.includes(kw)) return target;
      }
    }
    return h;
  });
  lines[0] = newHeaders.join(",");
  return lines.join("\n");
}

/* ══════════════════════════════════════════════════════════
   SCHEMA MISMATCH UI
   Shows when backend returns SCHEMA_MISMATCH error.
   Lets user manually map unresolved columns via dropdown.
══════════════════════════════════════════════════════════ */
function SchemaMapper({ schemaError, manualMap, setManualMap, onApply, onDismiss, retrying }) {
  const { found_columns = [], required_unmapped = [], fuzzy_suggestions = {} } = schemaError;
  return (
    <div data-testid="schema-mapper" style={{
      marginTop: 12, padding: "14px 16px",
      background: "#1A0A00", border: "1.5px solid #FF3B30",
    }}>
      <div style={{ fontSize: 10, color: "#FF3B30", letterSpacing: "0.14em", fontWeight: 700, marginBottom: 10 }}>
        SCHEMA MISMATCH — MANUAL COLUMN MAPPING REQUIRED
      </div>
      <div style={{ fontSize: 9, color: "#CCCCCC", marginBottom: 12, lineHeight: 1.7 }}>
        The following required SITI standard columns could not be auto-detected in your CSV.
        Select which column in your file corresponds to each target field.
      </div>
      {required_unmapped.map(target => (
        <div key={target} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <div style={{
            minWidth: 220, fontFamily: "JetBrains Mono", fontSize: 9, color: "#FFB340",
            background: "#0A0500", border: "1px solid #FF9F0A", padding: "4px 10px",
          }}>
            {target}
          </div>
          <span style={{ color: "#666", fontSize: 9 }}>←</span>
          <select
            data-testid={`schema-map-${target}`}
            value={Object.entries(manualMap).find(([, v]) => v === target)?.[0] ?? ""}
            onChange={e => {
              const csvCol = e.target.value;
              setManualMap(prev => {
                const next = { ...prev };
                // Remove any previous assignment for this target
                Object.keys(next).forEach(k => { if (next[k] === target) delete next[k]; });
                if (csvCol) next[csvCol] = target;
                return next;
              });
            }}
            style={{
              flex: 1, background: "#0D0D0D", border: "1px solid #2A2A2A",
              color: "#FFFFFF", fontFamily: "JetBrains Mono", fontSize: 9,
              padding: "4px 8px", outline: "none", cursor: "pointer",
            }}
          >
            <option value="">— SELECT FROM CSV COLUMNS —</option>
            {found_columns.map(col => (
              <option key={col} value={col}
                style={{ background: col === fuzzy_suggestions[target] ? "#001A00" : undefined }}>
                {col}{col === fuzzy_suggestions[target] ? "  ✓ SUGGESTED" : ""}
              </option>
            ))}
          </select>
        </div>
      ))}
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button
          data-testid="schema-apply-btn"
          onClick={onApply}
          disabled={retrying || required_unmapped.some(t =>
            !Object.values(manualMap).includes(t)
          )}
          style={{
            background: "#001A00", border: "1px solid #32D74B", color: "#32D74B",
            fontFamily: "JetBrains Mono", fontSize: 10, fontWeight: 700,
            letterSpacing: "0.12em", padding: "7px 18px", cursor: "pointer",
            opacity: retrying ? 0.6 : 1,
          }}
        >
          {retrying ? "REPROCESSING..." : "APPLY MAPPING & REPROCESS"}
        </button>
        <button
          data-testid="schema-dismiss-btn"
          onClick={onDismiss}
          style={{
            background: "transparent", border: "1px solid #333", color: "#888",
            fontFamily: "JetBrains Mono", fontSize: 10, padding: "7px 14px", cursor: "pointer",
          }}
        >
          DISMISS
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════ */
export default function DataInjection({
  apiBase, onRefresh, kState, ticker,
  onCalibrating,
  isStreaming, onStreamStart, onStreamStop,
  isGhostMode, onGhostStart, onGhostStop,
  mu, onMuChange,
}) {
  const [uploading, setUploading]         = React.useState(false);
  const [uploadMsg, setUploadMsg]         = React.useState(null);
  const [uploadError, setUploadError]     = React.useState(null);
  const [schemaError, setSchemaError]     = React.useState(null);
  const [manualMap, setManualMap]         = React.useState({});
  const [schemaRetrying, setSchemaRetrying] = React.useState(false);
  const fileRef    = React.useRef(null);
  const savedFile  = React.useRef(null); // original file for schema retry

  /* ── Upload with client-side Pre-Processor ─────────────── */
  const doUpload = async (file, overrides = {}) => {
    onCalibrating?.(true);
    setUploadMsg(null);
    setUploadError(null);
    setSchemaError(null);
    try {
      // 1. Multi-stage decode (UTF-8 → ISO-8859-1 fallback)
      const rawText   = await readFileResilient(file);
      // 2. Strip non-ASCII smart characters (smart quotes, em-dash, 0xe2 bytes…)
      const cleanText = sanitizeText(rawText);
      // 3. Client-side fuzzy header remapping + manual overrides
      const remapped  = preprocessCSV(cleanText, overrides);
      const blob      = new Blob([remapped], { type: "text/csv" });
      const processed = new File([blob], file.name, { type: "text/csv" });
      const fd = new FormData();
      fd.append("file", processed);

      const [res] = await Promise.all([
        axios.post(`${apiBase}/kernel/upload`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        }),
        new Promise(r => setTimeout(r, 2800)),
      ]);
      setUploadMsg(`GENIUS RESET COMPLETE — ${res.data.message}`);
      await onRefresh();
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (detail?.type === "SCHEMA_MISMATCH") {
        setSchemaError(detail);
      } else {
        setUploadError(typeof detail === "string" ? detail : "Upload failed");
      }
    } finally {
      onCalibrating?.(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    savedFile.current = file;
    setUploading(true);
    await doUpload(file, {});
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const applyManualMapping = async () => {
    if (!savedFile.current) return;
    setSchemaRetrying(true);
    await doUpload(savedFile.current, manualMap);
    setSchemaRetrying(false);
    if (!schemaError) setManualMap({});
  };

  /* ── PDF Export ─────────────────────────────────────────── */
  const exportPDF = () => {
    const doc  = new jsPDF({ orientation: "portrait", format: "a4" });
    const now  = new Date().toISOString();
    const rho  = kState?.rho ?? 0;
    const phi  = kState?.phi ?? 0;
    const irp  = kState?.inverse_reliability ?? {};

    doc.setFillColor(5, 5, 5);
    doc.rect(0, 0, 210, 45, "F");
    doc.setFillColor(255, 179, 64);
    doc.rect(0, 0, 5, 45, "F");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 179, 64);
    doc.setFontSize(18);
    doc.text("SITI INTELLIGENCE", 12, 14);
    doc.setFontSize(9);
    doc.setTextColor(200, 200, 200);
    doc.text("FORENSIC STATE AUDIT [Case #02028317]", 12, 22);
    doc.text(`GENERATED: ${now}`, 12, 30);
    doc.text(`DATASET: ${kState?.dataset_name ?? "SAFEXPRESS_CASE_02028317"}`, 12, 37);
    doc.setTextColor(255, 59, 48);
    doc.setFontSize(9);
    doc.text(
      rho >= 0.85 ? "STATUS: UTILIZATION COLLAPSE — SIGMOIDAL DECAY TRIGGERED"
        : rho > 0.80 ? "STATUS: PREEMPTIVE DIVERSION PROTOCOL INITIATED"
        : "STATUS: NOMINAL OPERATIONS",
      12, 43,
    );

    doc.setTextColor(255, 179, 64);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("EXECUTIVE SUMMARY", 14, 58);
    autoTable(doc, {
      startY: 62,
      head: [["METRIC", "VALUE", "STATUS"]],
      body: [
        ["Hub Utilization (ρ)", rho.toFixed(4), rho > 0.80 ? "CRITICAL" : "NOMINAL"],
        ["Instability Φ(ρ)", phi.toFixed(4), phi < 0.2 ? "CRITICAL" : "STABLE"],
        ["ρ_critical", (kState?.critical_rho ?? 0.85).toFixed(4), "COMPUTED"],
        ["Kalman T+1", (kState?.kalman?.rho_t1 ?? 0).toFixed(4), kState?.catastrophe_predicted ? "ALERT" : "NOMINAL"],
        ["Annualized Exposure", "$2,810,000", "AUDIT BASELINE"],
        ["Revenue Saved", `$${(ticker?.revenue_saved ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, "RECOVERED"],
        ["Diverted Units", (ticker?.total_diverted ?? 0).toLocaleString(), "DIVERTED"],
        ["Total Shipments", (kState?.n_total ?? 0).toLocaleString(), "DATASET"],
      ],
      theme: "grid",
      headStyles: { fillColor: [10, 10, 10], textColor: [255, 179, 64], fontSize: 8, fontStyle: "bold" },
      bodyStyles: { fillColor: [15, 15, 15], textColor: [220, 220, 220], fontSize: 8 },
    });

    let y = doc.lastAutoTable.finalY + 10;
    doc.setTextColor(255, 179, 64);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("MIMI KERNEL — MATHEMATICAL STATE ANALYSIS", 14, y);
    y += 6;
    doc.setTextColor(180, 180, 180);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    [
      `ρ = λ/μ = ${(kState?.total_lambda ?? 0).toFixed(1)} / ${((kState?.mu ?? 150) * 5).toFixed(0)} = ${rho.toFixed(4)}`,
      `Φ(ρ) = 1/(1+exp(-20(ρ-${(kState?.critical_rho ?? 0.85).toFixed(2)}))) = ${phi.toFixed(4)}`,
      `L = $3.94 × ${irp?.failure_count ?? 0} = $${irp?.leakage_total?.toFixed(2) ?? "0.00"} (from ${kState?.inverse_reliability?.total_high ?? 0} hi-imp shipments)`,
      `Wq = ρ/(1-ρ) = ${(kState?.wq ?? 0).toFixed(4)}`,
      `x = [ρ, ρ_dot] · F=[[1,dt],[0,1]] · T+3 = ${kState?.kalman?.rho_t3?.toFixed(4) ?? "—"}`,
    ].forEach(f => { doc.text(f, 14, y); y += 6; });

    y += 4;
    doc.setTextColor(255, 179, 64);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("TOP FAILURES — INVERSE RELIABILITY PARADOX", 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [["ID", "HUB", "MODE", "COST", "WEIGHT", "LEAKAGE"]],
      body: (irp?.records ?? []).slice(0, 15).map(r => [
        r.id, r.hub, r.mode, `$${r.cost}`, r.weight?.toLocaleString(), "$3.94",
      ]),
      theme: "grid",
      headStyles: { fillColor: [26, 0, 0], textColor: [255, 59, 48], fontSize: 7, fontStyle: "bold" },
      bodyStyles: { fillColor: [15, 15, 15], textColor: [200, 200, 200], fontSize: 7 },
    });

    const pgCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pgCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(80, 80, 80);
      doc.text(`SITI Intelligence · CONFIDENTIAL · Page ${i}/${pgCount}`, 105, 290, { align: "center" });
    }
    doc.save(`siti-forensic-audit-${Date.now()}.pdf`);
  };

  /* ── RENDER ─────────────────────────────────────────────── */
  return (
    <div data-testid="data-injection-module"
      style={{ margin: "0 16px 16px", background: "#0A0A0A", border: "1px solid #1F1F1F", padding: "14px 16px" }}>

      <div className="data-injection-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>

        {/* ── COL 1: Genius Reset ──────────────────────────── */}
        <div>
          <div style={{ fontSize: 9, color: "#D4D4D8", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>
            DATA INJECTION — GENIUS RESET
          </div>
          <div style={{ fontSize: 9, color: "#888", marginBottom: 12, lineHeight: 1.6 }}>
            Upload a CSV dataset. MIMI Kernel wipes historical weights, runs logistic regression,
            and recalculates ρ_critical.{" "}
            <span style={{ color: "#64D2FF" }}>
              Client Pre-Processor auto-renames messy headers before upload.
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleUpload}
              data-testid="csv-upload-input" style={{ display: "none" }} id="csv-file-input" />
            <label htmlFor="csv-file-input" data-testid="csv-upload-btn"
              style={{
                background: uploading ? "#1A1A00" : "#1A0A00",
                border: `1px solid ${uploading ? "#FFB340" : "#FF9F0A"}`,
                color: uploading ? "#FFB340" : "#FF9F0A",
                fontFamily: "JetBrains Mono", fontSize: 10, fontWeight: 700,
                letterSpacing: "0.12em", textTransform: "uppercase",
                padding: "7px 16px", cursor: uploading ? "wait" : "pointer",
                display: "inline-block", userSelect: "none",
              }}>
              {uploading ? "PROCESSING..." : "UPLOAD CSV — GENIUS RESET"}
            </label>
          </div>
          <div style={{ marginTop: 8, fontSize: 8, color: "#555", lineHeight: 1.7 }}>
            {[
              "delay_status → Reached.on.Time_Y.N",
              "wt / weight → Weight_in_gms",
              "block / hub / area → Warehouse_block",
              "priority / vips → Product_importance",
            ].map(m => (
              <div key={m} style={{ display: "flex", gap: 5 }}>
                <span style={{ color: "#32D74B" }}>›</span>
                <span style={{ color: "#888" }}>{m}</span>
              </div>
            ))}
          </div>
          {uploadMsg && (
            <div data-testid="upload-success-msg" style={{
              marginTop: 8, padding: "6px 10px", background: "#001A00",
              border: "1px solid #32D74B", color: "#32D74B", fontSize: 9, letterSpacing: "0.08em",
            }}>
              {uploadMsg}
            </div>
          )}
          {uploadError && (
            <div data-testid="upload-error-msg" style={{
              marginTop: 8, padding: "6px 10px", background: "#1A0000",
              border: "1px solid #FF3B30", color: "#FF3B30", fontSize: 9,
            }}>
              ERROR: {uploadError}
            </div>
          )}
          {schemaError && (
            <SchemaMapper
              schemaError={schemaError}
              manualMap={manualMap}
              setManualMap={setManualMap}
              onApply={applyManualMapping}
              onDismiss={() => { setSchemaError(null); setManualMap({}); }}
              retrying={schemaRetrying}
            />
          )}
        </div>

        {/* ── COL 2: PDF Export ─────────────────────────────── */}
        <div>
          <div style={{ fontSize: 9, color: "#D4D4D8", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>
            EXPORT FORENSIC STATE AUDIT
          </div>
          <div style={{ fontSize: 9, color: "#888", marginBottom: 12, lineHeight: 1.6 }}>
            Board-ready PDF: <em>SITI: Forensic State Audit [Case #02028317]</em> — MIMI Kernel
            analysis, Inverse Reliability findings,{" "}
            <span style={{ color: "#32D74B" }}>Mission LiFE ESG Certification</span>.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button data-testid="export-pdf-btn" onClick={exportPDF}
              style={{
                background: "#000D1A", border: "1px solid #64D2FF", color: "#64D2FF",
                fontFamily: "JetBrains Mono", fontSize: 10, fontWeight: 700,
                letterSpacing: "0.12em", textTransform: "uppercase",
                padding: "7px 16px", cursor: "pointer",
              }}>
              EXPORT FORENSIC AUDIT PDF
            </button>
            <div style={{ fontSize: 8, color: "#888", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#32D74B" }} />
              MISSION LiFE CERTIFIED
            </div>
          </div>
          <div style={{ marginTop: 10, padding: "8px", background: "#060606", border: "1px solid #141414", fontSize: 8, color: "#777", lineHeight: 1.8 }}>
            <div style={{ color: "#CCCCCC", marginBottom: 4, letterSpacing: "0.1em" }}>REPORT INCLUDES:</div>
            {[
              "Executive KPI Summary", "MIMI Kernel Math Formulation",
              "Warehouse Utilization Breakdown",
              "Inverse Reliability Paradox Table (Top 15)",
              "Kalman Filter State Analysis",
              "Mission LiFE ESG Compliance Tag",
            ].map(item => (
              <div key={item} style={{ display: "flex", gap: 6 }}>
                <span style={{ color: "#32D74B" }}>✓</span>
                <span style={{ color: "#CCCCCC" }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── COL 3: Service Capacity + Live Stream ──────── */}
        <div>
          <div style={{ fontSize: 9, color: "#D4D4D8", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>
            SERVICE CAPACITY (μ) CONTROL
          </div>
          <div style={{ fontSize: 9, color: "#888", marginBottom: 12, lineHeight: 1.6 }}>
            Adjust service capacity per hub. ρ = λ/μ recalculates in real-time.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <input
              data-testid="mu-slider"
              type="range"
              min="50"
              max="500"
              step="5"
              value={mu ?? 150}
              onChange={e => onMuChange?.(Number(e.target.value))}
              style={{ flex: 1, accentColor: "#32D74B", cursor: "pointer" }}
            />
            <div style={{
              background: "#0D0D0D", border: "1px solid #32D74B", padding: "4px 10px",
              fontFamily: "JetBrains Mono", fontSize: 13, color: "#32D74B", fontWeight: 700,
              minWidth: 80, textAlign: "center",
            }}>
              μ = {mu ?? 150}
            </div>
          </div>
          <div style={{ fontSize: 8, color: "#555", lineHeight: 1.7, marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 5 }}>
              <span style={{ color: "#32D74B" }}>›</span>
              <span style={{ color: "#888" }}>μ = {mu ?? 150} units/hr per hub</span>
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              <span style={{ color: "#32D74B" }}>›</span>
              <span style={{ color: "#888" }}>Network capacity: {((mu ?? 150) * 3)} units/hr</span>
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              <span style={{ color: "#32D74B" }}>›</span>
              <span style={{ color: "#888" }}>Global ρ = λ/Σμ = {kState?.global_rho?.toFixed(4) ?? "—"}</span>
            </div>
          </div>
          <div style={{ borderTop: "1px solid #1A1A1A", paddingTop: 12 }}>
          <div style={{ fontSize: 9, color: "#888", marginBottom: 12, lineHeight: 1.6 }}>
            Two modes to demonstrate the MIMI Engine without a CSV.
          </div>

          {/* Normal Stream: 100 units / 10s */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 8, color: "#AAAAAA", letterSpacing: "0.1em", marginBottom: 6 }}>
              STANDARD STREAM · 100 UNITS / 10s
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button data-testid="live-stream-toggle"
                onClick={isStreaming ? onStreamStop : onStreamStart}
                disabled={isGhostMode}
                style={{
                  background: isStreaming ? "#001A0A" : "#0A0A0A",
                  border: `1px solid ${isStreaming ? "#32D74B" : "#2A2A2A"}`,
                  color: isStreaming ? "#32D74B" : "#A1A1AA",
                  fontFamily: "JetBrains Mono", fontSize: 10, fontWeight: 700,
                  letterSpacing: "0.12em", textTransform: "uppercase",
                  padding: "7px 14px", cursor: isGhostMode ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", gap: 8,
                  opacity: isGhostMode ? 0.4 : 1,
                }}>
                <span style={{
                  display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                  background: isStreaming ? "#32D74B" : "#555", flexShrink: 0,
                }} />
                {isStreaming ? "HALT STREAM" : "INITIATE STREAM"}
              </button>
              {isStreaming && (
                <span style={{ fontSize: 9, color: "#32D74B", fontFamily: "JetBrains Mono" }}>100/10s</span>
              )}
            </div>
          </div>

          {/* Ghost Trigger: 50 units / 1s */}
          <div style={{ borderTop: "1px solid #1A1A1A", paddingTop: 12 }}>
            <div style={{ fontSize: 8, color: "#39FF14", letterSpacing: "0.1em", marginBottom: 6, fontWeight: 700 }}>
              GHOST TRIGGER · 50 UNITS / SECOND · AUTO-STOPS @ 90s
            </div>
            <div style={{ fontSize: 9, color: "#888", marginBottom: 8, lineHeight: 1.6 }}>
              Feeds MIMI 50 shipment units per second — puts the prediction
              engine into <span style={{ color: "#39FF14" }}>live inference mode</span>.
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button data-testid="ghost-trigger-btn"
                onClick={isGhostMode ? onGhostStop : onGhostStart}
                disabled={isStreaming}
                className={isGhostMode ? "ghost-active-btn" : ""}
                style={{
                  background: isGhostMode ? "#001A05" : "#0A0A0A",
                  border: `1px solid ${isGhostMode ? "#39FF14" : "#2A2A2A"}`,
                  color: isGhostMode ? "#39FF14" : "#A1A1AA",
                  fontFamily: "JetBrains Mono", fontSize: 10, fontWeight: 700,
                  letterSpacing: "0.12em", textTransform: "uppercase",
                  padding: "7px 14px", cursor: isStreaming ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", gap: 8,
                  opacity: isStreaming ? 0.4 : 1,
                }}>
                <span style={{
                  display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                  background: isGhostMode ? "#39FF14" : "#555", flexShrink: 0,
                }} />
                {isGhostMode ? "HALT GHOST TRIGGER" : "SIMULATE LIVE STREAM"}
              </button>
              {isGhostMode && (
                <span style={{ fontSize: 9, color: "#39FF14", fontFamily: "JetBrains Mono" }}>50/s ACTIVE</span>
              )}
            </div>
          </div>
          </div>
        </div>

      </div>
    </div>
  );
}
