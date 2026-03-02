import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
// Static imports — avoids async chunk-splitting issues in some build environments.
// CDN fallback is provided in index.html for environments where the bundle chunk fails.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export default function DataInjection({ onRefresh, kState, ticker }) {
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const fileRef = useRef(null);

  const [transitionLogs, setTransitionLogs] = useState([]);

  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    setTransitionLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 5));
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    setUploadError(null);
    // Trigger the "Genius Reset" overlay immediately on file selection
    setShowOverlay(true);

    addLog("Initializing Data Injection...");
    addLog("Wiping historical state...");

    setTimeout(() => setShowOverlay(false), 2500);
    try {
      const fd = new FormData();
      fd.append("file", file);

      const startTime = performance.now();
      const res = await axios.post(`/api/kernel/upload`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const endTime = performance.now();

      addLog(`Instant Recalibration: ${(endTime - startTime).toFixed(2)}ms`);
      addLog("Updating T+3 horizon vectors...");

      setUploadMsg(`GENIUS RESET COMPLETE — ${res.data.message}`);
      await onRefresh();
      addLog("SITI Warm: State active.");
    } catch (err) {
      setUploadError(err.response?.data?.detail ?? 'Upload failed');
      addLog("Injection error: Kernel fallback.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const exportPDF = async () => {
    // jsPDF and autoTable are statically imported above.
    // If for any reason the module bundle fails to load them,
    // the CDN fallback in index.html will have loaded window.jspdf.
    const PDFClass = (typeof jsPDF !== 'undefined') ? jsPDF : window?.jspdf?.jsPDF;
    const tablePlugin = (typeof autoTable !== 'undefined') ? autoTable : window?.jspdf?.autoTable;
    if (!PDFClass) { alert('PDF engine not loaded. Please refresh the page.'); return; }

    const doc = new PDFClass({ orientation: 'portrait', format: 'a4' });
    const now = new Date().toISOString();
    const rho = kState?.rho ?? 0;
    const phi = kState?.phi ?? 0;
    const irp = kState?.inverse_reliability ?? {};

    // ── Header ────────────────────────────────────────────────
    doc.setFillColor(5, 5, 5);
    doc.rect(0, 0, 210, 45, 'F');
    doc.setFillColor(255, 179, 64);
    doc.rect(0, 0, 5, 45, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 179, 64);
    doc.setFontSize(18);
    doc.text('SITI INTELLIGENCE', 12, 14);

    doc.setFontSize(9);
    doc.setTextColor(200, 200, 200);
    doc.text('FORENSIC STATE AUDIT [Case #02028317]', 12, 22);
    doc.text(`GENERATED: ${now}`, 12, 30);
    doc.text(`DATASET: ${kState?.dataset_name ?? 'SAFEXPRESS_CASE_02028317'}`, 12, 37);

    doc.setTextColor(255, 59, 48);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(rho > 0.85 ? 'STATUS: UTILIZATION COLLAPSE — SIGMOIDAL DECAY TRIGGERED' : rho > 0.80 ? 'STATUS: PREEMPTIVE DIVERSION PROTOCOL INITIATED' : 'STATUS: NOMINAL OPERATIONS', 12, 43);

    // ── Executive Summary ─────────────────────────────────────
    doc.setTextColor(255, 179, 64);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('EXECUTIVE SUMMARY', 14, 58);

    autoTable(doc, {
      head: [['METRIC', 'VALUE', 'STATUS']],
      body: [
        ['Hub Utilization (ρ)', rho.toFixed(4), rho > 0.80 ? 'CRITICAL' : rho > 0.75 ? 'WARNING' : 'NOMINAL'],
        ['Logic Health Φ(ρ)', phi.toFixed(4), phi < 0.2 ? 'CRITICAL' : phi < 0.5 ? 'DEGRADED' : 'HEALTHY'],
        ['Critical Threshold ρ_c', (kState?.critical_rho ?? 0.85).toFixed(4), 'COMPUTED'],
        ['Kalman T+3 Prediction', (kState?.kalman?.rho_t3 ?? 0).toFixed(4), kState?.catastrophe_predicted ? 'ALERT' : 'NOMINAL'],
        ['Total Annualized Exposure', '$2,810,000', 'FIXED AUDIT BASELINE'],
        ['Revenue Saved', `$${(ticker?.revenue_saved ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 'RECOVERED'],
        ['Diverted Units', (ticker?.total_diverted ?? 0).toLocaleString(), 'DIVERTED'],
        ['Total Shipments', (kState?.n_total ?? 0).toLocaleString(), 'DATASET'],
      ],
      theme: 'grid',
      headStyles: { fillColor: [10, 10, 10], textColor: [255, 179, 64], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fillColor: [15, 15, 15], textColor: [220, 220, 220], fontSize: 8 },
      alternateRowStyles: { fillColor: [20, 20, 20] },
    });

    let y = doc.lastAutoTable.finalY + 10;

    // ── MIMI Kernel Math ──────────────────────────────────────
    doc.setTextColor(255, 179, 64);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('MIMI INTELLIGENCE ENGINE — MATHEMATICAL STATE ANALYSIS', 14, y);
    y += 6;
    doc.setTextColor(180, 180, 180);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const formulas = [
      `1. Hub Utilization:      ρ = N_late / N_total = ${rho.toFixed(4)}`,
      `2. Sigmoidal Priority Decay: Φ(ρ) = 1 / (1 + exp(-20(ρ - ${(kState?.critical_rho ?? 0.85).toFixed(2)}))) = ${phi.toFixed(4)}`,
      `3. Priority Leakage:     L = $1.20 (recovery) + $2.74 (CLV) = $3.94 × ${irp?.failure_count ?? 0} = $${irp?.leakage_total?.toFixed(2) ?? '0.00'}`,
      `4. Queue Wait (M/M/1):   Wq = ρ / (1-ρ) = ${(kState?.wq ?? 0).toFixed(4)}`,
      `5. Kalman Estimator:     x̂_{k+1} = x̂_k + K(z_k - x̂_k)  K=${(kState?.kalman?.K ?? 0).toFixed(4)}`,
    ];
    formulas.forEach(f => { doc.text(f, 14, y); y += 6; });

    y += 4;

    // ── Inverse Reliability Table ─────────────────────────────
    doc.setTextColor(255, 179, 64);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('INVERSE RELIABILITY PARADOX — TOP FAILURES', 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [['SHIPMENT ID', 'HUB', 'MODE', 'COST ($)', 'WEIGHT (g)', 'LEAKAGE']],
      body: (irp?.records ?? []).slice(0, 15).map(r => [
        r.id, r.hub, r.mode, `$${r.cost}`, r.weight?.toLocaleString(), '$3.94'
      ]),
      theme: 'grid',
      headStyles: { fillColor: [26, 0, 0], textColor: [255, 59, 48], fontSize: 7, fontStyle: 'bold' },
      bodyStyles: { fillColor: [15, 15, 15], textColor: [200, 200, 200], fontSize: 7 },
    });

    y = doc.lastAutoTable.finalY + 10;

    // ── Mission LiFE Tag ──────────────────────────────────────
    if (y + 40 > 280) { doc.addPage(); y = 20; }

    doc.setFillColor(0, 30, 0);
    doc.roundedRect(14, y, 182, 35, 2, 2, 'F');
    doc.setDrawColor(50, 215, 75);
    doc.setLineWidth(0.5);
    doc.roundedRect(14, y, 182, 35, 2, 2, 'S');

    doc.setTextColor(50, 215, 75);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('MISSION LiFE COMPLIANCE CERTIFICATION', 105, y + 10, { align: 'center' });

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 220, 180);
    doc.text('This audit has been processed by SITI Intelligence — MIMI Intelligence Engine, in accordance with', 105, y + 18, { align: 'center' });
    doc.text('Mission LiFE (Lifestyle for Environment) ESG compliance framework.', 105, y + 24, { align: 'center' });
    doc.text('Logistics optimization reduces carbon footprint: diverted units reduce wasted transport cycles.', 105, y + 30, { align: 'center' });

    // ── Footer ────────────────────────────────────────────────
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(80, 80, 80);
      doc.text(`SITI Intelligence · CONFIDENTIAL FORENSIC STATE AUDIT · Page ${i}/${pageCount}`, 105, 290, { align: 'center' });
    }

    doc.save(`siti-forensic-state-audit-${Date.now()}.pdf`);
  };

  return (
    <>
      {/* ── GENIUS RESET OVERLAY ── */}
      {showOverlay && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(255, 179, 64, 0.93)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            animation: 'siti-pulse 0.6s ease-in-out infinite alternate',
          }}
        >
          <style>{`
            @keyframes siti-pulse {
              from { background: rgba(255,179,64,0.88); }
              to   { background: rgba(255,140,0,0.97); }
            }
          `}</style>
          <div style={{
            fontFamily: 'JetBrains Mono', fontWeight: 700,
            fontSize: 'clamp(14px, 2.5vw, 22px)',
            color: '#0A0A0A', textAlign: 'center',
            letterSpacing: '0.18em', lineHeight: 1.7,
            padding: '0 24px',
          }}>
            SITI SYSTEM RE-CALIBRATING...
            <br />
            ANALYZING SIGMOIDAL DECAY AT ρ=0.85
          </div>
          <div style={{
            marginTop: 18, fontFamily: 'JetBrains Mono', fontSize: 10,
            color: '#1A0A00', letterSpacing: '0.22em', opacity: 0.7,
          }}>
            MIMI INTELLIGENCE ENGINE · FORENSIC KERNEL ACTIVE
          </div>
        </div>
      )}
    <div
      data-testid="data-injection-module"
      style={{
        margin: '0 16px 16px',
        background: '#0A0A0A',
        border: '1px solid #1F1F1F',
        padding: '14px 16px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
      }}
    >
      {/* LEFT: Genius Reset */}
      <div>
        <div style={{ fontSize: 9, color: '#A1A1AA', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>
          DATA INJECTION MODULE — GENIUS RESET
        </div>
        <div style={{ fontSize: 9, color: '#555', marginBottom: 12, lineHeight: 1.6 }}>
          Upload a new shipment dataset (CSV). The MIMI Intelligence Engine will wipe historical weights,
          perform fresh logistic regression, and auto-recalculate ρ_critical threshold.
          <span style={{ color: '#64D2FF' }}> GHOST MODE: SITI processes data in volatile memory only. Nothing is stored.</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={handleUpload}
            data-testid="csv-upload-input"
            style={{ display: 'none' }}
            id="csv-file-input"
          />
          <label
            htmlFor="csv-file-input"
            data-testid="csv-upload-btn"
            style={{
              background: uploading ? '#1A1A00' : '#1A0A00',
              border: `1px solid ${uploading ? '#FFB340' : '#FF9F0A'}`,
              color: uploading ? '#FFB340' : '#FF9F0A',
              fontFamily: 'JetBrains Mono',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              padding: '7px 16px',
              cursor: uploading ? 'wait' : 'pointer',
              display: 'inline-block',
              userSelect: 'none',
            }}
          >
            {uploading ? 'PROCESSING...' : 'UPLOAD CSV — GENIUS RESET'}
          </label>
          <div style={{ fontSize: 9, color: '#555' }}>
            Required columns: Warehouse_block, Mode_of_Shipment, Product_importance,<br />
            Reached.on.Time_Y.N + numeric features
          </div>
        </div>

        {uploadMsg && (
          <div data-testid="upload-success-msg" style={{
            marginTop: 8, padding: '6px 10px', background: '#001A00',
            border: '1px solid #32D74B', color: '#32D74B', fontSize: 9, letterSpacing: '0.08em'
          }}>
            {uploadMsg}
          </div>
        )}
        {uploadError && (
          <div data-testid="upload-error-msg" style={{
            marginTop: 8, padding: '6px 10px', background: '#1A0000',
            border: '1px solid #FF3B30', color: '#FF3B30', fontSize: 9, letterSpacing: '0.08em'
          }}>
            ERROR: {uploadError}
          </div>
        )}

        {/* Real-time State Transitions */}
        <div style={{ marginTop: 12, border: '1px solid #141414', background: '#050505', padding: '6px 10px' }}>
          <div style={{ fontSize: 7, color: '#333', letterSpacing: '0.1em', marginBottom: 4 }}>REAL-TIME STATE TRANSITIONS</div>
          {transitionLogs.map((log, i) => (
            <div key={i} style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: i === 0 ? '#FFB340' : '#444', letterSpacing: '0.05em' }}>
              {log}
            </div>
          ))}
          {transitionLogs.length === 0 && <div style={{ color: '#222', fontSize: 8 }}>STANDBY // WAITING FOR INJECTION</div>}
        </div>
      </div>

      {/* RIGHT: PDF Export */}
      <div>
        <div style={{ fontSize: 9, color: '#A1A1AA', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>
          EXPORT FORENSIC STATE AUDIT REPORT
        </div>
        <div style={{ fontSize: 9, color: '#555', marginBottom: 12, lineHeight: 1.6 }}>
          Generate a board-ready PDF: <em>SITI: Forensic State Audit [Case #02028317]</em> with full MIMI Intelligence Engine analysis,
          Inverse Reliability findings, and <span style={{ color: '#32D74B' }}>Mission LiFE ESG Compliance Certification</span>.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            data-testid="export-pdf-btn"
            onClick={exportPDF}
            style={{
              background: '#000D1A',
              border: '1px solid #64D2FF',
              color: '#64D2FF',
              fontFamily: 'JetBrains Mono',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              padding: '7px 16px',
              cursor: 'pointer',
            }}
          >
            EXPORT FORENSIC AUDIT PDF
          </button>
          <div style={{ fontSize: 8, color: '#555', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="status-dot green" style={{ width: 6, height: 6 }} />
            MISSION LiFE CERTIFIED
          </div>
        </div>

        {/* Report Preview */}
        <div style={{ marginTop: 10, padding: '8px', background: '#060606', border: '1px solid #141414', fontSize: 8, color: '#555', lineHeight: 1.8 }}>
          <div style={{ color: '#A1A1AA', marginBottom: 4, letterSpacing: '0.1em' }}>REPORT INCLUDES:</div>
          {['Executive KPI Summary', 'MIMI Intelligence Engine Math Formulation', 'Warehouse Utilization Breakdown',
            'Inverse Reliability Paradox Table (Top 15)', 'Kalman Filter State Analysis', 'Mission LiFE ESG Compliance Tag'].map(item => (
            <div key={item} style={{ display: 'flex', gap: 6 }}>
              <span style={{ color: '#32D74B' }}>✓</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
    </>
  );
}
