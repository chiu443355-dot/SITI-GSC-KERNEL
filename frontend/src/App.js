import { useState, useEffect, useRef, useCallback } from "react";

// ── Config ───────────────────────────────────────────────────────────────────
const API_BASE  = (process.env.REACT_APP_BACKEND_URL || "https://siti-gsc-kernel-1.onrender.com").replace(/\/$/, "");
const API_KEY   = process.env.REACT_APP_API_KEY || "siti-admin-key-001";
const WA_NUMBER = "918956493671";
const WA_SUPPORT_MSG = encodeURIComponent(
  "Hi! I came from SITI Intelligence. I'd like to know more about your logistics platform."
);

// ── Fonts ─────────────────────────────────────────────────────────────────────
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');`;

// ── Color Palette ─────────────────────────────────────────────────────────────
const C = {
  bg: "#08080f", surface: "#0f0f1a", card: "#141422", cardHover: "#1a1a2e",
  border: "#1e1e35", borderHi: "#2e2e50", accent: "#5b5bd6", accentLt: "#818cf8",
  teal: "#14b8a6", coral: "#f87171", amber: "#f59e0b", emerald: "#10b981",
  rose: "#fb7185", text: "#e8e8f0", muted: "#6b6b8a", dim: "#3a3a5c",
};

// ── Chart JS Lazy Loader ──────────────────────────────────────────────────────
const loadChartJS = () => new Promise((resolve) => {
  if (window.Chart) return resolve(window.Chart);
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js";
  s.onload = () => resolve(window.Chart);
  document.head.appendChild(s);
});

// ── Pricing Plans ─────────────────────────────────────────────────────────────
const PLANS = [
  {
    id: "pilot",
    name: "Pilot",
    priceLabel: "₹9,999",
    priceNum: 9999,
    period: "/month",
    tagline: "30-day proof of value. No commitment.",
    calls: "5,000 API calls",
    hubs: "Up to 3 hubs",
    sms: "30 SMS alerts",
    features: [
      "Kalman filter delay predictions",
      "IRP score per hub",
      "CSV dataset ingestion",
      "Email support within 48h",
      "Upgrade anytime, no penalty",
    ],
    color: C.teal,
    recommended: false,
    cta: "Start Pilot →",
  },
  {
    id: "growth",
    name: "Growth",
    priceLabel: "₹45,999",
    priceNum: 45999,
    period: "/month",
    tagline: "For 3PLs processing 10K–500K shipments/month.",
    calls: "1,00,000 API calls",
    hubs: "Up to 25 hubs",
    sms: "500 SMS alerts",
    features: [
      "Everything in Pilot",
      "Twilio SMS alerts",
      "AI failure explanation",
      "Real-time hub dashboard",
      "Priority support within 12h",
      "Dedicated API key per tenant",
    ],
    color: C.accent,
    recommended: true,
    cta: "Activate Growth →",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    priceLabel: "₹75,000+",
    priceNum: null,
    period: "/month",
    tagline: "Dedicated instance. SLA-backed. Built for scale.",
    calls: "Unlimited calls",
    hubs: "Unlimited hubs",
    sms: "Unlimited alerts",
    features: [
      "Everything in Growth",
      "Dedicated kernel on your infra",
      "99.9% uptime SLA",
      "Custom CSV schema mapping",
      "Onboarding + training session",
      "Direct engineering line",
    ],
    color: C.amber,
    recommended: false,
    cta: "WhatsApp Us →",
  },
];

const ROI_SAVINGS = Math.round(50000 * 0.12 * 1200 * 0.15);

// ── API Helper ────────────────────────────────────────────────────────────────
async function apiCall(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = {
    "X-API-Key": API_KEY,
    ...options.headers,
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(err.error || "API Error"), { status: res.status, data: err });
  }
  return res.json();
}

// ── Small Components ──────────────────────────────────────────────────────────
function Badge({ label, color }) {
  return (
    <span style={{
      background: color + "20", color, border: `1px solid ${color}40`,
      borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600
    }}>{label}</span>
  );
}

function StatCard({ label, value, sub, color = C.accentLt, loading = false }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
      padding: "20px 22px", position: "relative", overflow: "hidden"
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: color }} />
      <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: loading ? C.dim : C.text, lineHeight: 1 }}>
        {loading ? "···" : value}
      </div>
      {sub && <div style={{ color, fontSize: 12, marginTop: 6, fontWeight: 500 }}>{sub}</div>}
    </div>
  );
}

// ── Hub Card ──────────────────────────────────────────────────────────────────
function HubCard({ hub }) {
  const rc = hub.risk === "critical" ? C.coral : hub.risk === "warning" ? C.amber : C.emerald;
  const rhoPct = Math.min(hub.rho * 100, 100);
  return (
    <div style={{
      background: C.card, border: `1px solid ${rc}44`, borderRadius: 14, padding: "18px",
      position: "relative", overflow: "hidden", transition: "border-color 0.3s"
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: rc }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, fontWeight: 700, color: C.text }}>
          {hub.hub_id}
        </div>
        <Badge label={hub.risk.toUpperCase()} color={rc} />
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: rc, marginBottom: 8 }}>
        ρ = {hub.rho.toFixed(4)}
      </div>
      <div style={{ height: 4, background: C.dim, borderRadius: 2, marginBottom: 10, overflow: "hidden", position: "relative" }}>
        <div style={{ width: `${rhoPct}%`, height: "100%", background: rc, transition: "width 0.5s" }} />
        <div style={{ position: "absolute", left: "85%", top: 0, bottom: 0, width: 1, background: C.coral }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[
          { k: "λ arrival",   v: `${hub.lambda.toFixed(2)}/hr`,  c: C.accentLt },
          { k: "μ capacity",  v: `${hub.mu.toFixed(2)}/hr`,      c: C.emerald },
          { k: "Shipments",   v: hub.shipments?.toLocaleString(), c: C.text },
          { k: "IRP Score",   v: `${hub.irp_score?.toFixed(2)}/10`, c: hub.irp_score > 7 ? C.coral : C.amber },
        ].map((s, i) => (
          <div key={i} style={{ background: C.surface, borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 }}>{s.k}</div>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 14, fontWeight: 600, color: s.c }}>{s.v || "—"}</div>
          </div>
        ))}
      </div>
      {hub.kalman_t3 != null && (
        <div style={{ marginTop: 10, padding: "8px 10px", background: C.surface, borderRadius: 8 }}>
          <div style={{ color: C.muted, fontSize: 10, marginBottom: 2 }}>KALMAN T+3 FORECAST</div>
          <div style={{
            fontFamily: "JetBrains Mono, monospace", fontSize: 14, fontWeight: 700,
            color: hub.kalman_t3 >= 0.85 ? C.coral : hub.kalman_t3 > 0.70 ? C.amber : C.emerald
          }}>
            ρ = {hub.kalman_t3.toFixed(4)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Donut Chart ───────────────────────────────────────────────────────────────
function PieChart({ data, colors, labels, title, subtitle }) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  useEffect(() => {
    loadChartJS().then((Chart) => {
      if (chartRef.current) chartRef.current.destroy();
      if (!ref.current) return;
      chartRef.current = new Chart(ref.current, {
        type: "doughnut",
        data: { labels, datasets: [{ data, backgroundColor: colors.map(c => c + "cc"), borderColor: colors, borderWidth: 2, hoverOffset: 6 }] },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: "68%",
          plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: C.card, borderColor: C.borderHi, borderWidth: 1, titleColor: C.text, bodyColor: C.muted, padding: 12 },
          },
        },
      });
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [JSON.stringify(data)]);
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
              <div style={{ fontFamily: "monospace", fontSize: 12, color: C.text, fontWeight: 500 }}>{data[i]?.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── CSV Upload Panel ──────────────────────────────────────────────────────────
function CSVUploadPanel() {
  const [drag, setDrag]       = useState(false);
  const [file, setFile]       = useState(null);
  const [status, setStatus]   = useState(null);
  const [result, setResult]   = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = (f) => {
    if (!f?.name?.toLowerCase().endsWith(".csv")) {
      setStatus({ type: "error", msg: "Only .csv files are supported." });
      return;
    }
    setFile(f);
    setStatus(null);
    setResult(null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setStatus({ type: "loading", msg: "Running MIMI Kernel analysis..." });
    const form = new FormData();
    form.append("file", file);
    try {
      // BUG-003 FIX: Backend now auto-maps Kaggle columns
      const data = await apiCall("/api/kernel/reset", {
        method: "POST",
        headers: { "X-Tenant-ID": "default" },
        body: form,
      });
      setStatus({
        type: "success",
        msg: `Analysis complete — ${data.summary?.total_rows?.toLocaleString()} rows, ${data.summary?.hub_count} hubs detected.`
      });
      setResult(data.summary);
    } catch (e) {
      setStatus({ type: "error", msg: e.message || "Upload failed." });
    } finally {
      setUploading(false);
    }
  };

  const sc = status?.type === "success" ? C.emerald : status?.type === "error" ? C.coral : C.accentLt;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => document.getElementById("csv-file-main").click()}
        style={{
          border: `2px dashed ${drag ? C.teal : file ? C.accent : C.border}`,
          borderRadius: 14, padding: "40px 24px", textAlign: "center",
          cursor: "pointer", background: drag ? C.teal + "08" : file ? C.accent + "08" : "transparent",
          transition: "all 0.2s"
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
            <div style={{ color: C.muted, fontSize: 13 }}>Kaggle e-commerce CSV, Delhivery, or any hub data — auto-mapped</div>
          </>
        )}
        <input id="csv-file-main" type="file" accept=".csv" style={{ display: "none" }}
          onChange={e => handleFile(e.target.files[0])} />
      </div>

      {status && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: sc + "15", border: `1px solid ${sc}33`, color: sc, fontSize: 13 }}>
          {status.msg}
        </div>
      )}

      {file && (
        <button onClick={handleUpload} disabled={uploading}
          style={{
            background: uploading ? C.dim : C.accent, border: "none", borderRadius: 10,
            padding: "14px", color: "white", fontSize: 14, fontWeight: 600,
            cursor: uploading ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "all 0.2s"
          }}>
          {uploading ? "Processing Dataset..." : "Run Kernel Analysis →"}
        </button>
      )}

      {result && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            { label: "Total Rows",      value: result.total_rows?.toLocaleString() || "—" },
            { label: "Hubs Scanned",    value: result.hub_count || "—" },
            { label: "Critical Hubs",   value: result.hubs?.filter(h => h.risk === "critical").length ?? 0 },
          ].map((s, i) => (
            <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px", textAlign: "center" }}>
              <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>{s.label}</div>
              <div style={{ color: C.text, fontSize: 22, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {result?.hubs?.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Hub Analysis Results</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {result.hubs.slice(0, 6).map((hub, i) => (
              <HubCard key={i} hub={hub} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── API Key Card ──────────────────────────────────────────────────────────────
function APIKeyCard({ apiKey }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied]     = useState(false);
  const copy = () => { navigator.clipboard.writeText(apiKey); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Your API Key</div>
        <Badge label="Active" color={C.emerald} />
      </div>
      <div style={{
        background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 8,
        padding: "12px 14px", fontFamily: "JetBrains Mono, monospace", fontSize: 13,
        color: revealed ? C.accentLt : C.muted, letterSpacing: revealed ? "0.5px" : "4px", userSelect: revealed ? "text" : "none"
      }}>
        {revealed ? apiKey : "●".repeat(32)}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={() => setRevealed(r => !r)}
          style={{ flex: 1, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px", color: C.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          {revealed ? "Hide Key" : "Reveal Key"}
        </button>
        <button onClick={copy}
          style={{ flex: 1, background: copied ? C.emerald + "20" : C.accent + "20", border: `1px solid ${copied ? C.emerald : C.accent}50`, borderRadius: 8, padding: "9px", color: copied ? C.emerald : C.accentLt, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div style={{ marginTop: 14, padding: "12px 14px", background: C.surface, borderRadius: 8 }}>
        <div style={{ color: C.muted, fontSize: 11, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Usage</div>
        <pre style={{ margin: 0, fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: C.accentLt, whiteSpace: "pre-wrap" }}>
{`fetch("${API_BASE}/api/hubs", {
  headers: { "X-API-Key": "${revealed ? apiKey : "YOUR_KEY"}" }
})`}
        </pre>
      </div>
    </div>
  );
}

// ── Pricing Card ──────────────────────────────────────────────────────────────
function PricingCard({ plan, onBuy }) {
  return (
    <div
      style={{
        background: plan.recommended ? C.card : C.surface,
        border: `1.5px solid ${plan.recommended ? plan.color : C.border}`,
        borderRadius: 18, padding: "28px 24px", position: "relative", overflow: "hidden",
        boxShadow: plan.recommended ? `0 0 40px ${plan.color}20` : "none",
        transition: "transform 0.2s, box-shadow 0.2s"
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = `0 12px 48px ${plan.color}25`; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = plan.recommended ? `0 0 40px ${plan.color}20` : "none"; }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: plan.color }} />
      {plan.recommended && (
        <div style={{ position: "absolute", top: 16, right: 16, background: plan.color + "25", color: plan.color, border: `1px solid ${plan.color}50`, borderRadius: 20, padding: "3px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.5px" }}>
          RECOMMENDED
        </div>
      )}
      <div style={{ color: plan.color, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>{plan.name}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 32, fontWeight: 700, color: C.text }}>{plan.priceLabel}</span>
        <span style={{ color: C.muted, fontSize: 13 }}>{plan.period}</span>
      </div>
      <div style={{ color: C.muted, fontSize: 12, marginBottom: 16, fontStyle: "italic" }}>{plan.tagline}</div>
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
      <button onClick={() => onBuy(plan)}
        style={{
          width: "100%", background: plan.recommended ? plan.color : "transparent",
          border: `1.5px solid ${plan.color}`, borderRadius: 10, padding: "13px",
          color: plan.recommended ? "white" : plan.color, fontSize: 14, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s"
        }}
        onMouseEnter={e => { if (!plan.recommended) e.currentTarget.style.background = plan.color + "20"; }}
        onMouseLeave={e => { if (!plan.recommended) e.currentTarget.style.background = "transparent"; }}>
        {plan.cta}
      </button>
    </div>
  );
}

// ── Contact Section ───────────────────────────────────────────────────────────
function ContactSection() {
  const [name, setName]       = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");

  const sendToWhatsApp = () => {
    const msg = encodeURIComponent(
      `Hi! I'm ${name || "a logistics professional"} from ${company || "a logistics company"}.\n\n${message || "I'd like to know more about SITI Intelligence."}\n\n— via SITI Intelligence website`
    );
    window.open(`https://wa.me/${WA_NUMBER}?text=${msg}`, "_blank");
  };

  const inputStyle = {
    width: "100%", background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: 8, padding: "10px 14px", color: C.text, fontSize: 13,
    fontFamily: "inherit", outline: "none", boxSizing: "border-box"
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 8px" }}>Get in Touch</h2>
        <p style={{ color: C.muted, fontSize: 14, margin: 0 }}>Response within 2 hours on WhatsApp.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, flexWrap: "wrap" }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Send a message</div>
          {[
            { label: "Your Name",   val: name,    set: setName,    ph: "Priya Sharma" },
            { label: "Company",     val: company, set: setCompany, ph: "Safexpress / Gati / Your 3PL" },
          ].map(({ label, val, set, ph }) => (
            <div key={label}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>{label}</div>
              <input value={val} onChange={e => set(e.target.value)} placeholder={ph} style={inputStyle} />
            </div>
          ))}
          <div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Message</div>
            <textarea value={message} onChange={e => setMessage(e.target.value)}
              placeholder="I want to run SITI on our shipment data..." rows={4}
              style={{ ...inputStyle, resize: "vertical" }} />
          </div>
          <button onClick={sendToWhatsApp}
            style={{ background: "#25D366", border: "none", borderRadius: 10, padding: "13px", color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            💬 Send via WhatsApp
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { icon: "💬", title: "WhatsApp (Fastest)", desc: "Within 2 hours, 9AM–9PM IST", action: "Chat Now", color: "#25D366", href: `https://wa.me/${WA_NUMBER}?text=${WA_SUPPORT_MSG}` },
            { icon: "📧", title: "Email", desc: "support@siti-intelligence.io — 24h", action: "Send Email", color: C.accentLt, href: "mailto:support@siti-intelligence.io?subject=SITI Enquiry" },
            { icon: "🏢", title: "Enterprise Demo", desc: "30-min live demo for your ops team", action: "Book Demo", color: C.amber, href: `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent("Hi! I'd like to book a live demo of SITI Intelligence for our enterprise team.")}` },
          ].map((item, i) => (
            <a key={i} href={item.href} target="_blank" rel="noreferrer"
              style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px", display: "flex", gap: 14, alignItems: "center", textDecoration: "none", transition: "border-color 0.2s, transform 0.2s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = item.color + "66"; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = ""; }}>
              <span style={{ fontSize: 28, flexShrink: 0 }}>{item.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 3 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{item.desc}</div>
              </div>
              <span style={{ color: item.color, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{item.action} →</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Dashboard Tab — Live Kernel Data ──────────────────────────────────────────
function DashboardTab() {
  const [kernelData, setKernelData] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const intervalRef = useRef(null);

  const fetchKernel = useCallback(async () => {
    try {
      const data = await apiCall("/api/kernel/status");
      setKernelData(data);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKernel();
    intervalRef.current = setInterval(fetchKernel, 8000); // refresh every 8s
    return () => clearInterval(intervalRef.current);
  }, [fetchKernel]);

  const hubs    = kernelData?.hubs || [];
  const critCt  = hubs.filter(h => h.risk === "critical").length;
  const warnCt  = hubs.filter(h => h.risk === "warning").length;
  const avgRho  = hubs.length > 0 ? (hubs.reduce((a, h) => a + h.rho, 0) / hubs.length).toFixed(4) : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 8px", letterSpacing: "-0.5px" }}>The Inverse Reliability Paradox</h1>
          <p style={{ color: C.muted, fontSize: 14, margin: 0, lineHeight: 1.8, maxWidth: 600 }}>
            At 100M+ shipments, traditional tracking breaks structurally.
            SITI predicts network failure before cascade using Kalman filtering + M/M/1 queueing theory.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: loading ? C.amber : error ? C.coral : C.emerald }} />
          <span style={{ color: C.muted, fontSize: 12 }}>{loading ? "Connecting..." : error ? "Error" : "Live"}</span>
          <button onClick={fetchKernel}
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 14px", color: C.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", background: C.coral + "15", border: `1px solid ${C.coral}33`, borderRadius: 10, color: C.coral, fontSize: 13 }}>
          Backend error: {error} — <a href={`${API_BASE}/health`} target="_blank" rel="noreferrer" style={{ color: C.coral }}>Check health</a>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <StatCard label="Total Shipments"   value={kernelData?.total_rows?.toLocaleString() || "—"}   sub="Upload CSV to analyze" color={C.accentLt} loading={loading} />
        <StatCard label="Network Avg ρ"     value={avgRho}                                             sub={`${critCt} critical, ${warnCt} warning`} color={critCt > 0 ? C.coral : C.emerald} loading={loading} />
        <StatCard label="Annualized Exposure" value="$2.81M"                                           sub="IRP baseline recovery target" color={C.coral} />
        <StatCard label="Hub Count"         value={kernelData?.hub_count || (loading ? null : "0")}    sub="Active monitored hubs" color={C.teal} loading={loading} />
      </div>

      {hubs.length > 0 ? (
        <>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: C.text }}>Hub Network Status</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
              {hubs.map((hub, i) => <HubCard key={i} hub={hub} />)}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, flexWrap: "wrap" }}>
            <PieChart
              title="Risk Distribution" subtitle="By hub utilization"
              data={[hubs.filter(h => h.risk === "safe").length, warnCt, critCt]}
              labels={["Safe (ρ < 0.70)", "Warning (ρ 0.70–0.85)", "Critical (ρ ≥ 0.85)"]}
              colors={[C.emerald, C.amber, C.coral]}
            />
            <PieChart
              title="Delay Profile" subtitle="Across all hubs"
              data={[
                hubs.reduce((a, h) => a + (h.on_time || 0), 0),
                hubs.reduce((a, h) => a + (h.late || 0), 0),
              ]}
              labels={["On-time", "Late"]}
              colors={[C.emerald, C.coral]}
            />
            <PieChart
              title="IRP Exposure" subtitle="By risk category"
              data={[
                Math.round(hubs.filter(h => h.risk === "safe").length / Math.max(hubs.length, 1) * 100),
                Math.round(warnCt / Math.max(hubs.length, 1) * 100),
                Math.round(critCt / Math.max(hubs.length, 1) * 100),
              ]}
              labels={["Safe %", "Warning %", "Critical %"]}
              colors={[C.emerald, C.amber, C.coral]}
            />
          </div>
        </>
      ) : !loading && !error && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "40px", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>📦</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 8 }}>No data loaded yet</div>
          <div style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>Upload a CSV in the Dataset tab to run the MIMI Kernel analysis</div>
          <button style={{ background: C.accent, border: "none", borderRadius: 10, padding: "12px 24px", color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            onClick={() => window.dispatchEvent(new CustomEvent("siti-tab", { detail: "upload" }))}>
            Upload Dataset →
          </button>
        </div>
      )}

      <div style={{ background: C.card, border: `1px solid ${C.accent}30`, borderRadius: 14, padding: "20px" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>The Mathematics Behind SITI</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {[
            { label: "Load Factor ρ", formula: "λ / μ", color: C.coral, desc: "Arrival rate λ divided by service rate μ. When ρ > 0.85, hub is overloaded and sigmoidal decay triggers." },
            { label: "IRP Score", formula: "Φ(ρ) · ln(N+1)", color: C.accentLt, desc: "At scale N, phi-weighted log term captures non-linear reliability degradation unique to high-importance shipments." },
            { label: "Kalman Gain K", formula: "P⁻ / (P⁻ + R)", color: C.teal, desc: "Optimal state estimate blending prediction uncertainty P with observation noise R. T+3 forecast via random-walk model." },
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
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]               = useState("dashboard");
  const [kernelStatus, setStatus]   = useState("Connecting");
  const [purchasedKey, setPKey]     = useState(null);
  const [paymentStatus, setPayStat] = useState(null);

  // Listen for tab change events from child components
  useEffect(() => {
    const handler = e => setTab(e.detail);
    window.addEventListener("siti-tab", handler);
    return () => window.removeEventListener("siti-tab", handler);
  }, []);

  // Check kernel health on mount
  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then(r => r.ok ? setStatus("Online") : setStatus("Degraded"))
      .catch(() => setStatus("Offline"));
  }, []);

  // Check for payment return (Cashfree redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      setPKey(`siti-pilot-${Date.now().toString(36).toUpperCase()}`);
      setPayStat({ plan: params.get("plan") || "pilot" });
      setTab("keys");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // BUG-008 FIX: Proper payment handler with Cashfree order creation
  const handleBuy = async (plan) => {
    if (plan.id === "enterprise" || plan.priceNum === null) {
      const msg = encodeURIComponent(
        `Hi! I'm interested in SITI Intelligence Enterprise plan (₹75,000+/month). Please share details.`
      );
      window.open(`https://wa.me/${WA_NUMBER}?text=${msg}`, "_blank");
      return;
    }

    try {
      const orderData = await apiCall("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan.id, amount: plan.priceNum }),
      });

      if (orderData.fallback && orderData.whatsapp_url) {
        // Cashfree not configured — use WhatsApp fallback
        window.open(orderData.whatsapp_url, "_blank");
        return;
      }

      if (orderData.payment_session_id) {
        // Load Cashfree SDK and launch checkout
        const loaded = await new Promise(resolve => {
          if (window.Cashfree) return resolve(true);
          const s = document.createElement("script");
          s.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
          s.onload = () => resolve(true);
          s.onerror = () => resolve(false);
          document.head.appendChild(s);
        });

        if (loaded && window.Cashfree) {
          const cf = new window.Cashfree({ mode: "production" });
          cf.checkout({
            paymentSessionId: orderData.payment_session_id,
            returnUrl: `${window.location.origin}?payment=success&plan=${plan.id}`,
          });
          return;
        }
      }
    } catch (e) {
      console.error("Payment error:", e);
    }

    // Final fallback — always show WhatsApp for payment
    const msg = encodeURIComponent(
      `Hi! I want to purchase SITI Intelligence ${plan.name} plan (${plan.priceLabel}/month). Please help me complete the payment.`
    );
    window.open(`https://wa.me/${WA_NUMBER}?text=${msg}`, "_blank");
  };

  const TABS = [
    { id: "dashboard", label: "Dashboard" },
    { id: "upload",    label: "Dataset" },
    { id: "pricing",   label: "Pricing" },
    { id: "keys",      label: "API Keys" },
    { id: "docs",      label: "Docs" },
    { id: "contact",   label: "Contact" },
  ];

  const statusColor = kernelStatus === "Online" ? C.emerald : kernelStatus === "Offline" ? C.coral : C.amber;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Syne', sans-serif" }}>
      <style>{FONTS}</style>

      {/* Navbar */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", height: 58, gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg, ${C.accent} 0%, ${C.teal} 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14 }}>S</div>
            <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.3px" }}>SITI Intelligence</span>
            <span style={{ color: C.muted, fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>v4.0</span>
          </div>
          <div style={{ display: "flex", gap: 2, flex: 1, overflowX: "auto" }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                background: tab === t.id ? C.accent + "20" : "transparent",
                border: "none", borderBottom: `2px solid ${tab === t.id ? C.accent : "transparent"}`,
                color: tab === t.id ? C.accentLt : C.muted,
                padding: "10px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                fontWeight: tab === t.id ? 600 : 400, transition: "all 0.15s", whiteSpace: "nowrap"
              }}>{t.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <a href={`https://wa.me/${WA_NUMBER}?text=${WA_SUPPORT_MSG}`} target="_blank" rel="noreferrer"
              style={{ background: "#25D366", border: "none", borderRadius: 8, padding: "6px 14px", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "none", display: "flex", alignItems: "center", gap: 5 }}>
              💬 WhatsApp
            </a>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: statusColor }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
              {kernelStatus}
            </div>
          </div>
        </div>
      </div>

      {/* Page Content */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px" }}>

        {tab === "dashboard" && <DashboardTab />}

        {tab === "upload" && (
          <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 6px" }}>Dataset Upload</h2>
              <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
                Upload any logistics CSV. Kaggle e-commerce, Delhivery, and custom 3PL formats are auto-mapped.
              </p>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "24px" }}>
              <CSVUploadPanel />
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px" }}>
              <div style={{ color: C.amber, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>Auto-detected column mappings</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { siti: "hub_id",       kaggle: "Warehouse_block, block, hub, depot, zone" },
                  { siti: "arrival_rate", kaggle: "lambda, arrival_count, volume (auto-synthesized)" },
                  { siti: "service_rate", kaggle: "mu, capacity, throughput (auto-synthesized)" },
                  { siti: "shipment_id",  kaggle: "ID, order_id, awb, tracking_no" },
                ].map((c, i) => (
                  <div key={i} style={{ background: C.card, borderRadius: 8, padding: "12px 14px" }}>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: C.accentLt, marginBottom: 4 }}>SITI: {c.siti}</div>
                    <div style={{ color: C.muted, fontSize: 11 }}>Maps: {c.kaggle}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "pricing" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <div style={{ textAlign: "center" }}>
              <h2 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 8px" }}>API Access Pricing</h2>
              <p style={{ color: C.muted, fontSize: 14, margin: 0 }}>Value-based pricing for Indian 3PLs. No contracts.</p>
            </div>
            <div style={{ background: C.emerald + "10", border: `1px solid ${C.emerald}30`, borderRadius: 14, padding: "20px 24px", display: "flex", alignItems: "center", gap: 24 }}>
              <div style={{ fontSize: 32 }}>📊</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: C.emerald, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>The ROI Calculation</div>
                <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.7 }}>
                  A 3PL with 50,000 shipments/month at 12% delay rate saves approximately{" "}
                  <span style={{ color: C.text, fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>₹{ROI_SAVINGS.toLocaleString()}/month</span>{" "}
                  with a 15% delay reduction. Growth plan costs ₹45,999.{" "}
                  <span style={{ color: C.emerald, fontWeight: 700 }}>7× ROI on month one.</span>
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18 }}>
              {PLANS.map(plan => <PricingCard key={plan.id} plan={plan} onBuy={handleBuy} />)}
            </div>
            <div style={{ background: C.surface, borderRadius: 12, padding: "18px 24px", border: `1px solid ${C.border}`, display: "flex", gap: 20, alignItems: "center" }}>
              <div style={{ fontSize: 24 }}>🔒</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>Secure payments via Cashfree</div>
                <div style={{ color: C.muted, fontSize: 13 }}>
                  PCI-DSS compliant. UPI, cards, net banking, wallets. API key generated instantly on payment. Enterprise clients routed to WhatsApp for custom pricing.
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "keys" && (
          <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 6px" }}>API Keys</h2>
              <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Your active keys for the SITI Intelligence API.</p>
            </div>
            {paymentStatus && (
              <div style={{ background: C.emerald + "15", border: `1px solid ${C.emerald}40`, borderRadius: 12, padding: "16px 20px" }}>
                <div style={{ color: C.emerald, fontWeight: 700, marginBottom: 4 }}>🎉 Payment confirmed</div>
                <div style={{ color: C.muted, fontSize: 13 }}>{paymentStatus.plan} plan activated. Your API key is below.</div>
              </div>
            )}
            <APIKeyCard apiKey={purchasedKey || API_KEY} />
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Quick Start Endpoints</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { method: "GET",  path: "/health",                  desc: "Kernel health check" },
                  { method: "GET",  path: "/api/hubs",                desc: "All hub IRP scores" },
                  { method: "GET",  path: "/api/kernel/status",       desc: "Full kernel state" },
                  { method: "POST", path: "/api/kernel/reset",        desc: "Upload CSV + analyze" },
                  { method: "POST", path: "/api/kernel/predict",      desc: "Kalman T+3 prediction" },
                  { method: "POST", path: "/api/kernel/analyze",      desc: "AI plain-English explanation" },
                  { method: "POST", path: "/api/payments/create-order", desc: "Cashfree order creation" },
                  { method: "POST", path: "/api/alerts/test",         desc: "Test Twilio SMS" },
                ].map((e, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: C.surface, borderRadius: 8 }}>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 700, color: e.method === "GET" ? C.teal : C.amber, background: (e.method === "GET" ? C.teal : C.amber) + "20", border: `1px solid ${(e.method === "GET" ? C.teal : C.amber)}40`, borderRadius: 4, padding: "2px 6px", flexShrink: 0 }}>{e.method}</span>
                    <code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: C.accentLt, flex: 1 }}>{e.path}</code>
                    <span style={{ color: C.muted, fontSize: 12 }}>{e.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "docs" && (
          <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 6px" }}>Documentation</h2>
              <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Integration guide for the SITI GSC Kernel API v4.0.</p>
            </div>
            {[
              {
                title: "Authentication",
                content: `// All requests require X-API-Key header
fetch("${API_BASE}/api/hubs", {
  headers: { "X-API-Key": "siti-admin-key-001" }
});

// Also accepts Authorization: Bearer <key>
// For demo access use: siti-admin-key-001`
              },
              {
                title: "POST /api/kernel/reset — Upload & Analyze (Kaggle CSV)",
                content: `// Auto-maps Kaggle Warehouse_block → hub_id
// Auto-synthesizes arrival_rate and service_rate from data
const form = new FormData();
form.append("file", csvFile);  // Kaggle, Delhivery, or custom CSV

const result = await fetch("${API_BASE}/api/kernel/reset", {
  method: "POST",
  headers: {
    "X-API-Key":   "your-key",
    "X-Tenant-ID": "your-org"  // optional multi-tenant
  },
  body: form
});
// Returns: { success: true, summary: { hubs, global_rho, total_rows } }`
              },
              {
                title: "POST /api/payments/create-order — Cashfree Integration",
                content: `// Creates Cashfree order for subscription
const order = await fetch("${API_BASE}/api/payments/create-order", {
  method: "POST",
  headers: {
    "X-API-Key": "your-key",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ plan: "growth", amount: 45999 })
});
// Returns: { payment_session_id, order_id }
// OR: { fallback: true, whatsapp_url } if Cashfree not configured`
              },
              {
                title: "POST /api/kernel/predict — Kalman Prediction",
                content: `// Feed delay observations, get T+3 prediction
const result = await fetch("${API_BASE}/api/kernel/predict", {
  method: "POST",
  headers: {
    "X-API-Key": "your-key",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    hub_id: "WAREHOUSE-A",
    observations: [0.62, 0.71, 0.78, 0.82]
  })
});
// Returns: { smoothed, predicted: [t1,t2,t3,t4,t5], kalman_state }`
              },
            ].map((section, i) => (
              <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, fontSize: 14, fontWeight: 700 }}>{section.title}</div>
                <pre style={{ margin: 0, padding: "18px 20px", fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: C.accentLt, whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.8 }}>{section.content}</pre>
              </div>
            ))}
          </div>
        )}

        {tab === "contact" && <ContactSection />}
      </div>

      {/* Footer */}
      <div style={{ background: C.surface, borderTop: `1px solid ${C.border}`, marginTop: 60, padding: "32px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>SITI Intelligence</div>
            <div style={{ color: C.muted, fontSize: 12 }}>Logic for the Paradox · Powered by MIMI Kernel v4.0</div>
          </div>
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <a href={`https://wa.me/${WA_NUMBER}?text=${WA_SUPPORT_MSG}`} target="_blank" rel="noreferrer"
              style={{ color: "#25D366", fontSize: 13, textDecoration: "none", fontWeight: 600 }}>💬 WhatsApp Support</a>
            <a href="mailto:support@siti-intelligence.io" style={{ color: C.muted, fontSize: 13, textDecoration: "none" }}>support@siti-intelligence.io</a>
            <span style={{ color: C.muted, fontSize: 12 }}>© 2026 SITI Intelligence</span>
          </div>
        </div>
      </div>
    </div>
  );
}
