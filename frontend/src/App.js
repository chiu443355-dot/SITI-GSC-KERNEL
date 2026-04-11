import { useState, useEffect, useRef, useCallback } from "react";

// ── Config — ONLY the backend URL is public. API key is user-supplied. ────────
const API_BASE = (process.env.REACT_APP_BACKEND_URL || "https://siti-gsc-kernel-1.onrender.com").replace(/\/$/, "");
const WA_NUMBER = "918956493671";
const WA_MSG    = encodeURIComponent("Hi! I'd like to learn more about SITI Intelligence logistics platform.");

// ── Fonts ─────────────────────────────────────────────────────────────────────
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');`;

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  bg: "#08080f", surface: "#0d0d1a", card: "#12121f", cardHover: "#181828",
  border: "#1e1e38", borderHi: "#2a2a50", accent: "#5b5bd6", accentLt: "#818cf8",
  teal: "#14b8a6", coral: "#f87171", amber: "#f59e0b", emerald: "#10b981",
  text: "#e8e8f0", muted: "#5a5a80", dim: "#2a2a45",
  danger: "#ef4444", success: "#22c55e", warning: "#eab308",
};

// ── Pricing ───────────────────────────────────────────────────────────────────
const PLANS = [
  {
    id: "pilot", name: "Pilot", badge: "Start Here",
    priceLabel: "₹9,999", priceNum: 9999, period: "/month",
    tagline: "30-day proof of value. No commitment.",
    credits: "5,000 API credits",
    features: ["Kalman filter predictions", "IRP score per hub", "CSV auto-mapping", "SMS alerts", "48h email support"],
    color: C.teal, recommended: false, cta: "Start Pilot →",
  },
  {
    id: "growth", name: "Growth", badge: "Most Popular",
    priceLabel: "₹45,999", priceNum: 45999, period: "/month",
    tagline: "For 3PLs with 10K–500K shipments/month.",
    credits: "1,00,000 API credits",
    features: ["Everything in Pilot", "WhatsApp key delivery", "AI failure explanation", "Priority 12h support", "Multi-tenant API keys"],
    color: C.accent, recommended: true, cta: "Activate Growth →",
  },
  {
    id: "enterprise", name: "Enterprise", badge: "Custom",
    priceLabel: "₹75,000+", priceNum: null, period: "/month",
    tagline: "Dedicated. SLA-backed. Built for Delhivery scale.",
    credits: "Unlimited credits",
    features: ["Everything in Growth", "Dedicated kernel", "99.9% SLA", "Custom schema mapping", "Engineering hotline"],
    color: C.amber, recommended: false, cta: "WhatsApp Us →",
  },
];

// ── Secure API helper ─────────────────────────────────────────────────────────
// The user's API key is stored in sessionStorage (cleared on tab close).
// It is NEVER hardcoded, NEVER in the JS bundle, NEVER in env vars.
function getStoredKey() {
  try { return sessionStorage.getItem("siti_api_key") || ""; }
  catch { return ""; }
}
function setStoredKey(k) {
  try { sessionStorage.setItem("siti_api_key", k); }
  catch { /* private browsing */ }
}
function clearStoredKey() {
  try { sessionStorage.removeItem("siti_api_key"); }
  catch { /* */ }
}

async function apiCall(path, opts = {}, key = null) {
  const k   = key || getStoredKey();
  const url = `${API_BASE}${path}`;
  const headers = {
    ...(k ? { "X-API-Key": k } : {}),
    ...(opts.headers || {}),
  };
  const res = await fetch(url, { ...opts, headers });
  const json = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) throw Object.assign(new Error(json.error || "API error"), { status: res.status, data: json });
  return json;
}

// ── Small components ──────────────────────────────────────────────────────────
function Badge({ label, color }) {
  return (
    <span style={{ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600 }}>
      {label}
    </span>
  );
}

function Pill({ label, variant = "default" }) {
  const colors = { safe: C.emerald, warning: C.amber, critical: C.coral, default: C.muted };
  const c = colors[variant] || colors.default;
  return (
    <span style={{ background: c + "20", color: c, border: `1px solid ${c}40`, borderRadius: 12, padding: "2px 8px", fontSize: 10, fontWeight: 700, letterSpacing: "0.4px" }}>
      {label.toUpperCase()}
    </span>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px", ...style }}>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, color = C.accentLt, loading = false }) {
  return (
    <Card style={{ position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: color }} />
      <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: loading ? C.dim : C.text, lineHeight: 1 }}>
        {loading ? "···" : (value ?? "—")}
      </div>
      {sub && <div style={{ color, fontSize: 11, marginTop: 6, fontWeight: 500 }}>{sub}</div>}
    </Card>
  );
}

// ── Credit Bar ────────────────────────────────────────────────────────────────
function CreditBar({ total, used, plan }) {
  if (!total) return <div style={{ color: C.emerald, fontSize: 12, fontWeight: 700 }}>∞ Unlimited credits</div>;
  const pct  = Math.min((used / total) * 100, 100);
  const left = total - used;
  const barC = pct > 90 ? C.coral : pct > 70 ? C.amber : C.emerald;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted, marginBottom: 6 }}>
        <span>{left.toLocaleString()} credits remaining</span>
        <span>{used.toLocaleString()} / {total.toLocaleString()} used</span>
      </div>
      <div style={{ height: 6, background: C.dim, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: barC, transition: "width 0.4s, background 0.3s", borderRadius: 3 }} />
      </div>
      {pct > 85 && (
        <div style={{ color: C.coral, fontSize: 11, marginTop: 6, fontWeight: 600 }}>
          ⚠ Running low — upgrade to {plan === "pilot" ? "Growth" : "Enterprise"} for more credits
        </div>
      )}
    </div>
  );
}

// ── Hub Card ──────────────────────────────────────────────────────────────────
function HubCard({ hub }) {
  const rc = hub.risk === "critical" ? C.coral : hub.risk === "warning" ? C.amber : C.emerald;
  return (
    <div style={{ background: C.card, border: `1.5px solid ${rc}44`, borderRadius: 14, padding: "18px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: rc }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, fontWeight: 700, color: C.text }}>{hub.hub_id}</span>
        <Pill label={hub.risk} variant={hub.risk} />
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: rc, marginBottom: 8 }}>
        ρ = {hub.rho?.toFixed(4)}
      </div>
      <div style={{ height: 4, background: C.dim, borderRadius: 2, marginBottom: 10, overflow: "hidden", position: "relative" }}>
        <div style={{ width: `${Math.min(hub.rho * 100, 100)}%`, height: "100%", background: rc, transition: "width 0.5s" }} />
        <div style={{ position: "absolute", left: "85%", top: 0, bottom: 0, width: 1, background: C.coral + "88" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        {[
          { k: "λ",   v: `${hub.lambda?.toFixed(2)}/hr`, c: C.accentLt },
          { k: "μ",   v: `${hub.mu?.toFixed(2)}/hr`,     c: C.emerald },
          { k: "Late",v: hub.late?.toLocaleString(),       c: C.coral },
          { k: "IRP", v: `${hub.irp_score?.toFixed(2)}/10`, c: hub.irp_score > 7 ? C.coral : C.amber },
        ].map((s, i) => (
          <div key={i} style={{ background: C.surface, borderRadius: 8, padding: "7px 10px" }}>
            <div style={{ color: C.muted, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 }}>{s.k}</div>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, fontWeight: 600, color: s.c }}>{s.v || "—"}</div>
          </div>
        ))}
      </div>
      {hub.leakage > 0 && (
        <div style={{ background: C.coral + "12", border: `1px solid ${C.coral}33`, borderRadius: 8, padding: "7px 10px", fontSize: 11, color: C.coral }}>
          IRP Leakage: <span style={{ fontWeight: 700, fontFamily: "monospace" }}>${hub.leakage.toFixed(2)}</span>
        </div>
      )}
      {hub.kalman_t3 != null && (
        <div style={{ marginTop: 8, background: C.surface, borderRadius: 8, padding: "7px 10px" }}>
          <div style={{ color: C.muted, fontSize: 9, marginBottom: 3 }}>KALMAN T+3 FORECAST</div>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, fontWeight: 700, color: hub.kalman_t3 >= 0.85 ? C.coral : hub.kalman_t3 > 0.70 ? C.amber : C.emerald }}>
            ρ = {hub.kalman_t3.toFixed(4)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── API Key Entry ─────────────────────────────────────────────────────────────
function KeyEntry({ onKeySet }) {
  const [val, setVal] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const verify = async () => {
    if (!val.trim()) return;
    setLoading(true); setErr(null);
    try {
      // Verify the key by calling /api/keys/info
      const info = await apiCall("/api/keys/info", {}, val.trim());
      setStoredKey(val.trim());
      onKeySet(info);
    } catch (e) {
      setErr(e.status === 403 ? "Invalid or inactive API key." : e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>Enter Your API Key</div>
      <div style={{ color: C.muted, fontSize: 12, marginBottom: 14, lineHeight: 1.7 }}>
        Your key was sent to your WhatsApp after payment. Paste it here to activate your dashboard.
        Keys are stored only in your browser session and cleared when you close the tab.
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <input
          type="password"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => e.key === "Enter" && verify()}
          placeholder="siti-pilot-xxxxxxxxxxxxxxxxxxxx"
          style={{ flex: 1, background: C.surface, border: `1px solid ${err ? C.coral : C.border}`, borderRadius: 8, padding: "10px 14px", color: C.text, fontSize: 13, fontFamily: "JetBrains Mono, monospace", outline: "none" }}
        />
        <button
          onClick={verify}
          disabled={!val.trim() || loading}
          style={{ background: C.accent, border: "none", borderRadius: 8, padding: "10px 20px", color: "white", fontSize: 13, fontWeight: 600, cursor: val.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", opacity: (!val.trim() || loading) ? 0.6 : 1 }}>
          {loading ? "Verifying..." : "Activate →"}
        </button>
      </div>
      {err && <div style={{ color: C.coral, fontSize: 12, marginTop: 8 }}>{err}</div>}
      <div style={{ marginTop: 14, padding: "10px 14px", background: C.surface, borderRadius: 8, fontSize: 12, color: C.muted }}>
        Don't have a key?{" "}
        <a href="#pricing" style={{ color: C.accentLt, textDecoration: "none" }} onClick={() => window.dispatchEvent(new CustomEvent("siti-tab", { detail: "pricing" }))}>
          Purchase a plan
        </a>{" "}or{" "}
        <a href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent("Hi! I need an API key for SITI Intelligence.")}`} target="_blank" rel="noreferrer" style={{ color: "#25D366", textDecoration: "none" }}>
          contact us on WhatsApp
        </a>.
      </div>
    </Card>
  );
}

// ── Key Info Panel ────────────────────────────────────────────────────────────
function KeyInfoPanel({ keyInfo, onLogout }) {
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting]       = useState(false);
  const [copied, setCopied]         = useState(false);

  const testAlert = async (channel) => {
    setTesting(true); setTestResult(null);
    try {
      const res = await apiCall("/api/alerts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      setTestResult({ ok: res.result?.sent, ...res });
    } catch (e) {
      setTestResult({ ok: false, error: e.message });
    } finally {
      setTesting(false);
    }
  };

  const copyKey = () => {
    const k = getStoredKey();
    if (k) { navigator.clipboard.writeText(k); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>API Key Active</div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
              {keyInfo.key_preview} · {keyInfo.plan?.toUpperCase()} plan
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={copyKey}
              style={{ background: copied ? C.emerald + "20" : C.surface, border: `1px solid ${copied ? C.emerald : C.border}`, borderRadius: 8, padding: "7px 14px", color: copied ? C.emerald : C.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              {copied ? "Copied!" : "Copy Key"}
            </button>
            <button onClick={() => { clearStoredKey(); onLogout(); }}
              style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 14px", color: C.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              Sign Out
            </button>
          </div>
        </div>

        <CreditBar total={keyInfo.credits_total} used={keyInfo.credits_used} plan={keyInfo.plan} />

        <div style={{ marginTop: 14, padding: "10px 14px", background: C.surface, borderRadius: 8 }}>
          <div style={{ color: C.muted, fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Credit costs</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12, color: C.muted }}>
            {[
              ["GET /api/hubs", "1 credit"], ["GET /api/kernel/status", "1 credit"],
              ["POST /api/kernel/reset (CSV)", "10 credits"], ["POST /api/kernel/predict", "2 credits"],
              ["POST /api/kernel/analyze (AI)", "5 credits"], ["POST /api/alerts/test", "1 credit"],
            ].map(([ep, cost], i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", background: C.card, borderRadius: 6, padding: "6px 10px" }}>
                <code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: C.accentLt }}>{ep}</code>
                <span style={{ color: C.amber, fontWeight: 600, fontSize: 11 }}>{cost}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Twilio Alert Test */}
      <Card>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>Test Twilio Alerts</div>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 14, lineHeight: 1.7 }}>
          Verify your SMS and WhatsApp alerts are configured correctly. Check the backend's{" "}
          <code style={{ color: C.accentLt, fontSize: 11 }}>TWILIO_FROM_NUMBER</code> and{" "}
          <code style={{ color: C.accentLt, fontSize: 11 }}>TWILIO_ALERT_NUMBER</code> env vars.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => testAlert("sms")} disabled={testing}
            style={{ background: C.surface, border: `1px solid ${C.accent}`, borderRadius: 8, padding: "9px 18px", color: C.accentLt, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            {testing ? "Sending..." : "📱 Test SMS"}
          </button>
          <button onClick={() => testAlert("whatsapp")} disabled={testing}
            style={{ background: C.surface, border: "1px solid #25D366", borderRadius: 8, padding: "9px 18px", color: "#25D366", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            {testing ? "Sending..." : "💬 Test WhatsApp"}
          </button>
        </div>

        {testResult && (
          <div style={{ marginTop: 12, padding: "12px 14px", background: testResult.ok ? C.emerald + "12" : C.coral + "12", border: `1px solid ${testResult.ok ? C.emerald : C.coral}33`, borderRadius: 8 }}>
            <div style={{ color: testResult.ok ? C.emerald : C.coral, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              {testResult.ok ? "✅ Alert sent successfully!" : "❌ Alert failed"}
            </div>
            {!testResult.ok && (
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.8 }}>
                <div><strong style={{ color: C.text }}>Reason:</strong> {testResult.result?.reason || testResult.error}</div>
                <div style={{ marginTop: 8, color: C.muted }}>
                  <strong style={{ color: C.text }}>Diagnosis:</strong>
                  {Object.entries(testResult.diagnosis || {}).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                      <span style={{ color: v ? C.emerald : C.coral, fontSize: 14 }}>{v ? "✓" : "✗"}</span>
                      <code style={{ fontSize: 11, color: v ? C.muted : C.coral }}>{k}</code>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, padding: "8px 10px", background: C.surface, borderRadius: 6, fontSize: 11, color: C.muted }}>
                  Set in Render Dashboard → Environment Variables
                </div>
              </div>
            )}
            {testResult.ok && (
              <div style={{ fontSize: 12, color: C.muted }}>
                Sent to: <code style={{ color: C.accentLt, fontSize: 11 }}>{testResult.to_number}</code><br />
                SID: <code style={{ color: C.accentLt, fontSize: 11 }}>{testResult.result?.sid}</code>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Endpoint List */}
      <Card>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>Available Endpoints</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { m: "GET",  p: "/health",               d: "Health check",            cost: "free" },
            { m: "GET",  p: "/ping",                  d: "Keep-alive ping",          cost: "free" },
            { m: "GET",  p: "/api/hubs",              d: "All hub IRP scores",       cost: "1" },
            { m: "GET",  p: "/api/kernel/status",     d: "Full kernel state",        cost: "1" },
            { m: "POST", p: "/api/kernel/reset",      d: "Upload CSV + analyze",     cost: "10" },
            { m: "POST", p: "/api/kernel/predict",    d: "Kalman T+3 prediction",    cost: "2" },
            { m: "POST", p: "/api/kernel/analyze",    d: "AI explanation",           cost: "5" },
            { m: "POST", p: "/api/alerts/test",       d: "Test Twilio alerts",       cost: "1" },
            { m: "GET",  p: "/api/keys/info",         d: "Credit balance",           cost: "free" },
            { m: "POST", p: "/api/payments/create-order", d: "Cashfree order",      cost: "free" },
          ].map((e, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: C.surface, borderRadius: 8 }}>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, fontWeight: 700, color: e.m === "GET" ? C.teal : C.amber, background: (e.m === "GET" ? C.teal : C.amber) + "18", border: `1px solid ${(e.m === "GET" ? C.teal : C.amber)}35`, borderRadius: 4, padding: "2px 6px", flexShrink: 0 }}>{e.m}</span>
              <code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: C.accentLt, flex: 1 }}>{e.p}</code>
              <span style={{ color: C.muted, fontSize: 11 }}>{e.d}</span>
              <span style={{ color: e.cost === "free" ? C.emerald : C.amber, fontSize: 10, fontWeight: 600, fontFamily: "monospace", flexShrink: 0 }}>{e.cost === "free" ? "free" : `${e.cost}cr`}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── CSV Upload Panel ──────────────────────────────────────────────────────────
function CSVUploadPanel({ onResult }) {
  const [drag, setDrag]       = useState(false);
  const [file, setFile]       = useState(null);
  const [status, setStatus]   = useState(null);
  const [uploading, setUpl]   = useState(false);

  const handleFile = (f) => {
    if (!f?.name?.toLowerCase().endsWith(".csv")) {
      setStatus({ type: "error", msg: "Only .csv files accepted." });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setStatus({ type: "error", msg: "File too large (max 10 MB)." });
      return;
    }
    setFile(f); setStatus(null);
  };

  const upload = async () => {
    if (!file) return;
    const key = getStoredKey();
    if (!key) { setStatus({ type: "error", msg: "Enter your API key in the Keys tab first." }); return; }

    setUpl(true);
    setStatus({ type: "loading", msg: "Uploading and running MIMI Kernel analysis…" });

    const form = new FormData();
    form.append("file", file);

    try {
      const data = await apiCall("/api/kernel/reset", {
        method: "POST",
        headers: { "X-Tenant-ID": "default" },
        body: form,
      });

      const s = data.summary;
      setStatus({
        type: "success",
        msg: `✅ Analysis complete — ${s.total_rows?.toLocaleString()} rows, ${s.hub_count} hubs, ${s.hubs?.filter(h => h.risk === "critical").length || 0} critical.`,
      });
      if (data.sms_fired && data.sms_result) {
        setStatus(prev => ({
          ...prev,
          smsResult: data.sms_result,
        }));
      }
      onResult(data.summary);
    } catch (e) {
      const detail = e.data?.detail;
      const msg = detail?.type === "SCHEMA_MISMATCH"
        ? `Schema mismatch. Found columns: ${detail.found_columns?.slice(0, 5).join(", ")}…`
        : e.message;
      setStatus({ type: "error", msg });
    } finally {
      setUpl(false);
    }
  };

  const sc = status?.type === "success" ? C.emerald : status?.type === "error" ? C.coral : C.accentLt;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => document.getElementById("siti-csv").click()}
        style={{ border: `2px dashed ${drag ? C.teal : file ? C.accent : C.border}`, borderRadius: 14, padding: "40px 24px", textAlign: "center", cursor: "pointer", background: drag ? C.teal + "06" : file ? C.accent + "06" : "transparent", transition: "all 0.2s" }}
      >
        <div style={{ fontSize: 34, marginBottom: 10 }}>📡</div>
        {file ? (
          <>
            <div style={{ color: C.accentLt, fontSize: 14, fontWeight: 600 }}>{file.name}</div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB · click to change</div>
          </>
        ) : (
          <>
            <div style={{ color: C.text, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Drop your logistics CSV</div>
            <div style={{ color: C.muted, fontSize: 13 }}>Kaggle e-commerce, Delhivery, or custom hub data — auto-mapped</div>
          </>
        )}
        <input id="siti-csv" type="file" accept=".csv" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
      </div>

      {status && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: sc + "12", border: `1px solid ${sc}30`, color: sc, fontSize: 13, lineHeight: 1.6 }}>
          {status.msg}
          {status.smsResult && (
            <div style={{ marginTop: 6, fontSize: 11, color: status.smsResult.sent ? C.emerald : C.coral }}>
              {status.smsResult.sent
                ? `📱 SMS alert sent (SID: ${status.smsResult.sid})`
                : `📱 SMS alert not sent: ${status.smsResult.reason}`}
            </div>
          )}
        </div>
      )}

      {file && (
        <button onClick={upload} disabled={uploading}
          style={{ background: uploading ? C.dim : C.accent, border: "none", borderRadius: 10, padding: "13px", color: "white", fontSize: 14, fontWeight: 600, cursor: uploading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
          {uploading ? "Running MIMI Kernel Analysis…" : "Run Kernel Analysis →"}
        </button>
      )}
    </div>
  );
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────────
function DashboardTab({ keyInfo }) {
  const [data, setData]     = useState(null);
  const [loading, setLoad]  = useState(false);
  const [error, setErr]     = useState(null);
  const timerRef            = useRef(null);

  const fetch_ = useCallback(async () => {
    if (!getStoredKey()) return;
    setLoad(true);
    try {
      const d = await apiCall("/api/kernel/status");
      setData(d); setErr(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoad(false);
    }
  }, []);

  useEffect(() => {
    fetch_();
    timerRef.current = setInterval(fetch_, 10_000);
    return () => clearInterval(timerRef.current);
  }, [fetch_]);

  const hubs   = data?.hubs || [];
  const critCt = hubs.filter(h => h.risk === "critical").length;
  const warnCt = hubs.filter(h => h.risk === "warning").length;

  if (!getStoredKey()) {
    return (
      <div style={{ maxWidth: 600, margin: "60px auto", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔑</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 8 }}>API key required</div>
        <div style={{ color: C.muted, fontSize: 14, marginBottom: 24 }}>Enter your API key in the <strong style={{ color: C.accentLt }}>API Keys</strong> tab to access the live dashboard.</div>
        <button onClick={() => window.dispatchEvent(new CustomEvent("siti-tab", { detail: "keys" }))}
          style={{ background: C.accent, border: "none", borderRadius: 10, padding: "12px 28px", color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          Enter API Key →
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px", letterSpacing: "-0.5px" }}>The Inverse Reliability Paradox</h1>
          <p style={{ color: C.muted, fontSize: 14, margin: 0, lineHeight: 1.8, maxWidth: 580 }}>
            SITI predicts logistics cascade failure before it begins — Kalman filtering + M/M/1 queueing theory.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: loading ? C.amber : error ? C.coral : C.emerald }} />
          <span style={{ color: C.muted, fontSize: 12 }}>{loading ? "Refreshing…" : error ? "Error" : "Live · 10s"}</span>
          <button onClick={fetch_} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 12px", color: C.muted, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>↻</button>
        </div>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: C.coral + "12", border: `1px solid ${C.coral}30`, borderRadius: 10, color: C.coral, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <StatCard label="Total Shipments" value={data?.total_rows?.toLocaleString() || "—"} sub="Upload CSV to analyze" color={C.accentLt} loading={loading && !data} />
        <StatCard label="Critical Hubs"   value={critCt || "—"} sub={`${warnCt} warning hubs`} color={critCt > 0 ? C.coral : C.emerald} loading={loading && !data} />
        <StatCard label="Total Leakage"   value={data ? `$${data.total_leakage?.toFixed(0) || 0}` : "—"} sub="High-importance late × $3.94" color={C.coral} loading={loading && !data} />
        <StatCard label="Annualized Exposure" value="$2.81M" sub="IRP baseline recovery target" color={C.amber} />
      </div>

      {hubs.length > 0 ? (
        <>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14 }}>
              Hub Network — {hubs.length} hubs monitored
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
              {hubs.map((hub, i) => <HubCard key={i} hub={hub} />)}
            </div>
          </div>
          <Card>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>Summary Statistics</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
              {[
                { k: "Global Avg ρ",    v: data?.global_rho?.toFixed(4), c: data?.global_rho > 0.85 ? C.coral : data?.global_rho > 0.70 ? C.amber : C.emerald },
                { k: "Total Late",      v: data?.total_late?.toLocaleString(), c: C.coral },
                { k: "Hi-Imp Late",     v: data?.total_high_imp_late?.toLocaleString(), c: C.coral },
                { k: "Total Leakage",   v: `$${data?.total_leakage?.toFixed(2)}`, c: C.amber },
                { k: "Dataset",         v: data?.dataset_name, c: C.muted },
                { k: "Last Reset",      v: data?.reset_at?.slice(0, 16).replace("T", " "), c: C.muted },
              ].map((s, i) => (
                <div key={i} style={{ background: C.surface, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>{s.k}</div>
                  <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, fontWeight: 600, color: s.c, wordBreak: "break-all" }}>{s.v || "—"}</div>
                </div>
              ))}
            </div>
          </Card>
        </>
      ) : !loading && !error && (
        <Card style={{ textAlign: "center", padding: "50px 24px" }}>
          <div style={{ fontSize: 42, marginBottom: 14 }}>📦</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 8 }}>No dataset loaded</div>
          <div style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>Upload a logistics CSV to run the MIMI Kernel analysis</div>
          <button onClick={() => window.dispatchEvent(new CustomEvent("siti-tab", { detail: "upload" }))}
            style={{ background: C.accent, border: "none", borderRadius: 10, padding: "11px 24px", color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Upload Dataset →
          </button>
        </Card>
      )}

      <Card>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>The Mathematics</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {[
            { label: "Load Factor ρ",   formula: "λ / μ",           color: C.coral,    desc: "Arrival rate over service rate. ρ ≥ 0.85 triggers sigmoidal decay." },
            { label: "Sigmoidal Φ(ρ)",  formula: "1/(1+e⁻²⁰(ρ-0.85))", color: C.amber, desc: "Instability function — models sudden collapse at saturation threshold." },
            { label: "IRP Score",       formula: "Φ(ρ)·ln(N+1)",    color: C.accentLt, desc: "Inverse Reliability Paradox — high-value shipments hit worst delays." },
            { label: "Kalman Gain K",   formula: "P⁻/(P⁻+R)",       color: C.teal,     desc: "Optimal blend of prediction uncertainty and observation noise for T+3 forecast." },
          ].map((m, i) => (
            <div key={i} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px" }}>
              <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>{m.label}</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 20, color: m.color, fontWeight: 600, marginBottom: 8 }}>{m.formula}</div>
              <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.6 }}>{m.desc}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Pricing Card ──────────────────────────────────────────────────────────────
function PricingCard({ plan, onBuy }) {
  const [busy, setBusy] = useState(false);
  const click = async () => {
    setBusy(true);
    try { await onBuy(plan); } finally { setBusy(false); }
  };
  return (
    <div style={{
      background: plan.recommended ? C.card : C.surface,
      border: `1.5px solid ${plan.recommended ? plan.color : C.border}`,
      borderRadius: 18, padding: "28px 22px", position: "relative", overflow: "hidden",
      boxShadow: plan.recommended ? `0 0 40px ${plan.color}18` : "none",
      transition: "transform 0.2s",
    }}
      onMouseEnter={e => e.currentTarget.style.transform = "translateY(-4px)"}
      onMouseLeave={e => e.currentTarget.style.transform = ""}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: plan.color }} />
      {plan.recommended && (
        <div style={{ position: "absolute", top: 14, right: 14, background: plan.color + "25", color: plan.color, border: `1px solid ${plan.color}50`, borderRadius: 20, padding: "3px 10px", fontSize: 10, fontWeight: 700 }}>
          MOST POPULAR
        </div>
      )}
      <div style={{ color: plan.color, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>{plan.name}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 6 }}>
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 30, fontWeight: 700, color: C.text }}>{plan.priceLabel}</span>
        <span style={{ color: C.muted, fontSize: 13 }}>{plan.period}</span>
      </div>
      <div style={{ color: plan.color, fontSize: 12, fontWeight: 600, marginBottom: 4 }}>🎫 {plan.credits}</div>
      <div style={{ color: C.muted, fontSize: 12, marginBottom: 16, fontStyle: "italic" }}>{plan.tagline}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22, paddingBottom: 22, borderBottom: `1px solid ${C.border}` }}>
        {plan.features.map((f, i) => (
          <div key={i} style={{ display: "flex", gap: 8 }}>
            <span style={{ color: plan.color, fontSize: 13, flexShrink: 0 }}>✓</span>
            <span style={{ color: C.muted, fontSize: 13 }}>{f}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 14, background: C.surface, borderRadius: 8, padding: "8px 10px", lineHeight: 1.6 }}>
        🔒 API key delivered via <strong style={{ color: C.text }}>WhatsApp</strong> after payment confirmation.
      </div>
      <button onClick={click} disabled={busy}
        style={{ width: "100%", background: plan.recommended ? plan.color : "transparent", border: `1.5px solid ${plan.color}`, borderRadius: 10, padding: "12px", color: plan.recommended ? "white" : plan.color, fontSize: 14, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: busy ? 0.7 : 1 }}>
        {busy ? "Processing…" : plan.cta}
      </button>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]           = useState("dashboard");
  const [healthStatus, setHs]   = useState("Checking");
  const [keyInfo, setKeyInfo]   = useState(null);    // set after key verification
  const [uploadResult, setUpRes]= useState(null);
  const [payStatus, setPayStat] = useState(null);

  // Key already in session?
  useEffect(() => {
    const k = getStoredKey();
    if (k) {
      apiCall("/api/keys/info", {}, k)
        .then(info => setKeyInfo(info))
        .catch(() => clearStoredKey());
    }
  }, []);

  // Health check
  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then(r => r.ok ? setHs("Online") : setHs("Degraded"))
      .catch(() => setHs("Offline"));
  }, []);

  // Tab event listener
  useEffect(() => {
    const h = e => setTab(e.detail);
    window.addEventListener("siti-tab", h);
    return () => window.removeEventListener("siti-tab", h);
  }, []);

  // Payment return
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("payment") === "success") {
      setPayStat({ plan: p.get("plan"), order: p.get("order_id") });
      setTab("keys");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Payment handler
  const handleBuy = async (plan) => {
    if (!plan.priceNum) {
      window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`Hi! I'm interested in SITI Intelligence Enterprise plan (₹75,000+/month). Please share details.`)}`, "_blank");
      return;
    }
    const key = getStoredKey();
    if (!key) {
      alert("Please enter your demo API key first (in the API Keys tab) to initiate payment.");
      setTab("keys");
      return;
    }
    try {
      const order = await apiCall("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan.id, amount: plan.priceNum }),
      });

      if (order.fallback && order.whatsapp_url) {
        window.open(order.whatsapp_url, "_blank");
        return;
      }

      if (order.payment_session_id) {
        const loaded = await new Promise(res => {
          if (window.Cashfree) return res(true);
          const s = document.createElement("script");
          s.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
          s.onload = () => res(true);
          s.onerror = () => res(false);
          document.head.appendChild(s);
        });
        if (loaded && window.Cashfree) {
          new window.Cashfree({ mode: "production" }).checkout({
            paymentSessionId: order.payment_session_id,
            returnUrl: `${window.location.origin}?payment=success&plan=${plan.id}&order_id=${order.order_id}`,
          });
          return;
        }
      }
    } catch (e) {
      console.error("Payment:", e);
    }
    // Always-works fallback
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`Hi! I want to buy SITI Intelligence ${plan.name} (${plan.priceLabel}/month).`)}`, "_blank");
  };

  const hc = healthStatus === "Online" ? C.emerald : healthStatus === "Offline" ? C.coral : C.amber;
  const TABS = [
    { id: "dashboard", label: "Dashboard" },
    { id: "upload",    label: "Dataset" },
    { id: "pricing",   label: "Pricing" },
    { id: "keys",      label: keyInfo ? `Keys · ${keyInfo.plan?.toUpperCase()}` : "API Keys" },
    { id: "docs",      label: "Docs" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Syne', sans-serif" }}>
      <style>{FONTS}</style>

      {/* Nav */}
      <nav style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(10px)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", height: 56, gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: `linear-gradient(135deg, ${C.accent}, ${C.teal})`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, color: "white" }}>S</div>
            <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.3px" }}>SITI Intelligence</span>
            <span style={{ color: C.muted, fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}>v5.0</span>
          </div>
          <div style={{ display: "flex", gap: 2, flex: 1, overflowX: "auto" }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                background: tab === t.id ? C.accent + "18" : "transparent", border: "none",
                borderBottom: `2px solid ${tab === t.id ? C.accent : "transparent"}`,
                color: tab === t.id ? C.accentLt : C.muted, padding: "8px 14px", fontSize: 13,
                cursor: "pointer", fontFamily: "inherit", fontWeight: tab === t.id ? 600 : 400, whiteSpace: "nowrap"
              }}>{t.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <a href={`https://wa.me/${WA_NUMBER}?text=${WA_MSG}`} target="_blank" rel="noreferrer"
              style={{ background: "#25D366", border: "none", borderRadius: 8, padding: "6px 12px", color: "white", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
              💬 Support
            </a>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: hc }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
              {healthStatus}
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px" }}>

        {tab === "dashboard" && <DashboardTab keyInfo={keyInfo} />}

        {tab === "upload" && (
          <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px" }}>Dataset Upload</h2>
              <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Upload any logistics CSV — Kaggle, Delhivery, or custom format. Columns are auto-mapped.</p>
            </div>
            {!getStoredKey() && (
              <div style={{ padding: "12px 16px", background: C.amber + "12", border: `1px solid ${C.amber}33`, borderRadius: 10, color: C.amber, fontSize: 13 }}>
                ⚠ Enter your API key in the <strong>API Keys</strong> tab before uploading.
              </div>
            )}
            <Card>
              <CSVUploadPanel onResult={r => { setUpRes(r); setTab("dashboard"); }} />
            </Card>
            <Card>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 10 }}>Auto-mapped columns</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  ["hub_id",       "Warehouse_block, block, hub, depot, zone"],
                  ["arrival_rate", "auto-synthesized from row distribution"],
                  ["service_rate", "auto-synthesized from hub count"],
                  ["on_time",      "Reached.on.Time_Y.N, delivery_status"],
                ].map(([siti, maps], i) => (
                  <div key={i} style={{ background: C.surface, borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: C.accentLt, marginBottom: 4 }}>SITI: {siti}</div>
                    <div style={{ color: C.muted, fontSize: 11 }}>{maps}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {tab === "pricing" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            <div style={{ textAlign: "center" }}>
              <h2 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 8px" }}>API Access Pricing</h2>
              <p style={{ color: C.muted, fontSize: 14, margin: 0 }}>Credit-based. No contracts. Cancel anytime. Key delivered via WhatsApp.</p>
            </div>

            {/* ROI callout */}
            <div style={{ background: C.emerald + "0e", border: `1px solid ${C.emerald}28`, borderRadius: 14, padding: "18px 22px", display: "flex", gap: 20, alignItems: "center" }}>
              <span style={{ fontSize: 30 }}>📊</span>
              <div>
                <div style={{ color: C.emerald, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>The ROI Calculation</div>
                <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.7 }}>
                  50K shipments/month × 12% delay rate × ₹1,200/shipment × 15% reduction ={" "}
                  <strong style={{ color: C.text }}>₹{Math.round(50000 * 0.12 * 1200 * 0.15).toLocaleString()}/month saved</strong>.
                  Growth plan costs ₹45,999. That's <span style={{ color: C.emerald, fontWeight: 700 }}>7× ROI on day one.</span>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              {PLANS.map(p => <PricingCard key={p.id} plan={p} onBuy={handleBuy} />)}
            </div>

            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 22px", display: "flex", gap: 16, alignItems: "center" }}>
              <span style={{ fontSize: 22 }}>🔒</span>
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                <strong style={{ color: C.text }}>Secure payment via Cashfree.</strong> PCI-DSS compliant. UPI, cards, net banking, wallets.
                API key generated instantly and delivered to your <strong style={{ color: C.text }}>WhatsApp</strong> — not email, for reliability.
                Raw key is <strong style={{ color: C.text }}>never shown in the frontend</strong> — only sent to your phone.
              </div>
            </div>
          </div>
        )}

        {tab === "keys" && (
          <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px" }}>API Keys & Credits</h2>
              <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Your API key stays in your browser session only — never stored on our servers in plaintext.</p>
            </div>

            {payStatus && (
              <div style={{ background: C.emerald + "12", border: `1px solid ${C.emerald}40`, borderRadius: 12, padding: "14px 18px" }}>
                <div style={{ color: C.emerald, fontWeight: 700, marginBottom: 4 }}>🎉 Payment confirmed!</div>
                <div style={{ color: C.muted, fontSize: 13 }}>
                  Plan: <strong style={{ color: C.text }}>{payStatus.plan?.toUpperCase()}</strong> · Order: {payStatus.order}<br />
                  Your API key has been sent to your WhatsApp. Paste it below to activate.
                </div>
              </div>
            )}

            {keyInfo ? (
              <KeyInfoPanel keyInfo={keyInfo} onLogout={() => setKeyInfo(null)} />
            ) : (
              <KeyEntry onKeySet={info => setKeyInfo(info)} />
            )}
          </div>
        )}

        {tab === "docs" && (
          <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px" }}>Documentation</h2>
              <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>SITI Intelligence API v5.0 — start command: <code style={{ color: C.accentLt }}>gunicorn backend.server:app</code></p>
            </div>
            {[
              {
                title: "Authentication",
                content: `// Send your API key in the X-API-Key header
fetch("${API_BASE}/api/hubs", {
  headers: { "X-API-Key": "siti-pilot-xxxxxxxxx" }
});
// Keys are issued after payment and sent to your WhatsApp
// Each call debits credits from your balance`
              },
              {
                title: "POST /api/kernel/reset — Upload & Analyze (auto-maps Kaggle CSV)",
                content: `const form = new FormData();
form.append("file", csvFile);  // Kaggle, Delhivery, or custom CSV

fetch("${API_BASE}/api/kernel/reset", {
  method: "POST",
  headers: { "X-API-Key": "your-key", "X-Tenant-ID": "your-org" },
  body: form,
});
// Cost: 10 credits
// Returns: { success, summary: { hubs, global_rho, total_leakage } }
// Fires SMS alert automatically if any hub is critical`
              },
              {
                title: "GET /api/keys/info — Check Credit Balance",
                content: `fetch("${API_BASE}/api/keys/info", {
  headers: { "X-API-Key": "your-key" }
});
// Returns:
// {
//   key_preview: "siti-pil...xxxx",
//   plan: "growth",
//   credits_total: 100000,
//   credits_used: 1240,
//   credits_remaining: 98760
// }`
              },
              {
                title: "POST /api/alerts/test — Test Twilio SMS",
                content: `fetch("${API_BASE}/api/alerts/test", {
  method: "POST",
  headers: {
    "X-API-Key": "your-key",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ channel: "sms" })
});
// Sends test SMS to TWILIO_ALERT_NUMBER
// Returns diagnosis object if not configured`
              },
              {
                title: "Render Deployment — CORRECT Start Command",
                content: `# In Render Dashboard → Web Service → Start Command:
gunicorn backend.server:app --bind 0.0.0.0:\\$PORT --workers 1 --timeout 120

# Build Command:
pip install -r backend/requirements.txt

# Required Env Vars:
CORS_ORIGINS=https://your-vercel-app.vercel.app
API_KEYS=siti-demo-key-001:ADMIN:demo
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+1xxxxxxxxxx
TWILIO_ALERT_NUMBER=+91xxxxxxxxxx
CASHFREE_APP_ID=your_app_id
CASHFREE_SECRET_KEY=your_secret
CASHFREE_ENV=production
WHATSAPP_NUMBER=918956493671`
              },
            ].map((s, i) => (
              <Card key={i} style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, fontSize: 13, fontWeight: 700 }}>{s.title}</div>
                <pre style={{ margin: 0, padding: "16px 18px", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: C.accentLt, whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.8, background: "transparent" }}>{s.content}</pre>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer style={{ background: C.surface, borderTop: `1px solid ${C.border}`, marginTop: 60, padding: "28px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 3 }}>SITI Intelligence</div>
            <div style={{ color: C.muted, fontSize: 11 }}>Logic for the Paradox · Powered by MIMI Kernel v5.0</div>
          </div>
          <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
            <a href={`https://wa.me/${WA_NUMBER}?text=${WA_MSG}`} target="_blank" rel="noreferrer" style={{ color: "#25D366", fontSize: 13, textDecoration: "none", fontWeight: 600 }}>💬 WhatsApp</a>
            <a href="mailto:support@siti-intelligence.io" style={{ color: C.muted, fontSize: 13, textDecoration: "none" }}>support@siti-intelligence.io</a>
            <span style={{ color: C.dim, fontSize: 12 }}>© 2026 SITI Intelligence</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
