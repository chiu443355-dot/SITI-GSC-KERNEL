import { useState, useEffect, useRef, useCallback } from "react";

// ─── Chart.js via CDN loaded dynamically ─────────────────────────────────────
const loadChartJS = () => new Promise((resolve) => {
  if (window.Chart) return resolve(window.Chart);
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js";
  s.onload = () => resolve(window.Chart);
  document.head.appendChild(s);
});

const API_BASE = process.env.REACT_APP_BACKEND_URL || "https://siti-gsc-kernel-1.onrender.com";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:        "#08080f",
  surface:   "#0f0f1a",
  card:      "#141422",
  cardHover: "#1a1a2e",
  border:    "#1e1e35",
  borderHi:  "#2e2e50",
  accent:    "#5b5bd6",
  accentLt:  "#818cf8",
  teal:      "#14b8a6",
  coral:     "#f87171",
  amber:     "#f59e0b",
  emerald:   "#10b981",
  rose:      "#fb7185",
  text:      "#e8e8f0",
  muted:     "#6b6b8a",
  dim:       "#3a3a5c",
};

const FONTS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
`;

// ─── Pricing plans ────────────────────────────────────────────────────────────
const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 9999,
    priceLabel: "₹9,999",
    period: "/month",
    calls: "10,000 API calls",
    hubs: "Up to 5 hubs",
    sms: "50 SMS alerts",
    features: ["Kalman filter predictions", "IRP scoring", "CSV ingestion", "Email support"],
    color: C.teal,
    razorpayAmount: 499900,
    recommended: false,
  },
  {
    id: "growth",
    name: "Growth",
    price: 45999,
    priceLabel: "₹45,999",
    period: "/month",
    calls: "1,00,000 API calls",
    hubs: "Up to 25 hubs",
    sms: "500 SMS alerts",
    features: ["Everything in Starter", "Real-time dashboard", "Twilio SMS alerts", "Priority support", "OpenRouter AI analysis"],
    color: C.accent,
    razorpayAmount: 1499900,
    recommended: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 49999,
    priceLabel: "₹49,999",
    period: "/month",
    calls: "Unlimited calls",
    hubs: "Unlimited hubs",
    sms: "Unlimited alerts",
    features: ["Everything in Growth", "Dedicated kernel instance", "SLA guarantee", "Custom integrations", "Onboarding & training", "99.9% uptime SLA"],
    color: C.amber,
    razorpayAmount: 4999900,
    recommended: false,
  },
];

// ─── Mock analytics data ──────────────────────────────────────────────────────
const MOCK_HUBS = [
  { id: "MUM-CENTRAL", rho: 1.12, mu: 420, queue: 847, risk: "critical", shipments: 12400, delayed: 2890 },
  { id: "DEL-NORTH-02", rho: 0.89, mu: 780, queue: 312, risk: "warning", shipments: 9800, delayed: 980 },
  { id: "BLR-SOUTH-01", rho: 0.61, mu: 950, queue: 180, risk: "safe", shipments: 15200, delayed: 320 },
  { id: "HYD-EAST-03", rho: 0.95, mu: 610, queue: 420, risk: "warning", shipments: 7600, delayed: 760 },
  { id: "CHE-WEST-05", rho: 0.43, mu: 1100, queue: 95, risk: "safe", shipments: 18900, delayed: 190 },
  { id: "PUN-NORTH-01", rho: 0.78, mu: 890, queue: 240, risk: "warning", shipments: 6200, delayed: 480 },
];

const MOCK_KALMAN_SERIES = (() => {
  const pts = 48;
  const raw = [], smoothed = [], predicted = [];
  let k = 0.5, P = 1;
  for (let i = 0; i < pts; i++) {
    const noise = (Math.random() - 0.5) * 0.3;
    const trend = 0.5 + Math.sin(i * 0.2) * 0.2;
    raw.push(+(trend + noise).toFixed(3));
    const z = raw[i], predP = P + 0.01, K = predP / (predP + 0.1);
    k = k + K * (z - k); P = (1 - K) * predP;
    smoothed.push(+k.toFixed(3));
  }
  for (let i = 0; i < 12; i++) predicted.push(+(k + (Math.random() - 0.35) * 0.05 + 0.01).toFixed(3));
  return { raw, smoothed, predicted, labels: Array.from({ length: pts }, (_, i) => `${i}h`) };
})();

// ─── Helpers ──────────────────────────────────────────────────────────────────
const riskColor = (r) => r === "critical" ? C.coral : r === "warning" ? C.amber : C.emerald;
const riskIcon  = (r) => r === "critical" ? "⬤" : r === "warning" ? "▲" : "●";

function Badge({ label, color }) {
  return (
    <span style={{
      background: color + "20", color, border: `1px solid ${color}40`,
      borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600, letterSpacing: "0.3px",
    }}>{label}</span>
  );
}

function StatCard({ label, value, sub, color = C.accentLt, icon }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
      padding: "20px 22px", position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: color, borderRadius: "14px 14px 0 0" }} />
      <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: C.text, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ color, fontSize: 12, marginTop: 6, fontWeight: 500 }}>{sub}</div>}
    </div>
  );
}

// ─── Pie Chart ────────────────────────────────────────────────────────────────
function PieChart({ data, colors, labels, title, subtitle }) {
  const ref = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    loadChartJS().then((Chart) => {
      if (chartRef.current) chartRef.current.destroy();
      if (!ref.current) return;
      chartRef.current = new Chart(ref.current, {
        type: "doughnut",
        data: {
          labels,
          datasets: [{ data, backgroundColor: colors.map(c => c + "cc"), borderColor: colors, borderWidth: 2, hoverOffset: 6 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: "68%",
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: C.card, borderColor: C.borderHi, borderWidth: 1,
              titleColor: C.text, bodyColor: C.muted, padding: 12,
              callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed.toLocaleString()}` },
            },
          },
        },
      });
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [data, colors, labels]);

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px" }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>{subtitle}</div>
      <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
        <div style={{ width: 140, height: 140, flexShrink: 0 }}><canvas ref={ref} /></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          {labels.map((l, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: colors[i], flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 12, color: C.muted }}>{l}</div>
              <div style={{ fontFamily: "monospace", fontSize: 12, color: C.text, fontWeight: 500 }}>
                {data[i].toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Line Chart ───────────────────────────────────────────────────────────────
function KalmanChart() {
  const ref = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    loadChartJS().then((Chart) => {
      if (chartRef.current) chartRef.current.destroy();
      if (!ref.current) return;
      const { raw, smoothed, predicted, labels } = MOCK_KALMAN_SERIES;
      const allLabels = [...labels, ...Array.from({ length: 12 }, (_, i) => `+${i + 1}h`)];

      chartRef.current = new Chart(ref.current, {
        type: "line",
        data: {
          labels: allLabels,
          datasets: [
            {
              label: "Raw sensor",
              data: [...raw, ...Array(12).fill(null)],
              borderColor: C.coral + "88", borderWidth: 1.5,
              pointRadius: 0, tension: 0.3, fill: false,
            },
            {
              label: "Kalman smoothed",
              data: [...smoothed, ...Array(12).fill(null)],
              borderColor: C.teal, borderWidth: 2.5,
              pointRadius: 0, tension: 0.4, fill: false,
            },
            {
              label: "Predicted window",
              data: [...Array(48).fill(null), ...predicted],
              borderColor: C.amber, borderWidth: 2,
              borderDash: [6, 4], pointRadius: 0, tension: 0.3, fill: false,
            },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: {
              display: true, position: "top",
              labels: { color: C.muted, font: { size: 11, family: "JetBrains Mono" }, boxWidth: 20, padding: 16 },
            },
            tooltip: {
              backgroundColor: C.card, borderColor: C.borderHi, borderWidth: 1,
              titleColor: C.text, bodyColor: C.muted, padding: 12,
            },
          },
          scales: {
            x: {
              grid: { color: C.border + "80" },
              ticks: { color: C.muted, font: { size: 10, family: "JetBrains Mono" }, maxTicksLimit: 12 },
            },
            y: {
              grid: { color: C.border + "80" },
              ticks: { color: C.muted, font: { size: 10, family: "JetBrains Mono" } },
              min: 0, max: 1,
            },
          },
        },
      });
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, []);

  return <canvas ref={ref} />;
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────
function HubBarChart() {
  const ref = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    loadChartJS().then((Chart) => {
      if (chartRef.current) chartRef.current.destroy();
      if (!ref.current) return;
      chartRef.current = new Chart(ref.current, {
        type: "bar",
        data: {
          labels: MOCK_HUBS.map(h => h.id),
          datasets: [
            {
              label: "On-time",
              data: MOCK_HUBS.map(h => h.shipments - h.delayed),
              backgroundColor: C.emerald + "99", borderRadius: 4,
            },
            {
              label: "Delayed",
              data: MOCK_HUBS.map(h => h.delayed),
              backgroundColor: C.coral + "99", borderRadius: 4,
            },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: C.muted, font: { size: 11 }, boxWidth: 14 } },
            tooltip: { backgroundColor: C.card, borderColor: C.borderHi, borderWidth: 1, titleColor: C.text, bodyColor: C.muted },
          },
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { color: C.muted, font: { size: 10, family: "JetBrains Mono" } } },
            y: { stacked: true, grid: { color: C.border + "80" }, ticks: { color: C.muted } },
          },
        },
      });
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, []);

  return <canvas ref={ref} />;
}

// ─── CSV Upload ───────────────────────────────────────────────────────────────
function CSVUploadPanel({ apiKey }) {
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const readPreview = (f) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const lines = e.target.result.split("\n").slice(0, 6);
      setPreview(lines);
    };
    reader.readAsText(f);
  };

  const handleFile = (f) => {
    if (!f?.name.endsWith(".csv")) {
      setStatus({ type: "error", msg: "Only .csv files are supported." });
      return;
    }
    setFile(f);
    setStatus(null);
    setResult(null);
    readPreview(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setStatus({ type: "loading", msg: "Uploading and running IRP analysis..." });
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${API_BASE}/api/kernel/reset`, {
        method: "POST",
        headers: { "X-API-Key": apiKey || "demo-key", "X-Tenant-ID": "default" },
        body: form,
      });
      const json = await res.json();
      if (res.ok) {
        setStatus({ type: "success", msg: `Analysis complete. ${json.summary?.total_rows?.toLocaleString() || "—"} rows processed across ${json.summary?.hub_count || "—"} hubs.` });
        setResult(json.summary);
      } else {
        setStatus({ type: "error", msg: json.error || "Upload failed." });
      }
    } catch (e) {
      setStatus({ type: "error", msg: `Network error: ${e.message}` });
    } finally {
      setUploading(false);
    }
  };

  const statusColor = status?.type === "success" ? C.emerald : status?.type === "error" ? C.coral : C.accentLt;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => document.getElementById("csv-file").click()}
        style={{
          border: `2px dashed ${drag ? C.teal : file ? C.accent : C.border}`,
          borderRadius: 14, padding: "40px 24px", textAlign: "center", cursor: "pointer",
          background: drag ? C.teal + "08" : file ? C.accent + "08" : "transparent",
          transition: "all 0.2s",
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 12 }}>📡</div>
        {file ? (
          <>
            <div style={{ color: C.accentLt, fontSize: 15, fontWeight: 600 }}>{file.name}</div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB — click to change</div>
          </>
        ) : (
          <>
            <div style={{ color: C.text, fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Drop your logistics dataset</div>
            <div style={{ color: C.muted, fontSize: 13 }}>Delhivery CSV format · hub_id, arrival_rate, service_rate, shipment_id</div>
          </>
        )}
        <input id="csv-file" type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />
      </div>

      {preview && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "auto" }}>
          <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Preview — first 5 rows
          </div>
          <pre style={{ margin: 0, padding: "12px 14px", fontSize: 11, color: C.muted, fontFamily: "JetBrains Mono, monospace", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {preview.join("\n")}
          </pre>
        </div>
      )}

      {status && (
        <div style={{
          padding: "10px 14px", borderRadius: 8,
          background: statusColor + "15", border: `1px solid ${statusColor}33`,
          color: statusColor, fontSize: 13,
        }}>{status.msg}</div>
      )}

      {file && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          style={{
            background: uploading ? C.dim : C.accent, border: "none", borderRadius: 10,
            padding: "14px", color: "white", fontSize: 14, fontWeight: 600,
            cursor: uploading ? "not-allowed" : "pointer", fontFamily: "inherit",
            transition: "all 0.2s",
          }}
        >
          {uploading ? "Processing..." : "Run Kernel Analysis →"}
        </button>
      )}

      {result && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            { label: "Total Rows", value: result.total_rows?.toLocaleString() || "—" },
            { label: "Hubs Scanned", value: result.hub_count || "—" },
            { label: "Critical Hubs", value: result.hubs?.filter(h => h.risk === "critical").length || 0 },
          ].map((s, i) => (
            <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px", textAlign: "center" }}>
              <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>{s.label}</div>
              <div style={{ color: C.text, fontSize: 22, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Razorpay handler ─────────────────────────────────────────────────────────
function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

function PricingCard({ plan, onBuy }) {
  return (
    <div style={{
      background: plan.recommended ? C.card : C.surface,
      border: `1.5px solid ${plan.recommended ? plan.color : C.border}`,
      borderRadius: 18, padding: "28px 24px",
      position: "relative", overflow: "hidden",
      boxShadow: plan.recommended ? `0 0 40px ${plan.color}20` : "none",
      transition: "transform 0.2s, box-shadow 0.2s",
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = `0 12px 48px ${plan.color}25`; }}
    onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = plan.recommended ? `0 0 40px ${plan.color}20` : "none"; }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: plan.color }} />
      {plan.recommended && (
        <div style={{
          position: "absolute", top: 16, right: 16,
          background: plan.color + "25", color: plan.color,
          border: `1px solid ${plan.color}50`, borderRadius: 20,
          padding: "3px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.5px",
        }}>RECOMMENDED</div>
      )}
      <div style={{ color: plan.color, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>{plan.name}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 6 }}>
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 34, fontWeight: 700, color: C.text }}>{plan.priceLabel}</span>
        <span style={{ color: C.muted, fontSize: 13 }}>{plan.period}</span>
      </div>
      <div style={{ color: C.muted, fontSize: 12, marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
        {plan.calls} · {plan.hubs} · {plan.sms}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
        {plan.features.map((f, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ color: plan.color, fontSize: 13, marginTop: 1, flexShrink: 0 }}>✓</span>
            <span style={{ color: C.muted, fontSize: 13, lineHeight: 1.5 }}>{f}</span>
          </div>
        ))}
      </div>
      <button
        onClick={() => onBuy(plan)}
        style={{
          width: "100%", background: plan.recommended ? plan.color : "transparent",
          border: `1.5px solid ${plan.color}`, borderRadius: 10,
          padding: "13px", color: plan.recommended ? "white" : plan.color,
          fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          transition: "all 0.2s",
        }}
        onMouseEnter={e => { if (!plan.recommended) { e.currentTarget.style.background = plan.color + "20"; } }}
        onMouseLeave={e => { if (!plan.recommended) { e.currentTarget.style.background = "transparent"; } }}
      >
        {plan.id === "enterprise" ? "Contact Sales" : "Buy API Key →"}
      </button>
    </div>
  );
}

// ─── Hub table ────────────────────────────────────────────────────────────────
function HubTable() {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {["Hub ID", "ρ Load Factor", "μ Capacity", "Queue", "Shipments", "Delayed", "IRP Risk"].map(h => (
              <th key={h} style={{ padding: "10px 14px", color: C.muted, fontWeight: 500, textAlign: "left", fontSize: 11, letterSpacing: "0.4px", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MOCK_HUBS.map((hub, i) => {
            const rc = riskColor(hub.risk);
            const delayPct = ((hub.delayed / hub.shipments) * 100).toFixed(1);
            return (
              <tr key={i} style={{ borderBottom: `1px solid ${C.border}15`, transition: "background 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.background = C.cardHover}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <td style={{ padding: "12px 14px", color: C.text, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>{hub.id}</td>
                <td style={{ padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 56, height: 4, background: C.dim, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(hub.rho, 1.3) / 1.3 * 100}%`, height: "100%", background: rc }} />
                    </div>
                    <span style={{ color: rc, fontWeight: 700, fontSize: 12, fontFamily: "monospace" }}>{hub.rho.toFixed(2)}</span>
                  </div>
                </td>
                <td style={{ padding: "12px 14px", color: C.muted, fontFamily: "monospace", fontSize: 12 }}>{hub.mu.toLocaleString()}/hr</td>
                <td style={{ padding: "12px 14px", color: C.text, fontFamily: "monospace" }}>{hub.queue.toLocaleString()}</td>
                <td style={{ padding: "12px 14px", color: C.text, fontFamily: "monospace" }}>{hub.shipments.toLocaleString()}</td>
                <td style={{ padding: "12px 14px" }}>
                  <span style={{ color: rc, fontFamily: "monospace" }}>{hub.delayed.toLocaleString()}</span>
                  <span style={{ color: C.muted, fontSize: 11, marginLeft: 4 }}>({delayPct}%)</span>
                </td>
                <td style={{ padding: "12px 14px" }}>
                  <span style={{
                    background: rc + "18", color: rc, border: `1px solid ${rc}35`,
                    borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600,
                  }}>{riskIcon(hub.risk)} {hub.risk.charAt(0).toUpperCase() + hub.risk.slice(1)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── API Key display ──────────────────────────────────────────────────────────
function APIKeyCard({ apiKey }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Your API Key</div>
        <Badge label="Active" color={C.emerald} />
      </div>
      <div style={{
        background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 8,
        padding: "12px 14px", fontFamily: "JetBrains Mono, monospace", fontSize: 13,
        color: revealed ? C.accentLt : C.muted, letterSpacing: revealed ? "0.5px" : "4px",
        userSelect: revealed ? "text" : "none",
      }}>
        {revealed ? apiKey : "●".repeat(32)}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={() => setRevealed(r => !r)} style={{
          flex: 1, background: "transparent", border: `1px solid ${C.border}`,
          borderRadius: 8, padding: "9px", color: C.muted, fontSize: 12,
          cursor: "pointer", fontFamily: "inherit",
        }}>{revealed ? "Hide Key" : "Reveal Key"}</button>
        <button onClick={copy} style={{
          flex: 1, background: copied ? C.emerald + "20" : C.accent + "20",
          border: `1px solid ${copied ? C.emerald : C.accent}50`,
          borderRadius: 8, padding: "9px", color: copied ? C.emerald : C.accentLt,
          fontSize: 12, cursor: "pointer", fontFamily: "inherit",
        }}>{copied ? "Copied!" : "Copy"}</button>
      </div>
      <div style={{ marginTop: 14, padding: "12px 14px", background: C.surface, borderRadius: 8 }}>
        <div style={{ color: C.muted, fontSize: 11, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Usage example</div>
        <pre style={{ margin: 0, fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: C.accentLt, whiteSpace: "pre-wrap" }}>
{`fetch("${API_BASE}/api/hubs", {
  headers: { "X-API-Key": "${revealed ? apiKey : "YOUR_KEY"}" }
})`}
        </pre>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [kernelStatus, setKernelStatus] = useState("Connecting");
  const [apiKey, setApiKey] = useState("siti-admin-key-001");
  const [purchasedKey, setPurchasedKey] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then(r => r.ok ? setKernelStatus("Online") : setKernelStatus("Degraded"))
      .catch(() => setKernelStatus("Offline"));
  }, []);

  const handleBuy = async (plan) => {
    if (plan.id === "enterprise") {
      alert("For Enterprise plans, contact: sales@siti.ai");
      return;
    }
    const ok = await loadRazorpay();
    if (!ok) { alert("Could not load payment gateway. Please try again."); return; }

    const options = {
      key: process.env.REACT_APP_RAZORPAY_KEY || "rzp_test_YourKeyHere",
      amount: plan.razorpayAmount,
      currency: "INR",
      name: "SITI Intelligence",
      description: `${plan.name} Plan — API Access`,
      image: "https://siti-gsc-kernel.vercel.app/favicon.ico",
      handler: (response) => {
        const generatedKey = `siti-${plan.id}-${Date.now().toString(36).toUpperCase()}`;
        setPurchasedKey(generatedKey);
        setPaymentStatus({ plan: plan.name, paymentId: response.razorpay_payment_id });
        setTab("keys");
      },
      prefill: { name: "", email: "", contact: "" },
      theme: { color: plan.color },
      modal: { ondismiss: () => {} },
    };
    new window.Razorpay(options).open();
  };

  const TABS = [
    { id: "dashboard", label: "Dashboard" },
    { id: "analytics", label: "Analytics" },
    { id: "upload",    label: "CSV Upload" },
    { id: "pricing",   label: "API Pricing" },
    { id: "keys",      label: "API Keys" },
    { id: "docs",      label: "Docs" },
  ];

  const statusColor = kernelStatus === "Online" ? C.emerald : kernelStatus === "Offline" ? C.coral : C.amber;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Syne', sans-serif" }}>
      <style>{FONTS}</style>

      {/* ── Topbar ── */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", height: 58, gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: `linear-gradient(135deg, ${C.accent} 0%, ${C.teal} 100%)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 800, fontSize: 14,
            }}>S</div>
            <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.3px" }}>SITI Intelligence</span>
            <span style={{ color: C.muted, fontSize: 11, fontFamily: "JetBrains Mono, monospace", marginLeft: 2 }}>v2.0</span>
          </div>
          <div style={{ display: "flex", gap: 2, flex: 1 }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                background: tab === t.id ? C.accent + "20" : "transparent",
                border: "none", borderBottom: `2px solid ${tab === t.id ? C.accent : "transparent"}`,
                color: tab === t.id ? C.accentLt : C.muted,
                padding: "10px 14px", fontSize: 13, cursor: "pointer",
                fontFamily: "inherit", fontWeight: tab === t.id ? 600 : 400,
                transition: "all 0.15s", whiteSpace: "nowrap",
              }}>{t.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: statusColor, flexShrink: 0 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
            Kernel {kernelStatus}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px" }}>

        {/* ══ DASHBOARD ══ */}
        {tab === "dashboard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 8px", letterSpacing: "-0.5px" }}>
                The Inverse Reliability Paradox
              </h1>
              <p style={{ color: C.muted, fontSize: 14, margin: 0, lineHeight: 1.8, maxWidth: 640 }}>
                At 100M+ shipments, traditional tracking doesn't just lag — it breaks structurally.
                SITI predicts network failure before the cascade begins, using Kalman filtering and
                M/M/1 queueing theory applied to real logistics data.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
              <StatCard label="Total Shipments" value="70.1K" sub="▲ +12.3% this week" color={C.accentLt} />
              <StatCard label="IRP Score" value="8.7" sub="▼ Critical — 1 hub" color={C.coral} />
              <StatCard label="Kalman Accuracy" value="96.2%" sub="▲ +0.8% vs baseline" color={C.teal} />
              <StatCard label="Avg Delay Prob." value="18.4%" sub="▼ Predicted next 2h" color={C.amber} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              <PieChart
                title="Shipment Status"
                subtitle="Across all 6 monitored hubs"
                data={[62100, 11420, 3380]}
                labels={["On-time", "Delayed", "Critical"]}
                colors={[C.emerald, C.amber, C.coral]}
              />
              <PieChart
                title="Risk Distribution"
                subtitle="By hub load factor (ρ)"
                data={[2, 3, 1]}
                labels={["Healthy (ρ < 0.85)", "Warning (ρ 0.85–1.0)", "Critical (ρ > 1.0)"]}
                colors={[C.emerald, C.amber, C.coral]}
              />
              <PieChart
                title="API Usage"
                subtitle="Last 30 days"
                data={[72400, 18200, 9400]}
                labels={["Kernel calls", "Prediction calls", "Reset/Upload"]}
                colors={[C.accent, C.teal, C.accentLt]}
              />
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Kalman Filter — Live Delay Probability</div>
                  <div style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>48-hour history + 12-hour prediction window · MUM-CENTRAL-04</div>
                </div>
                <Badge label="LIVE" color={C.teal} />
              </div>
              <div style={{ height: 220 }}><KalmanChart /></div>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.accent}30`, borderRadius: 14, padding: "20px" }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>The Mathematics Behind SITI</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {[
                  { label: "Load Factor ρ", formula: "λ / μ", color: C.coral, desc: "Arrival rate λ divided by service rate μ. When ρ > 1.0, the hub is overloaded — shipments accumulate faster than they're processed." },
                  { label: "IRP Score", formula: "φ · ln(N + 1)", color: C.accentLt, desc: "The Inverse Reliability Paradox: at scale N, the phi-weighted logarithmic term captures non-linear reliability degradation." },
                  { label: "Kalman State", formula: "x̂ₜ + K(zₜ − x̂ₜ)", color: C.teal, desc: "Optimal state estimate updated by Kalman gain K, blending prior prediction x̂ₜ with noisy observation zₜ." },
                ].map((m, i) => (
                  <div key={i} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "18px" }}>
                    <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>{m.label}</div>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 22, color: m.color, fontWeight: 500, marginBottom: 10 }}>{m.formula}</div>
                    <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.7 }}>{m.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ ANALYTICS ══ */}
        {tab === "analytics" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 6px" }}>Hub Network Analytics</h2>
              <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Live load factor, capacity, and delay metrics across all monitored hubs.</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              {MOCK_HUBS.slice(0, 3).map((hub, i) => {
                const rc = riskColor(hub.risk);
                const delayPct = ((hub.delayed / hub.shipments) * 100).toFixed(1);
                return (
                  <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: rc }} />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, fontWeight: 600, color: C.text }}>{hub.id}</div>
                      <Badge label={hub.risk.toUpperCase()} color={rc} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      {[
                        { k: "Load ρ", v: hub.rho.toFixed(2), c: rc },
                        { k: "Capacity μ", v: hub.mu.toLocaleString(), c: C.muted },
                        { k: "Queue", v: hub.queue.toLocaleString(), c: C.text },
                        { k: "Delay", v: `${delayPct}%`, c: rc },
                      ].map((s, j) => (
                        <div key={j}>
                          <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 }}>{s.k}</div>
                          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 16, fontWeight: 600, color: s.c }}>{s.v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px" }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Shipment Volume by Hub</div>
              <div style={{ color: C.muted, fontSize: 12, marginBottom: 16 }}>On-time vs delayed breakdown across all monitored hubs</div>
              <div style={{ height: 240 }}><HubBarChart /></div>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "8px 0" }}>
              <div style={{ padding: "14px 20px 10px", fontSize: 15, fontWeight: 700 }}>Full Hub Intelligence Table</div>
              <HubTable />
            </div>
          </div>
        )}

        {/* ══ CSV UPLOAD ══ */}
        {tab === "upload" && (
          <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 6px" }}>Dataset Upload</h2>
              <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
                Upload a Delhivery-format CSV to reset the kernel and rerun the full IRP analysis pipeline.
              </p>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "24px" }}>
              <CSVUploadPanel apiKey={apiKey} />
            </div>

            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px" }}>
              <div style={{ color: C.amber, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>Required CSV columns</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { col: "hub_id", desc: "Unique hub identifier, e.g. MUM-CENTRAL-04" },
                  { col: "shipment_id", desc: "Unique shipment tracking number" },
                  { col: "arrival_rate", desc: "Shipments arriving per hour (λ)" },
                  { col: "service_rate", desc: "Shipments processed per hour (μ)" },
                ].map((c, i) => (
                  <div key={i} style={{ background: C.card, borderRadius: 8, padding: "12px 14px" }}>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: C.accentLt, marginBottom: 4 }}>{c.col}</div>
                    <div style={{ color: C.muted, fontSize: 12 }}>{c.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px" }}>
              <div style={{ color: C.accentLt, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>What the kernel does on upload</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  "Clears all existing in-memory hub state for your tenant",
                  "Parses and validates every row against the schema",
                  "Computes ρ = λ/μ and IRP score per hub using the Phi sigmoidal function",
                  "Runs Kalman filter initialisation across the dataset",
                  "Fires Twilio SMS for any hub where ρ exceeds 1.0",
                  "Returns a full summary with hub-level risk classification",
                ].map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ color: C.accent, fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{i + 1}.</span>
                    <span style={{ color: C.muted, fontSize: 13, lineHeight: 1.6 }}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ PRICING ══ */}
        {tab === "pricing" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <div style={{ textAlign: "center" }}>
              <h2 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 8px" }}>API Access Pricing</h2>
              <p style={{ color: C.muted, fontSize: 14, margin: 0 }}>
                Secure your API key instantly via Razorpay. No contracts. Cancel anytime.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18 }}>
              {PLANS.map(plan => <PricingCard key={plan.id} plan={plan} onBuy={handleBuy} />)}
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "24px" }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Compare Plans</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th style={{ padding: "10px 16px", textAlign: "left", color: C.muted, fontWeight: 500, fontSize: 12 }}>Feature</th>
                    {PLANS.map(p => <th key={p.id} style={{ padding: "10px 16px", textAlign: "center", color: p.color, fontWeight: 700, fontSize: 12 }}>{p.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["API calls / month", "10,000", "1,00,000", "Unlimited"],
                    ["Monitored hubs", "5", "25", "Unlimited"],
                    ["SMS alerts", "50", "500", "Unlimited"],
                    ["Kalman predictions", "✓", "✓", "✓"],
                    ["IRP scoring", "✓", "✓", "✓"],
                    ["OpenRouter AI analysis", "—", "✓", "✓"],
                    ["Real-time dashboard", "—", "✓", "✓"],
                    ["Dedicated instance", "—", "—", "✓"],
                    ["SLA guarantee", "—", "—", "✓"],
                  ].map((row, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}15` }}>
                      <td style={{ padding: "11px 16px", color: C.muted, fontSize: 13 }}>{row[0]}</td>
                      {row.slice(1).map((cell, j) => (
                        <td key={j} style={{ padding: "11px 16px", textAlign: "center", color: cell === "—" ? C.dim : cell === "✓" ? C.emerald : C.text, fontWeight: cell === "✓" || cell === "—" ? 600 : 400, fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ background: C.surface, borderRadius: 12, padding: "18px 24px", border: `1px solid ${C.border}`, display: "flex", gap: 20, alignItems: "center" }}>
              <div style={{ fontSize: 28 }}>🔒</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>Secure payments via Razorpay</div>
                <div style={{ color: C.muted, fontSize: 13 }}>All transactions are PCI-DSS compliant. Your API key is generated instantly on successful payment and stored securely in Supabase Vault.</div>
              </div>
            </div>
          </div>
        )}

        {/* ══ API KEYS ══ */}
        {tab === "keys" && (
          <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 6px" }}>API Keys</h2>
              <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Your active keys for the SITI Intelligence API.</p>
            </div>

            {paymentStatus && (
              <div style={{ background: C.emerald + "15", border: `1px solid ${C.emerald}40`, borderRadius: 12, padding: "16px 20px" }}>
                <div style={{ color: C.emerald, fontWeight: 700, marginBottom: 4 }}>Payment successful</div>
                <div style={{ color: C.muted, fontSize: 13 }}>{paymentStatus.plan} plan · Payment ID: {paymentStatus.paymentId}</div>
              </div>
            )}

            {purchasedKey ? (
              <APIKeyCard apiKey={purchasedKey} />
            ) : (
              <APIKeyCard apiKey={apiKey} />
            )}

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Quick Start</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { method: "GET",  path: "/health",              desc: "Kernel health check" },
                  { method: "GET",  path: "/api/hubs",            desc: "All hub IRP scores" },
                  { method: "GET",  path: "/api/kernel/status",   desc: "Full kernel state" },
                  { method: "POST", path: "/api/kernel/reset",    desc: "Upload CSV + run analysis" },
                  { method: "POST", path: "/api/kernel/predict",  desc: "Kalman prediction for a hub" },
                  { method: "POST", path: "/api/kernel/analyze",  desc: "AI plain-English explanation" },
                ].map((e, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: C.surface, borderRadius: 8 }}>
                    <span style={{
                      fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 700,
                      color: e.method === "GET" ? C.teal : C.amber,
                      background: (e.method === "GET" ? C.teal : C.amber) + "20",
                      border: `1px solid ${(e.method === "GET" ? C.teal : C.amber)}40`,
                      borderRadius: 4, padding: "2px 6px", flexShrink: 0,
                    }}>{e.method}</span>
                    <code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: C.accentLt, flex: 1 }}>{e.path}</code>
                    <span style={{ color: C.muted, fontSize: 12 }}>{e.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ DOCS ══ */}
        {tab === "docs" && (
          <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 6px" }}>Documentation</h2>
              <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Integration guide for the SITI GSC Kernel API.</p>
            </div>

            {[
              {
                title: "Authentication",
                content: `All requests require an X-API-Key header. Pass your key on every request:\n\nfetch("${API_BASE}/api/hubs", {\n  headers: { "X-API-Key": "your-key-here" }\n})`,
              },
              {
                title: "POST /api/kernel/reset — Upload & Analyze",
                content: `Upload a CSV file to reset the kernel state and run full IRP analysis.\n\nconst form = new FormData();\nform.append("file", csvFile);\n\nfetch("${API_BASE}/api/kernel/reset", {\n  method: "POST",\n  headers: { "X-API-Key": "your-key", "X-Tenant-ID": "your-org" },\n  body: form\n});`,
              },
              {
                title: "POST /api/kernel/predict — Kalman Prediction",
                content: `Run a Kalman filter prediction for a specific hub.\n\nfetch("${API_BASE}/api/kernel/predict", {\n  method: "POST",\n  headers: { "X-API-Key": "your-key", "Content-Type": "application/json" },\n  body: JSON.stringify({\n    hub_id: "MUM-CENTRAL-04",\n    observations: [0.3, 0.45, 0.62, 0.78]\n  })\n});\n\n// Returns: { smoothed: [...], predicted: [...], current_delay_prob: 0.81 }`,
              },
              {
                title: "Response: Hub Risk Levels",
                content: `Every hub in the response carries a risk field:\n\n{\n  "hub_id": "MUM-CENTRAL-04",\n  "rho": 1.12,          // > 1.0 = overloaded\n  "irp_score": 8.7,    // 0-10, higher = worse\n  "risk": "critical"   // "safe" | "warning" | "critical"\n}`,
              },
            ].map((section, i) => (
              <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, fontSize: 14, fontWeight: 700 }}>{section.title}</div>
                <pre style={{ margin: 0, padding: "18px 20px", fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: C.accentLt, whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.8 }}>
                  {section.content}
                </pre>
              </div>
            ))}

            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>Support</div>
              <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.8 }}>
                For API questions, integration support, or enterprise inquiries:<br />
                <span style={{ color: C.accentLt }}>support@siti.ai</span> · Response within 24 hours on Growth and Enterprise plans.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
