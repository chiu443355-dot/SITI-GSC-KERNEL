import { useState, useEffect, useRef } from "react";

const API_BASE = process.env.REACT_APP_BACKEND_URL || "https://siti-gsc-kernel-1.onrender.com";

const PALETTE = {
  bg: "#0a0a0f",
  surface: "#13131a",
  card: "#1c1c28",
  border: "#2a2a3d",
  accent: "#7c5cfc",
  accentGlow: "#a78bfa",
  teal: "#0ef5c8",
  coral: "#ff6b6b",
  amber: "#fbbf24",
  text: "#f0efff",
  muted: "#8887a6",
  success: "#10b981",
  danger: "#ef4444",
};

const formatTime = () => {
  const d = new Date();
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
};

const SMS_ALERTS = [
  {
    id: 1,
    from: "SITI-KERNEL",
    time: "09:42 AM",
    avatar: "SK",
    color: PALETTE.accent,
    messages: [
      { text: "yo bestie 👀 Hub Mumbai-Central is giving RED FLAGS rn", sent: false },
      { text: "queue depth hit 847 packages. that's literally 3.2x capacity", sent: false },
      { text: "kalman filter says delay prob = 94.7% in next 2hrs", sent: false },
      { text: "no cap — reroute to Thane or Navi Mumbai NOW", sent: false },
    ],
  },
  {
    id: 2,
    from: "Spoton-3PL",
    time: "10:15 AM",
    avatar: "SP",
    color: PALETTE.teal,
    messages: [
      { text: "SITI alert received. which hub specifically?", sent: true },
      { text: "Hub ID: MUM-CENTRAL-04 | IRP Score: 8.7/10", sent: false },
      { text: "reliability paradox triggered — scaling made it WORSE lol", sent: false },
      { text: "recommend immediate capacity rebalance + driver dispatch", sent: false },
    ],
  },
  {
    id: 3,
    from: "SITI-KERNEL",
    time: "11:30 AM",
    avatar: "SK",
    color: PALETTE.accent,
    messages: [
      { text: "update: μ (service rate) is literally cooked at this hub", sent: false },
      { text: "ρ = 1.12 → we're over capacity. system about to eat itself fr fr", sent: false },
      { text: "predicted failure window: 13:00-15:00 IST today", sent: false },
      { text: "this is not a drill bestie 🚨🚨🚨", sent: false },
    ],
  },
];

const METRICS = [
  { label: "Active Shipments", value: "847K", delta: "+12.3%", up: true },
  { label: "IRP Score", value: "8.7", delta: "CRITICAL", up: false },
  { label: "Kalman Accuracy", value: "96.2%", delta: "+0.8%", up: true },
  { label: "Hubs at Risk", value: "3", delta: "+2 today", up: false },
];

const HUBDATA = [
  { name: "MUM-CENTRAL", rho: 1.12, mu: 420, queue: 847, risk: "critical" },
  { name: "DEL-NORTH-02", rho: 0.89, mu: 780, queue: 312, risk: "warning" },
  { name: "BLR-SOUTH-01", rho: 0.61, mu: 950, queue: 180, risk: "safe" },
  { name: "HYD-EAST-03", rho: 0.95, mu: 610, queue: 420, risk: "warning" },
  { name: "CHE-WEST-05", rho: 0.43, mu: 1100, queue: 95, risk: "safe" },
];

function PhoneFrame({ alert, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: active ? PALETTE.card : PALETTE.surface,
        border: `1.5px solid ${active ? alert.color : PALETTE.border}`,
        borderRadius: 18,
        padding: "16px",
        cursor: "pointer",
        transition: "all 0.25s ease",
        boxShadow: active ? `0 0 24px ${alert.color}33` : "none",
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: "50%",
            background: alert.color + "22",
            border: `1.5px solid ${alert.color}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            color: alert.color,
            fontFamily: "monospace",
          }}
        >
          {alert.avatar}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: PALETTE.text, fontSize: 14, fontWeight: 600 }}>{alert.from}</span>
            <span style={{ color: PALETTE.muted, fontSize: 11 }}>{alert.time}</span>
          </div>
          <div style={{ color: PALETTE.muted, fontSize: 12, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {alert.messages[alert.messages.length - 1].text}
          </div>
        </div>
      </div>
    </div>
  );
}

function SMSThread({ alert }) {
  if (!alert) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: PALETTE.muted, fontSize: 14 }}>
      tap a convo to open it bestie
    </div>
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ borderBottom: `1px solid ${PALETTE.border}`, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: alert.color + "22", border: `1.5px solid ${alert.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: alert.color, fontFamily: "monospace" }}>
          {alert.avatar}
        </div>
        <div>
          <div style={{ color: PALETTE.text, fontSize: 14, fontWeight: 600 }}>{alert.from}</div>
          <div style={{ color: alert.color, fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: alert.color, display: "inline-block" }}></span>
            SITI Kernel Active
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {alert.messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.sent ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "80%",
              background: msg.sent ? PALETTE.accent : PALETTE.card,
              border: `1px solid ${msg.sent ? PALETTE.accent : PALETTE.border}`,
              borderRadius: msg.sent ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              padding: "10px 14px",
              fontSize: 13,
              color: PALETTE.text,
              lineHeight: 1.5,
            }}>
              {msg.text}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: "12px 16px", borderTop: `1px solid ${PALETTE.border}`, display: "flex", gap: 10 }}>
        <input
          placeholder="reply to kernel..."
          style={{
            flex: 1,
            background: PALETTE.surface,
            border: `1px solid ${PALETTE.border}`,
            borderRadius: 24,
            padding: "10px 16px",
            color: PALETTE.text,
            fontSize: 13,
            outline: "none",
          }}
        />
        <button style={{
          background: PALETTE.accent,
          border: "none",
          borderRadius: "50%",
          width: 40,
          height: 40,
          color: "white",
          fontSize: 16,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>↑</button>
      </div>
    </div>
  );
}

function KalmanViz() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const points = 60;
    const actual = [];
    const kalman = [];
    const predicted = [];
    let kState = 50;
    let kVar = 1;
    const Q = 0.5;
    const R = 5;

    for (let i = 0; i < points; i++) {
      const noise = (Math.random() - 0.5) * 20;
      const trend = Math.sin(i * 0.15) * 25 + 50;
      actual.push(trend + noise);
      const z = actual[i];
      const predState = kState;
      const predVar = kVar + Q;
      const K = predVar / (predVar + R);
      kState = predState + K * (z - predState);
      kVar = (1 - K) * predVar;
      kalman.push(kState);
    }
    for (let i = points; i < points + 15; i++) {
      const last = kalman[kalman.length - 1];
      predicted.push(last + (Math.random() - 0.3) * 5 + 2);
    }

    const allVals = [...actual, ...kalman, ...predicted];
    const minV = Math.min(...allVals) - 5;
    const maxV = Math.max(...allVals) + 5;
    const scaleX = W / (points + 15);
    const scaleY = H / (maxV - minV);

    const toX = (i) => i * scaleX;
    const toY = (v) => H - (v - minV) * scaleY;

    ctx.strokeStyle = PALETTE.muted;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 0.5;
    for (let v = Math.ceil(minV / 10) * 10; v < maxV; v += 10) {
      const y = toY(v);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.strokeStyle = PALETTE.coral + "66";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    actual.forEach((v, i) => (i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v))));
    ctx.stroke();

    ctx.strokeStyle = PALETTE.teal;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    kalman.forEach((v, i) => (i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v))));
    ctx.stroke();

    ctx.strokeStyle = PALETTE.amber;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    predicted.forEach((v, i) =>
      i === 0
        ? ctx.moveTo(toX(points + i), toY(kalman[kalman.length - 1]))
        : ctx.lineTo(toX(points + i), toY(v))
    );
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = PALETTE.coral + "66";
    ctx.font = "10px monospace";
    ctx.fillText("● raw data", 8, 14);
    ctx.fillStyle = PALETTE.teal;
    ctx.fillText("● kalman smoothed", 80, 14);
    ctx.fillStyle = PALETTE.amber;
    ctx.fillText("● predicted →", 210, 14);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={560}
      height={160}
      style={{ width: "100%", height: 160, borderRadius: 8 }}
    />
  );
}

function HubTable() {
  const riskColor = (r) => r === "critical" ? PALETTE.coral : r === "warning" ? PALETTE.amber : PALETTE.success;
  const riskLabel = (r) => r === "critical" ? "🚨 CRITICAL" : r === "warning" ? "⚠️ WARNING" : "✅ SAFE";

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
            {["Hub", "ρ (load)", "μ (capacity)", "Queue", "Status"].map(h => (
              <th key={h} style={{ padding: "8px 12px", color: PALETTE.muted, fontWeight: 500, textAlign: "left", fontSize: 11, letterSpacing: "0.5px" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HUBDATA.map((hub, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${PALETTE.border}11` }}>
              <td style={{ padding: "10px 12px", color: PALETTE.text, fontFamily: "monospace", fontSize: 12 }}>{hub.name}</td>
              <td style={{ padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 60, height: 6, background: PALETTE.border, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(hub.rho, 1.2) / 1.2 * 100}%`, height: "100%", background: riskColor(hub.risk), borderRadius: 3 }}></div>
                  </div>
                  <span style={{ color: riskColor(hub.risk), fontWeight: 600, fontSize: 12 }}>{hub.rho.toFixed(2)}</span>
                </div>
              </td>
              <td style={{ padding: "10px 12px", color: PALETTE.muted, fontFamily: "monospace" }}>{hub.mu}/hr</td>
              <td style={{ padding: "10px 12px", color: PALETTE.text }}>{hub.queue.toLocaleString()}</td>
              <td style={{ padding: "10px 12px" }}>
                <span style={{
                  background: riskColor(hub.risk) + "22",
                  color: riskColor(hub.risk),
                  border: `1px solid ${riskColor(hub.risk)}55`,
                  borderRadius: 20,
                  padding: "3px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                }}>
                  {riskLabel(hub.risk)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UploadGenius({ onUpload }) {
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState(null);

  const handleFile = async (file) => {
    if (!file || !file.name.endsWith(".csv")) {
      setStatus({ type: "error", msg: "bestie that's not a CSV 💀 we need .csv not PDF" });
      return;
    }
    setStatus({ type: "loading", msg: "feeding the kernel... 🧠" });
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${API_BASE}/api/kernel/reset`, { method: "POST", body: form });
      if (res.ok) {
        setStatus({ type: "success", msg: "kernel reset slay ✨ data loaded successfully" });
        onUpload && onUpload();
      } else {
        const err = await res.text();
        setStatus({ type: "error", msg: `server said no: ${err.slice(0, 80)}` });
      }
    } catch (e) {
      setStatus({ type: "error", msg: `can't reach kernel rn: ${e.message}` });
    }
  };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => document.getElementById("csv-input").click()}
        style={{
          border: `2px dashed ${dragging ? PALETTE.teal : PALETTE.border}`,
          borderRadius: 12,
          padding: "32px",
          textAlign: "center",
          cursor: "pointer",
          background: dragging ? PALETTE.teal + "11" : "transparent",
          transition: "all 0.2s ease",
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
        <div style={{ color: PALETTE.text, fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
          drop your CSV here bestie
        </div>
        <div style={{ color: PALETTE.muted, fontSize: 12 }}>
          Delhivery dataset goes brrr • .csv files only no cap
        </div>
        <input
          id="csv-input"
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          onChange={(e) => handleFile(e.target.files[0])}
        />
      </div>
      {status && (
        <div style={{
          marginTop: 12,
          padding: "10px 14px",
          borderRadius: 8,
          background: status.type === "success" ? PALETTE.success + "22" : status.type === "error" ? PALETTE.danger + "22" : PALETTE.accent + "22",
          border: `1px solid ${status.type === "success" ? PALETTE.success : status.type === "error" ? PALETTE.danger : PALETTE.accent}55`,
          color: status.type === "success" ? PALETTE.success : status.type === "error" ? PALETTE.coral : PALETTE.accentGlow,
          fontSize: 13,
        }}>
          {status.msg}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [activeAlert, setActiveAlert] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [kernelStatus, setKernelStatus] = useState("checking...");
  const [liveTime, setLiveTime] = useState(formatTime());

  useEffect(() => {
    const t = setInterval(() => setLiveTime(formatTime()), 30000);
    fetch(`${API_BASE}/health`)
      .then((r) => r.ok ? setKernelStatus("online ✓") : setKernelStatus("degraded ⚠"))
      .catch(() => setKernelStatus("offline ✗"));
    return () => clearInterval(t);
  }, []);

  const tabs = ["dashboard", "alerts", "hubs", "upload"];
  const tabLabels = { dashboard: "📊 dashboard", alerts: "💬 alerts", hubs: "🏭 hubs", upload: "🚀 genius reset" };

  return (
    <div style={{ minHeight: "100vh", background: PALETTE.bg, color: PALETTE.text, fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* NAV */}
      <div style={{ borderBottom: `1px solid ${PALETTE.border}`, padding: "0 24px", background: PALETTE.surface, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", gap: 16, height: 60 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${PALETTE.accent}, ${PALETTE.teal})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800 }}>S</div>
            <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.3px" }}>SITI Intelligence</span>
          </div>
          <div style={{ flex: 1 }}></div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: kernelStatus.includes("online") ? PALETTE.success : kernelStatus.includes("offline") ? PALETTE.coral : PALETTE.amber }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor", display: "inline-block" }}></span>
            kernel {kernelStatus}
          </div>
          <div style={{ color: PALETTE.muted, fontSize: 12, fontFamily: "monospace" }}>{liveTime}</div>
        </div>
      </div>

      {/* TABS */}
      <div style={{ background: PALETTE.surface, borderBottom: `1px solid ${PALETTE.border}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", gap: 4, padding: "0 24px" }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? PALETTE.accent + "22" : "transparent",
              border: "none",
              borderBottom: `2px solid ${tab === t ? PALETTE.accent : "transparent"}`,
              color: tab === t ? PALETTE.accentGlow : PALETTE.muted,
              padding: "14px 16px",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
              fontWeight: tab === t ? 600 : 400,
              transition: "all 0.15s ease",
            }}>
              {tabLabels[t]}
            </button>
          ))}
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px" }}>

        {tab === "dashboard" && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.5px" }}>
                the inverse reliability paradox 🧠
              </h1>
              <p style={{ color: PALETTE.muted, fontSize: 14, margin: 0 }}>
                as ur network scales, traditional tracking gets COOKED. SITI predicts before it's too late bestie
              </p>
            </div>

            {/* Metric Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 24 }}>
              {METRICS.map((m, i) => (
                <div key={i} style={{ background: PALETTE.card, border: `1px solid ${PALETTE.border}`, borderRadius: 14, padding: "18px 20px" }}>
                  <div style={{ color: PALETTE.muted, fontSize: 12, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>{m.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: PALETTE.text }}>{m.value}</div>
                  <div style={{ fontSize: 12, color: m.up ? PALETTE.success : PALETTE.coral, marginTop: 4, fontWeight: 600 }}>
                    {m.up ? "▲" : "▼"} {m.delta}
                  </div>
                </div>
              ))}
            </div>

            {/* Kalman Chart */}
            <div style={{ background: PALETTE.card, border: `1px solid ${PALETTE.border}`, borderRadius: 14, padding: "20px", marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>kalman filter — live prediction engine</div>
                  <div style={{ color: PALETTE.muted, fontSize: 12, marginTop: 2 }}>predicting delay probability across hub network in real time</div>
                </div>
                <div style={{ background: PALETTE.teal + "22", color: PALETTE.teal, border: `1px solid ${PALETTE.teal}44`, borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 600 }}>
                  LIVE
                </div>
              </div>
              <KalmanViz />
            </div>

            {/* IRP Formula Card */}
            <div style={{ background: PALETTE.card, border: `1px solid ${PALETTE.accent}44`, borderRadius: 14, padding: "20px" }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>the math behind the slay ✨</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {[
                  { label: "ρ (Reliability)", formula: "λ / μ", desc: "> 1.0 means system is overloaded fr" },
                  { label: "IRP Score", formula: "f(ρ, scale)", desc: "higher scale = worse reliability paradox" },
                  { label: "Prediction", formula: "Kalman(t+1)", desc: "future state based on current + noise" },
                ].map((f, i) => (
                  <div key={i} style={{ background: PALETTE.surface, borderRadius: 10, padding: "14px", border: `1px solid ${PALETTE.border}` }}>
                    <div style={{ color: PALETTE.muted, fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>{f.label}</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 20, color: PALETTE.accentGlow, fontWeight: 600, marginBottom: 6 }}>{f.formula}</div>
                    <div style={{ color: PALETTE.muted, fontSize: 11 }}>{f.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "alerts" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>twilio SMS alerts 💬</h2>
              <p style={{ color: PALETTE.muted, fontSize: 13, margin: 0 }}>human-like kernel warnings. no more "System Error 404" vibes</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, height: 520 }}>
              <div style={{ background: PALETTE.card, border: `1px solid ${PALETTE.border}`, borderRadius: 14, padding: "16px", overflowY: "auto" }}>
                <div style={{ fontSize: 12, color: PALETTE.muted, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>conversations</div>
                {SMS_ALERTS.map((a) => (
                  <PhoneFrame key={a.id} alert={a} active={activeAlert?.id === a.id} onClick={() => setActiveAlert(a)} />
                ))}
              </div>
              <div style={{ background: PALETTE.card, border: `1px solid ${PALETTE.border}`, borderRadius: 14, overflow: "hidden" }}>
                <SMSThread alert={activeAlert} />
              </div>
            </div>
          </div>
        )}

        {tab === "hubs" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>hub network status 🏭</h2>
              <p style={{ color: PALETTE.muted, fontSize: 13, margin: 0 }}>ρ {">"} 1.0 = that hub is eating itself. relocate asap bestie</p>
            </div>
            <div style={{ background: PALETTE.card, border: `1px solid ${PALETTE.border}`, borderRadius: 14, padding: "8px 0" }}>
              <HubTable />
            </div>
            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { label: "M/M/1 Queue Theory", desc: "arrival rate λ vs service rate μ determines your bottleneck", color: PALETTE.accent },
                { label: "Inverse Reliability Paradox", desc: "100M+ shipments → traditional tracking becomes unreliable. SITI flips the script", color: PALETTE.teal },
              ].map((c, i) => (
                <div key={i} style={{ background: PALETTE.card, border: `1px solid ${c.color}33`, borderRadius: 12, padding: "16px" }}>
                  <div style={{ color: c.color, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{c.label}</div>
                  <div style={{ color: PALETTE.muted, fontSize: 12, lineHeight: 1.6 }}>{c.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "upload" && (
          <div style={{ maxWidth: 600, margin: "0 auto" }}>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>🧠 genius reset</h2>
              <p style={{ color: PALETTE.muted, fontSize: 13, margin: 0 }}>wipe the kernel state and inject fresh dataset. stress-test the prediction engine fr</p>
            </div>
            <div style={{ background: PALETTE.card, border: `1px solid ${PALETTE.border}`, borderRadius: 14, padding: "24px" }}>
              <UploadGenius />
            </div>
            <div style={{ marginTop: 16, background: PALETTE.surface, borderRadius: 12, padding: "16px", border: `1px solid ${PALETTE.amber}33` }}>
              <div style={{ color: PALETTE.amber, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>⚠️ what this does bestie</div>
              <ul style={{ color: PALETTE.muted, fontSize: 12, margin: 0, paddingLeft: 16, lineHeight: 2 }}>
                <li>calls POST /api/kernel/reset on your render backend</li>
                <li>wipes the current in-memory shipment state</li>
                <li>injects your CSV into the Kalman + IRP engine</li>
                <li>triggers fresh ρ and μ calculations per hub</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
