import { useState, useEffect, useRef, useCallback } from "react";

// ── Config ────────────────────────────────────────────────────────────────────
const API = (process.env.REACT_APP_BACKEND_URL || "https://siti-gsc-kernel-1.onrender.com").replace(/\/$/, "");
const WA  = "918956493671";

// ── Fonts ─────────────────────────────────────────────────────────────────────
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');`;

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:"#07070f", surface:"#0d0d1c", card:"#111120", cardHi:"#171730",
  border:"#1c1c38", borderHi:"#2a2a52", sep:"#141428",
  accent:"#6366f1", accentLt:"#a5b4fc", accentDk:"#4338ca",
  teal:"#0d9488", tealLt:"#2dd4bf",
  coral:"#f43f5e", coralLt:"#fb7185",
  amber:"#d97706", amberLt:"#fbbf24",
  emerald:"#059669", emeraldLt:"#34d399",
  text:"#e2e2f0", muted:"#52527a", dim:"#252545",
  safe:"#059669", warning:"#d97706", critical:"#f43f5e",
};

// ── Chart.js lazy loader ──────────────────────────────────────────────────────
const loadChart = () => new Promise(ok => {
  if (window.Chart) return ok(window.Chart);
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js";
  s.onload = () => ok(window.Chart);
  document.head.appendChild(s);
});

// ── Session key store (never in JS bundle) ────────────────────────────────────
const getKey  = ()  => { try { return sessionStorage.getItem("siti_key") || ""; } catch { return ""; } };
const setKey  = (k) => { try { sessionStorage.setItem("siti_key", k); } catch {} };
const clearKey= ()  => { try { sessionStorage.removeItem("siti_key"); } catch {} };

// ── API helper ────────────────────────────────────────────────────────────────
async function api(path, opts = {}, keyOverride = null) {
  const key = keyOverride || getKey();
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      ...(key ? { "X-API-Key": key } : {}),
      ...(opts.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) {
    const e = Object.assign(new Error(json.error || "API error"), { status: res.status, data: json });
    throw e;
  }
  return json;
}

// ── Plans ─────────────────────────────────────────────────────────────────────
const PLANS = [
  { id:"pilot",      name:"Pilot",      price:"₹9,999",  amt:9999,  credits:"5,000",
    period:"/mo",  color:C.teal,    rec:false, cta:"Start Pilot →",
    tag:"Try before you scale",
    feats:["5,000 API credits","3-hub CSV analysis","Kalman T+3 predictions","SMS alerts","48h support"] },
  { id:"growth",     name:"Growth",     price:"₹45,999", amt:45999, credits:"1,00,000",
    period:"/mo",  color:C.accent,  rec:true,  cta:"Activate Growth →",
    tag:"For 10K–500K shipments/month",
    feats:["1,00,000 credits","25-hub networks","AI analysis (Ask AI)","WhatsApp key delivery","Priority 12h support","Multi-tenant API"] },
  { id:"enterprise", name:"Enterprise", price:"₹75,000+",amt:null,  credits:"Unlimited",
    period:"/mo",  color:C.amber,   rec:false, cta:"Contact Us →",
    tag:"Dedicated. SLA-backed. Delhivery-scale.",
    feats:["Unlimited credits","Unlimited hubs","99.9% SLA","Custom schema mapping","Dedicated kernel","Direct engineering line"] },
];

// ── Utility components ────────────────────────────────────────────────────────
function Badge({ children, color = C.muted }) {
  return <span style={{ background: color+"1e", color, border:`1px solid ${color}44`, borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:700 }}>{children}</span>;
}
function RiskBadge({ risk }) {
  const c = risk==="critical"?C.coral:risk==="warning"?C.amber:C.emerald;
  return <Badge color={c}>{risk.toUpperCase()}</Badge>;
}

function Card({ children, style={}, glow=false }) {
  return (
    <div style={{ background:C.card, border:`1px solid ${glow?C.accent:C.border}`,
      borderRadius:16, padding:20, boxShadow:glow?`0 0 30px ${C.accent}18`:"none", ...style }}>
      {children}
    </div>
  );
}

function Spinner() {
  return <div style={{ width:18,height:18,border:`2px solid ${C.border}`,
    borderTopColor:C.accent,borderRadius:"50%",animation:"spin 0.8s linear infinite" }} />;
}

function StatusDot({ ok, loading }) {
  const c = loading ? C.amber : ok ? C.emerald : C.coral;
  return <span style={{ display:"inline-block",width:7,height:7,borderRadius:"50%",background:c,
    boxShadow:`0 0 6px ${c}` }} />;
}

// ── Toast system ──────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = "info", duration = 6000) => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration);
  }, []);
  return { toasts, add };
}

function ToastContainer({ toasts }) {
  return (
    <div style={{ position:"fixed",bottom:24,right:24,zIndex:9999,display:"flex",flexDirection:"column",gap:8 }}>
      {toasts.map(t => {
        const bg = t.type==="error"?C.coral:t.type==="success"?C.emerald:t.type==="warn"?C.amber:C.accent;
        return (
          <div key={t.id} style={{ background:C.card,border:`1px solid ${bg}55`,borderLeft:`3px solid ${bg}`,
            borderRadius:10,padding:"10px 16px",fontSize:13,color:C.text,maxWidth:360,lineHeight:1.5,
            animation:"slideIn 0.3s ease" }}>
            {t.type==="error"?"❌ ":t.type==="success"?"✅ ":t.type==="warn"?"⚠️ ":"ℹ️ "}{t.msg}
          </div>
        );
      })}
    </div>
  );
}

// ── Show-Once Key Modal ────────────────────────────────────────────────────────
function ShowOnceModal({ keyData, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(keyData.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <div style={{ position:"fixed",inset:0,background:"#000000cc",zIndex:9000,
      display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div style={{ background:C.card,border:`2px solid ${C.accent}`,borderRadius:20,
        padding:32,maxWidth:520,width:"90%",position:"relative" }}>
        <div style={{ fontSize:22,fontWeight:800,color:C.text,marginBottom:6 }}>🔑 Your API Key</div>
        <div style={{ color:C.coral,fontSize:13,fontWeight:600,marginBottom:16,
          padding:"8px 12px",background:C.coral+"12",borderRadius:8,border:`1px solid ${C.coral}33` }}>
          ⚠️ This key will NOT be shown again. Copy it now and store it safely.
        </div>
        <div style={{ background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:10,
          padding:"14px 16px",fontFamily:"JetBrains Mono,monospace",fontSize:13,
          color:C.accentLt,wordBreak:"break-all",lineHeight:1.7,marginBottom:16 }}>
          {keyData.key}
        </div>
        <div style={{ display:"flex",gap:10,marginBottom:20 }}>
          <button onClick={copy} style={{ flex:1,background:copied?C.emerald:C.accent,
            border:"none",borderRadius:10,padding:12,color:"white",fontSize:14,fontWeight:700,
            cursor:"pointer",fontFamily:"inherit" }}>
            {copied ? "✅ Copied!" : "Copy Key"}
          </button>
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,fontSize:12,color:C.muted,marginBottom:20 }}>
          {[["Plan", keyData.plan?.toUpperCase()], ["Credits", (keyData.credits||0).toLocaleString()],
            ["Role", "OPERATOR"], ["Status", "Active"]].map(([k,v],i)=>(
            <div key={i} style={{ background:C.surface,borderRadius:8,padding:"8px 12px" }}>
              <div style={{ color:C.muted,fontSize:10,marginBottom:3 }}>{k}</div>
              <div style={{ color:C.text,fontWeight:600,fontFamily:"JetBrains Mono,monospace" }}>{v}</div>
            </div>
          ))}
        </div>
        <button onClick={onClose} style={{ width:"100%",background:"transparent",
          border:`1px solid ${C.border}`,borderRadius:10,padding:10,color:C.muted,
          fontSize:13,cursor:"pointer",fontFamily:"inherit" }}>
          I've saved my key — Close
        </button>
      </div>
    </div>
  );
}

// ── Credit Guard ──────────────────────────────────────────────────────────────
// Disables premium features for pilot plan
function CreditGuard({ plan, feature, children, fallback = null }) {
  const pilotRestricted = { "100m_toggle":true, "enterprise_stream":true, "bulk_predict":true };
  if (plan === "pilot" && pilotRestricted[feature]) {
    return fallback || (
      <div style={{ opacity:0.5,cursor:"not-allowed",position:"relative" }}>
        {children}
        <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",
          justifyContent:"center",background:C.bg+"cc",borderRadius:10 }}>
          <span style={{ color:C.amber,fontSize:11,fontWeight:700 }}>
            🔒 Growth+ only
          </span>
        </div>
      </div>
    );
  }
  return children;
}

// ── Kalman Line Chart (real x_hat data) ───────────────────────────────────────
function KalmanChart({ streamData }) {
  const ref = useRef(null); const chartRef = useRef(null);

  useEffect(() => {
    if (!streamData || !streamData.length) return;
    loadChart().then(Chart => {
      if (chartRef.current) chartRef.current.destroy();
      if (!ref.current) return;

      const labels = streamData.map(r => r.shipment_id?.slice(-6) || r.i);
      const delayProb = streamData.map(r => r.delay_prob);
      const rho       = streamData.map(r => r.rho);

      chartRef.current = new Chart(ref.current, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Kalman x̂ (delay prob)",
              data: delayProb,
              borderColor: "#39FF14",
              borderWidth: 2.5,
              pointRadius: 0,
              tension: 0.4,
              fill: { target:"origin", above:"#39FF1410" },
            },
            {
              label: "ρ load factor",
              data: rho,
              borderColor: C.coral,
              borderWidth: 1.5,
              borderDash: [5,3],
              pointRadius: 0,
              tension: 0.3,
              fill: false,
            },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          animation: { duration: 300 },
          plugins: {
            legend: { labels:{ color:C.muted,font:{size:11,family:"JetBrains Mono"} } },
            tooltip: { backgroundColor:C.card,borderColor:C.borderHi,borderWidth:1,
              titleColor:C.text,bodyColor:C.muted,padding:12 },
          },
          scales: {
            x: { grid:{color:C.sep}, ticks:{color:C.muted,font:{size:9},maxTicksLimit:10} },
            y: { min:0,max:1,grid:{color:C.sep},ticks:{color:C.muted,font:{size:10}},
              // Reference line at 0.85
            },
          },
        },
        plugins: [{
          id:"refLine",
          beforeDraw(chart) {
            const { ctx, scales } = chart;
            const y = scales.y.getPixelForValue(0.85);
            ctx.save();
            ctx.strokeStyle = C.coral+"88";
            ctx.lineWidth   = 1;
            ctx.setLineDash([6,4]);
            ctx.beginPath();
            ctx.moveTo(scales.x.left, y);
            ctx.lineTo(scales.x.right, y);
            ctx.stroke();
            ctx.fillStyle = C.coral+"99";
            ctx.font      = "10px JetBrains Mono";
            ctx.fillText("ρc = 0.85", scales.x.right - 60, y - 4);
            ctx.restore();
          }
        }],
      });
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [JSON.stringify(streamData?.slice(-5))]);

  return (
    <div style={{ height:260, position:"relative" }}>
      {(!streamData || !streamData.length) && (
        <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",
          justifyContent:"center",color:C.muted,fontSize:13 }}>
          Upload a CSV to see live Kalman filter animation
        </div>
      )}
      <canvas ref={ref} />
    </div>
  );
}

// ── Risk Distribution Donut ───────────────────────────────────────────────────
function RiskDonut({ riskDist }) {
  const ref = useRef(null); const chartRef = useRef(null);
  const { safe=0, warning=0, critical=0 } = riskDist || {};

  useEffect(() => {
    if (!safe && !warning && !critical) return;
    loadChart().then(Chart => {
      if (chartRef.current) chartRef.current.destroy();
      if (!ref.current) return;
      chartRef.current = new Chart(ref.current, {
        type: "doughnut",
        data: {
          labels: ["Safe", "Warning", "Critical"],
          datasets: [{
            data: [safe, warning, critical],
            backgroundColor: [C.emerald+"bb", C.amber+"bb", C.coral+"bb"],
            borderColor:     [C.emerald,      C.amber,      C.coral],
            borderWidth: 2, hoverOffset: 6,
          }],
        },
        options: {
          cutout: "70%", responsive:true, maintainAspectRatio:false,
          plugins: {
            legend: { position:"right", labels:{color:C.muted,font:{size:11},boxWidth:12,padding:12} },
            tooltip: { backgroundColor:C.card,borderColor:C.borderHi,borderWidth:1,
              titleColor:C.text,bodyColor:C.muted },
          },
        },
      });
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [safe, warning, critical]);

  return (
    <div style={{ height:200 }}>
      {(safe+warning+critical) > 0
        ? <canvas ref={ref} />
        : <div style={{ height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontSize:13 }}>No data</div>}
    </div>
  );
}

// ── IRP Bar Chart ─────────────────────────────────────────────────────────────
function IRPBarChart({ hubs }) {
  const ref = useRef(null); const chartRef = useRef(null);

  useEffect(() => {
    if (!hubs || !hubs.length) return;
    loadChart().then(Chart => {
      if (chartRef.current) chartRef.current.destroy();
      if (!ref.current) return;

      const top = hubs.slice(0,10);
      chartRef.current = new Chart(ref.current, {
        type: "bar",
        data: {
          labels: top.map(h => h.hub_id?.slice(0,12)),
          datasets: [
            { label:"IRP Score",  data:top.map(h=>h.irp_score),
              backgroundColor: top.map(h => h.irp_score>9?C.coral+"cc":h.irp_score>6?C.amber+"cc":C.emerald+"cc"),
              borderRadius:6 },
            { label:"Load ρ ×10", data:top.map(h=>+(h.rho*10).toFixed(2)),
              backgroundColor: C.accent+"55", borderRadius:6 },
          ],
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          plugins: {
            legend:{labels:{color:C.muted,font:{size:11}}},
            tooltip:{backgroundColor:C.card,borderColor:C.borderHi,borderWidth:1,
              titleColor:C.text,bodyColor:C.muted},
          },
          scales: {
            x:{grid:{color:C.sep},ticks:{color:C.muted,font:{size:10}}},
            y:{grid:{color:C.sep},ticks:{color:C.muted},min:0,max:11},
          },
        },
        plugins:[{
          id:"irpLine",
          beforeDraw(chart){
            const {ctx,scales}=chart;
            const y=scales.y.getPixelForValue(9);
            ctx.save();ctx.strokeStyle=C.coral+"88";ctx.lineWidth=1;ctx.setLineDash([5,3]);
            ctx.beginPath();ctx.moveTo(scales.x.left,y);ctx.lineTo(scales.x.right,y);ctx.stroke();
            ctx.fillStyle=C.coral;ctx.font="10px JetBrains Mono";
            ctx.fillText("IRP > 9 alert",scales.x.right-80,y-4);ctx.restore();
          }
        }],
      });
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [JSON.stringify(hubs?.map(h=>h.hub_id+h.irp_score).join())]);

  return (
    <div style={{ height:240 }}>
      {hubs?.length > 0
        ? <canvas ref={ref} />
        : <div style={{ height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontSize:13 }}>Upload CSV to populate chart</div>}
    </div>
  );
}

// ── Hub Card ──────────────────────────────────────────────────────────────────
function HubCard({ hub, onAskAI, aiLoading, plan }) {
  const rc = hub.risk==="critical"?C.coral:hub.risk==="warning"?C.amber:C.emerald;
  const rhoPct = Math.min(hub.rho * 100, 100);
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ background:C.card,border:`1.5px solid ${rc}44`,borderRadius:16,
      padding:18,position:"relative",overflow:"hidden",transition:"border-color 0.3s" }}>
      <div style={{ position:"absolute",top:0,left:0,right:0,height:3,background:rc }} />

      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
        <div style={{ fontFamily:"JetBrains Mono,monospace",fontSize:13,fontWeight:700,color:C.text }}>
          {hub.hub_id}
        </div>
        <div style={{ display:"flex",gap:8,alignItems:"center" }}>
          {hub.irp_score > 9 && <Badge color={C.coral}>IRP ALERT</Badge>}
          <RiskBadge risk={hub.risk} />
        </div>
      </div>

      <div style={{ fontSize:26,fontWeight:800,fontFamily:"JetBrains Mono,monospace",color:rc,marginBottom:8 }}>
        ρ = {hub.rho?.toFixed(4)}
      </div>

      <div style={{ height:5,background:C.dim,borderRadius:3,marginBottom:12,overflow:"hidden",position:"relative" }}>
        <div style={{ width:`${rhoPct}%`,height:"100%",background:rc,transition:"width 0.6s" }} />
        <div style={{ position:"absolute",left:"85%",top:0,bottom:0,width:1,background:C.coral+"66" }} />
      </div>

      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10 }}>
        {[
          {k:"λ/hr",   v:hub.lambda?.toFixed(2),       c:C.accentLt},
          {k:"μ/hr",   v:hub.mu?.toFixed(2),            c:C.emeraldLt},
          {k:"Late",   v:hub.late?.toLocaleString(),     c:C.coral},
          {k:"IRP/10", v:hub.irp_score?.toFixed(2),      c:hub.irp_score>7?C.coral:C.amberLt},
        ].map((s,i)=>(
          <div key={i} style={{ background:C.surface,borderRadius:8,padding:"8px 10px" }}>
            <div style={{ color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3 }}>{s.k}</div>
            <div style={{ fontFamily:"JetBrains Mono,monospace",fontSize:14,fontWeight:700,color:s.c }}>{s.v||"—"}</div>
          </div>
        ))}
      </div>

      {/* Kalman T+3 */}
      {hub.kalman && (
        <div style={{ background:C.surface,borderRadius:8,padding:"8px 10px",marginBottom:10 }}>
          <div style={{ color:C.muted,fontSize:9,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.5px" }}>
            KALMAN STATE | x̂={hub.kalman.x_hat?.toFixed(4)} | T+3={hub.kalman.t3?.toFixed(4)}
          </div>
          <div style={{ display:"flex",gap:10 }}>
            {["t1","t2","t3"].map((t,i)=>(
              <div key={i} style={{ flex:1,textAlign:"center" }}>
                <div style={{ fontSize:9,color:C.muted,marginBottom:2 }}>T+{i+1}</div>
                <div style={{ fontFamily:"JetBrains Mono,monospace",fontSize:12,fontWeight:700,
                  color:hub.kalman[t]>=0.85?C.coral:hub.kalman[t]>0.70?C.amber:C.emerald }}>
                  {hub.kalman[t]?.toFixed(4)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hub.leakage > 0 && (
        <div style={{ background:C.coral+"10",border:`1px solid ${C.coral}30`,borderRadius:8,
          padding:"7px 10px",fontSize:12,color:C.coral,marginBottom:10 }}>
          IRP Leakage: <strong style={{ fontFamily:"monospace" }}>${hub.leakage.toFixed(2)}</strong>
          {hub.hi_late>0 && ` (${hub.hi_late} high-priority late)`}
        </div>
      )}

      {/* Global info */}
      {(hub.countries?.length>0||hub.carriers?.length>0) && (
        <button onClick={()=>setExpanded(e=>!e)} style={{ width:"100%",background:"transparent",
          border:`1px solid ${C.border}`,borderRadius:8,padding:"6px",color:C.muted,
          fontSize:11,cursor:"pointer",fontFamily:"inherit",marginBottom:8 }}>
          {expanded?"Hide":"Show"} global details ▾
        </button>
      )}
      {expanded && (
        <div style={{ fontSize:11,color:C.muted,lineHeight:1.7 }}>
          {hub.countries?.length>0 && <div>🌍 Countries: {hub.countries.join(", ")}</div>}
          {hub.carriers?.length>0  && <div>🚚 Carriers: {hub.carriers.join(", ")}</div>}
          {hub.avg_cost>0          && <div>💰 Avg value: ${hub.avg_cost.toFixed(0)}</div>}
          {hub.avg_weight>0        && <div>⚖️ Avg weight: {hub.avg_weight.toFixed(0)}g</div>}
        </div>
      )}

      {/* Ask AI button */}
      <CreditGuard plan={plan} feature="ai_analyze">
        <button
          onClick={() => onAskAI(hub)}
          disabled={aiLoading === hub.hub_id}
          style={{ width:"100%",background:C.accentDk,border:`1px solid ${C.accent}`,
            borderRadius:8,padding:"9px",color:"white",fontSize:12,fontWeight:700,
            cursor:aiLoading===hub.hub_id?"wait":"pointer",fontFamily:"inherit",
            display:"flex",alignItems:"center",justifyContent:"center",gap:8 }}>
          {aiLoading===hub.hub_id ? <><Spinner /> Analyzing…</> : "🤖 Ask AI — Explain This Hub"}
        </button>
      </CreditGuard>
    </div>
  );
}

// ── AI Analysis Modal ─────────────────────────────────────────────────────────
function AIModal({ result, onClose }) {
  if (!result) return null;
  return (
    <div style={{ position:"fixed",inset:0,background:"#000000bb",zIndex:8000,
      display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div style={{ background:C.card,border:`1px solid ${C.accent}`,borderRadius:20,
        padding:28,maxWidth:540,width:"90%",position:"relative" }}>
        <div style={{ fontSize:18,fontWeight:800,color:C.text,marginBottom:4 }}>
          🤖 AI Analysis — Hub {result.hub_id}
        </div>
        <div style={{ fontSize:11,color:C.accentLt,marginBottom:16 }}>
          Powered by OpenRouter / Gemini Flash
        </div>
        <div style={{ background:C.surface,borderRadius:12,padding:16,lineHeight:1.8,
          fontSize:14,color:C.text,marginBottom:20,whiteSpace:"pre-wrap" }}>
          {result.explanation}
        </div>
        <button onClick={onClose} style={{ width:"100%",background:C.accent,border:"none",
          borderRadius:10,padding:12,color:"white",fontSize:14,fontWeight:700,
          cursor:"pointer",fontFamily:"inherit" }}>
          Close
        </button>
      </div>
    </div>
  );
}

// ── Key Entry ─────────────────────────────────────────────────────────────────
function KeyEntry({ onKeySet }) {
  const [val, setVal]   = useState("");
  const [loading, setL] = useState(false);
  const [err, setErr]   = useState(null);

  const verify = async () => {
    if (!val.trim()) return;
    setL(true); setErr(null);
    try {
      const info = await api("/api/keys/info", {}, val.trim());
      setKey(val.trim());
      onKeySet(info);
    } catch (e) {
      setErr(e.status===403 ? "Invalid or inactive API key." : e.message);
    } finally { setL(false); }
  };

  return (
    <Card>
      <div style={{ fontSize:15,fontWeight:800,color:C.text,marginBottom:6 }}>Enter Your API Key</div>
      <div style={{ color:C.muted,fontSize:13,marginBottom:16,lineHeight:1.7 }}>
        Your key was delivered to your WhatsApp after payment. Paste it here.
        Keys are stored in your browser session only — cleared when you close the tab.
      </div>
      <div style={{ display:"flex",gap:10 }}>
        <input type="password" value={val} onChange={e=>setVal(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&verify()}
          placeholder="siti-growth-xxxxxxxxxxxxxxxxxxxx"
          style={{ flex:1,background:C.surface,border:`1px solid ${err?C.coral:C.border}`,
            borderRadius:10,padding:"11px 14px",color:C.text,fontSize:13,
            fontFamily:"JetBrains Mono,monospace",outline:"none" }} />
        <button onClick={verify} disabled={!val.trim()||loading}
          style={{ background:val.trim()&&!loading?C.accent:C.dim,border:"none",
            borderRadius:10,padding:"11px 20px",color:"white",fontSize:14,fontWeight:700,
            cursor:val.trim()&&!loading?"pointer":"not-allowed",fontFamily:"inherit" }}>
          {loading?<Spinner/>:"Activate →"}
        </button>
      </div>
      {err && <div style={{ color:C.coral,fontSize:12,marginTop:8 }}>{err}</div>}
      <div style={{ marginTop:14,padding:"10px 14px",background:C.surface,borderRadius:8,
        fontSize:12,color:C.muted,lineHeight:1.7 }}>
        No key yet?{" "}
        <button onClick={()=>window.dispatchEvent(new CustomEvent("siti:tab",{detail:"pricing"}))}
          style={{ background:"none",border:"none",color:C.accentLt,cursor:"pointer",
            fontSize:12,padding:0,textDecoration:"underline" }}>
          Purchase a plan
        </button>
        {" "}or{" "}
        <a href={`https://wa.me/${WA}?text=${encodeURIComponent("Hi! I need a SITI Intelligence API key.")}`}
          target="_blank" rel="noreferrer" style={{ color:"#25D366" }}>
          WhatsApp us
        </a>.
      </div>
    </Card>
  );
}

// ── Key Info Panel ────────────────────────────────────────────────────────────
function KeyInfoPanel({ info, onLogout, toast }) {
  const [testRes, setTR]   = useState(null);
  const [testing, setTest] = useState(false);
  const [copied, setCopied]= useState(false);

  const testAlert = async (channel) => {
    setTest(true); setTR(null);
    try {
      const r = await api("/api/alerts/test", {
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({channel}),
      });
      setTR(r);
      toast(r.result?.sent ? "Alert sent!" : "Alert failed — check Twilio config.",
            r.result?.sent ? "success" : "error");
    } catch(e) {
      setTR({error:e.message});
      toast("Test failed: "+e.message, "error");
    } finally { setTest(false); }
  };

  const copyKey = () => {
    const k = getKey();
    if (k) { navigator.clipboard.writeText(k); setCopied(true); setTimeout(()=>setCopied(false),2000); }
  };

  const pct = info.credits_total ? Math.min((info.credits_used/info.credits_total)*100,100) : 0;
  const barC = pct>90?C.coral:pct>70?C.amber:C.emerald;

  return (
    <div style={{ display:"flex",flexDirection:"column",gap:16 }}>
      <Card>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:10 }}>
          <div>
            <div style={{ fontSize:15,fontWeight:800,color:C.text }}>API Key Active</div>
            <div style={{ color:C.muted,fontSize:12,marginTop:2 }}>
              {info.key_preview} · <Badge color={C.emerald}>{info.plan?.toUpperCase()}</Badge>
            </div>
          </div>
          <div style={{ display:"flex",gap:8 }}>
            <button onClick={copyKey} style={{ background:copied?C.emerald+"20":C.surface,
              border:`1px solid ${copied?C.emerald:C.border}`,borderRadius:8,
              padding:"7px 14px",color:copied?C.emerald:C.muted,fontSize:12,
              cursor:"pointer",fontFamily:"inherit" }}>
              {copied?"Copied!":"Copy Key"}
            </button>
            <button onClick={()=>{clearKey();onLogout();}} style={{ background:C.surface,
              border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 14px",
              color:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit" }}>
              Sign Out
            </button>
          </div>
        </div>

        {/* Credit bar */}
        {info.credits_total ? (
          <>
            <div style={{ display:"flex",justifyContent:"space-between",fontSize:12,color:C.muted,marginBottom:6 }}>
              <span>{(info.credits_remaining||0).toLocaleString()} credits remaining</span>
              <span>{info.credits_used} / {info.credits_total?.toLocaleString()} used</span>
            </div>
            <div style={{ height:6,background:C.dim,borderRadius:3,overflow:"hidden" }}>
              <div style={{ width:`${pct}%`,height:"100%",background:barC,transition:"width 0.4s",borderRadius:3 }} />
            </div>
            {pct > 85 && (
              <div style={{ color:C.coral,fontSize:12,marginTop:8,fontWeight:600 }}>
                ⚠ Running low — upgrade for more credits
              </div>
            )}
          </>
        ) : (
          <div style={{ color:C.emerald,fontSize:13,fontWeight:700 }}>∞ Unlimited credits (Enterprise)</div>
        )}

        {info.pilot_restricted && (
          <div style={{ marginTop:12,padding:"8px 12px",background:C.amber+"10",
            border:`1px solid ${C.amber}33`,borderRadius:8,fontSize:12,color:C.amber }}>
            🔒 Pilot plan — AI analysis and bulk operations require Growth plan.
          </div>
        )}
      </Card>

      {/* Twilio Test */}
      <Card>
        <div style={{ fontSize:14,fontWeight:700,color:C.text,marginBottom:6 }}>System Alert Test</div>
        <div style={{ color:C.muted,fontSize:12,marginBottom:14,lineHeight:1.7 }}>
          Test your Twilio alerts. Requires{" "}
          <code style={{ color:C.accentLt,fontSize:11 }}>TWILIO_ACCOUNT_SID</code>,{" "}
          <code style={{ color:C.accentLt,fontSize:11 }}>TWILIO_AUTH_TOKEN</code>,{" "}
          <code style={{ color:C.accentLt,fontSize:11 }}>TWILIO_FROM_NUMBER</code>, and{" "}
          <code style={{ color:C.accentLt,fontSize:11 }}>TWILIO_ALERT_NUMBER</code> in Render env.
        </div>
        <div style={{ display:"flex",gap:10,flexWrap:"wrap" }}>
          {[["📱 Test SMS","sms"],["💬 Test WhatsApp","whatsapp"]].map(([label,ch])=>(
            <button key={ch} onClick={()=>testAlert(ch)} disabled={testing}
              style={{ background:C.surface,border:`1px solid ${ch==="whatsapp"?"#25D366":C.accent}`,
                borderRadius:8,padding:"9px 18px",color:ch==="whatsapp"?"#25D366":C.accentLt,
                fontSize:13,fontWeight:600,cursor:testing?"wait":"pointer",fontFamily:"inherit" }}>
              {testing?<Spinner/>:label}
            </button>
          ))}
        </div>

        {testRes && (
          <div style={{ marginTop:14,background:testRes.result?.sent?C.emerald+"10":C.coral+"10",
            border:`1px solid ${testRes.result?.sent?C.emerald:C.coral}33`,
            borderRadius:8,padding:"12px 14px" }}>
            <div style={{ color:testRes.result?.sent?C.emerald:C.coral,fontSize:13,fontWeight:700,marginBottom:8 }}>
              {testRes.result?.sent ? "✅ Alert sent successfully!" : "❌ Alert failed"}
            </div>
            {testRes.result?.sid && (
              <div style={{ fontSize:11,color:C.muted }}>SID: <code style={{ color:C.accentLt }}>{testRes.result.sid}</code></div>
            )}
            {!testRes.result?.sent && testRes.twilio && (
              <div style={{ fontSize:11,color:C.muted,lineHeight:1.9,marginTop:8 }}>
                {Object.entries(testRes.twilio).filter(([k])=>k.endsWith("_set")).map(([k,v])=>(
                  <div key={k} style={{ display:"flex",alignItems:"center",gap:8 }}>
                    <span style={{ color:v?C.emerald:C.coral }}>{v?"✓":"✗"}</span>
                    <code style={{ fontSize:10,color:v?C.muted:C.coral }}>{k}</code>
                  </div>
                ))}
                {testRes.twilio.note && (
                  <div style={{ marginTop:6,padding:"6px 8px",background:C.surface,borderRadius:6,color:C.muted,fontSize:11 }}>
                    {testRes.twilio.note}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── CSV Upload Panel ──────────────────────────────────────────────────────────
function CSVPanel({ onResult, toast }) {
  const [drag, setDrag]   = useState(false);
  const [file, setFile]   = useState(null);
  const [busy, setBusy]   = useState(false);
  const [msg,  setMsg]    = useState(null);

  const pick = (f) => {
    if (!f?.name?.toLowerCase().endsWith(".csv")) {
      toast("Only .csv files accepted.", "error"); return;
    }
    if (f.size > 10*1024*1024) {
      toast("File too large — max 10 MB.", "error"); return;
    }
    setFile(f); setMsg(null);
  };

  const upload = async () => {
    if (!file) return;
    if (!getKey()) { toast("Enter your API key in the API Keys tab first.", "warn"); return; }
    setBusy(true);
    setMsg({type:"loading", text:"Uploading and running MIMI Kernel analysis…"});
    const form = new FormData();
    form.append("file", file);
    try {
      const r = await api("/api/kernel/reset",{
        method:"POST",headers:{"X-Tenant-ID":"default"},body:form });
      const s = r.summary;
      const critN = s.hubs?.filter(h=>h.risk==="critical").length||0;
      const irpN  = s.critical_irp_hubs?.length||0;
      setMsg({type:"success",
        text:`✅ ${s.total_rows?.toLocaleString()} rows · ${s.hub_count} hubs · ${critN} critical · ${irpN} IRP>9`});
      if (r.alert_fired && r.alert_result) {
        toast(r.alert_result.sent
          ? `📱 SMS alert sent — hub critical (SID:${r.alert_result.sid})`
          : `📱 SMS not sent: ${r.alert_result.reason}`,
          r.alert_result.sent?"success":"warn", 8000);
      }
      onResult(s);
    } catch(e) {
      const d = e.data?.detail;
      if (e.status===413) {
        setMsg({type:"error",text:"Payload Too Large — file exceeds 10 MB. Split the CSV into smaller chunks."});
        toast("File too large (>10MB)", "error");
      } else if (d?.type==="SCHEMA_MISMATCH") {
        setMsg({type:"error",text:`Schema mismatch. Found: ${d.found?.slice(0,5).join(", ")}… Need: hub_id, arrival_rate, service_rate.`});
      } else {
        setMsg({type:"error",text:e.message});
        toast("Upload failed: "+e.message,"error");
      }
    } finally { setBusy(false); }
  };

  const mc = msg?.type==="success"?C.emerald:msg?.type==="error"?C.coral:C.accentLt;
  return (
    <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
      <div onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);pick(e.dataTransfer.files[0]);}}
        onClick={()=>document.getElementById("siti-file").click()}
        style={{ border:`2px dashed ${drag?C.teal:file?C.accent:C.border}`,borderRadius:16,
          padding:"42px 24px",textAlign:"center",cursor:"pointer",
          background:drag?C.teal+"06":file?C.accent+"06":"transparent",transition:"all 0.2s" }}>
        <div style={{ fontSize:40,marginBottom:10 }}>📡</div>
        {file ? (
          <>
            <div style={{ color:C.accentLt,fontSize:15,fontWeight:700 }}>{file.name}</div>
            <div style={{ color:C.muted,fontSize:12,marginTop:4 }}>{(file.size/1024).toFixed(1)} KB · click to change</div>
          </>
        ) : (
          <>
            <div style={{ color:C.text,fontSize:15,fontWeight:700,marginBottom:4 }}>Drop your logistics CSV</div>
            <div style={{ color:C.muted,fontSize:13,lineHeight:1.7 }}>
              Kaggle · Delhivery · FedEx · UPS · DHL · any global 3PL format<br/>
              Columns auto-mapped · encoding auto-detected · 10 MB max
            </div>
          </>
        )}
        <input id="siti-file" type="file" accept=".csv" style={{ display:"none" }} onChange={e=>pick(e.target.files[0])} />
      </div>

      {msg && (
        <div style={{ padding:"10px 14px",borderRadius:8,background:mc+"12",
          border:`1px solid ${mc}30`,color:mc,fontSize:13,lineHeight:1.6 }}>
          {msg.text}
        </div>
      )}

      {file && (
        <button onClick={upload} disabled={busy}
          style={{ background:busy?C.dim:C.accent,border:"none",borderRadius:12,padding:14,
            color:"white",fontSize:14,fontWeight:700,cursor:busy?"not-allowed":"pointer",
            fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:10 }}>
          {busy?<><Spinner/> Analyzing…</>:"Run MIMI Kernel Analysis →"}
        </button>
      )}
    </div>
  );
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────────
function Dashboard({ kernelData, streamData, streamActive, setStreamActive, toast, plan }) {
  const [aiResult, setAiResult]   = useState(null);
  const [aiLoading, setAiLoading] = useState(null);

  const askAI = async (hub) => {
    if (!getKey()) { toast("Enter API key first.", "warn"); return; }
    setAiLoading(hub.hub_id);
    try {
      const r = await api("/api/kernel/analyze", {
        method:"POST",headers:{"Content-Type":"application/json"},
        body: JSON.stringify(hub),
      });
      setAiResult({ hub_id: hub.hub_id, ...r });
    } catch(e) {
      toast("AI analysis failed: "+e.message, "error");
    } finally { setAiLoading(null); }
  };

  const d    = kernelData;
  const hubs = d?.hubs || [];

  return (
    <div style={{ display:"flex",flexDirection:"column",gap:22 }}>
      {aiResult && <AIModal result={aiResult} onClose={()=>setAiResult(null)} />}

      {/* Header */}
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12 }}>
        <div>
          <h1 style={{ fontSize:26,fontWeight:800,margin:"0 0 6px",letterSpacing:"-0.5px",color:C.text }}>
            Inverse Reliability Paradox
          </h1>
          <p style={{ color:C.muted,fontSize:14,margin:0,lineHeight:1.8,maxWidth:580 }}>
            Global logistics failure detection — Kalman filter + M/M/1 queueing.
            When ρ ≥ 0.85, sigmoidal decay triggers cascade failure.
          </p>
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:12 }}>
          <CreditGuard plan={plan} feature="enterprise_stream">
            <button onClick={()=>setStreamActive(s=>!s)}
              style={{ background:streamActive?C.emerald+"20":C.surface,
                border:`1px solid ${streamActive?C.emerald:C.border}`,borderRadius:10,
                padding:"8px 16px",color:streamActive?C.emerald:C.muted,
                fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit" }}>
              {streamActive?"⏹ Stop Stream":"▶ Live Stream"}
            </button>
          </CreditGuard>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12 }}>
        {[
          {label:"Total Shipments",  value:d?.total_rows?.toLocaleString()||"—", sub:"Upload CSV to analyze",  color:C.accentLt},
          {label:"Critical Hubs",    value:d?.risk_distribution?.critical??0,   sub:`${d?.risk_distribution?.warning??0} warning`, color:hubs.some(h=>h.risk==="critical")?C.coral:C.emerald},
          {label:"Total Leakage",    value:d?`$${d.total_leakage?.toFixed(0)||0}`:"—", sub:"High-priority late × $3.94",color:C.coral},
          {label:"Global Avg ρ",     value:d?.global_rho?.toFixed(4)||"—",      sub:"ρ ≥ 0.85 = critical",  color:d?.global_rho>=0.85?C.coral:d?.global_rho>=0.70?C.amber:C.emerald},
        ].map((s,i)=>(
          <Card key={i} style={{ position:"relative",overflow:"hidden" }}>
            <div style={{ position:"absolute",top:0,left:0,right:0,height:2,background:s.color }} />
            <div style={{ color:C.muted,fontSize:11,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:8 }}>{s.label}</div>
            <div style={{ fontSize:28,fontWeight:800,fontFamily:"JetBrains Mono,monospace",color:C.text,lineHeight:1 }}>
              {d===null?"···":s.value}
            </div>
            <div style={{ color:s.color,fontSize:11,marginTop:6,fontWeight:500 }}>{s.sub}</div>
          </Card>
        ))}
      </div>

      {/* IRP Alert banner */}
      {d?.alert_triggered && (
        <div style={{ background:C.coral+"10",border:`2px solid ${C.coral}44`,borderRadius:14,
          padding:"14px 20px",display:"flex",alignItems:"center",gap:14,animation:"pulse 2s infinite" }}>
          <span style={{ fontSize:24 }}>🔴</span>
          <div>
            <div style={{ color:C.coral,fontWeight:800,fontSize:14 }}>SYSTEM ALERT — IRP Score &gt; 9.0 Detected</div>
            <div style={{ color:C.muted,fontSize:12 }}>
              Critical hubs: {d.critical_irp_hubs?.join(", ")}. SMS alert fired automatically.
            </div>
          </div>
        </div>
      )}

      {/* Charts row */}
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
        <Card>
          <div style={{ fontSize:13,fontWeight:700,color:C.text,marginBottom:4 }}>
            Risk Distribution — {hubs.length} Hubs
          </div>
          <div style={{ color:C.muted,fontSize:11,marginBottom:14 }}>
            From uploaded dataset · IRP &gt; 9.0 triggers system alert
          </div>
          <RiskDonut riskDist={d?.risk_distribution} />
        </Card>
        <Card>
          <div style={{ fontSize:13,fontWeight:700,color:C.text,marginBottom:4 }}>IRP Score by Hub</div>
          <div style={{ color:C.muted,fontSize:11,marginBottom:14 }}>
            Top 10 hubs by risk · Red line = IRP 9.0 alert threshold
          </div>
          <IRPBarChart hubs={hubs} />
        </Card>
      </div>

      {/* Kalman streaming chart */}
      <Card glow={streamActive}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4,flexWrap:"wrap",gap:8 }}>
          <div>
            <div style={{ fontSize:13,fontWeight:700,color:C.text }}>
              Kalman Filter — Live Delay Probability
              {streamActive && <span style={{ color:C.emerald,fontSize:11,marginLeft:10 }}>● STREAMING</span>}
            </div>
            <div style={{ color:C.muted,fontSize:11,marginTop:2 }}>
              Real x̂ (Kalman state) from last {streamData?.length||0} shipments · dashed = ρ_c 0.85
            </div>
          </div>
        </div>
        <KalmanChart streamData={streamData} />
      </Card>

      {/* Hub cards */}
      {hubs.length > 0 ? (
        <div>
          <div style={{ fontSize:15,fontWeight:800,color:C.text,marginBottom:14 }}>
            Hub Network — {hubs.length} hubs worldwide
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14 }}>
            {hubs.map((hub,i)=>(
              <HubCard key={i} hub={hub} onAskAI={askAI}
                aiLoading={aiLoading} plan={plan||"pilot"} />
            ))}
          </div>
        </div>
      ) : !d && (
        <Card style={{ textAlign:"center",padding:"50px 24px" }}>
          <div style={{ fontSize:42,marginBottom:14 }}>🌍</div>
          <div style={{ fontSize:17,fontWeight:700,color:C.text,marginBottom:8 }}>Global Logistics Intelligence Ready</div>
          <div style={{ color:C.muted,fontSize:14,marginBottom:22,lineHeight:1.7 }}>
            Upload a CSV from any carrier — Kaggle, DHL, FedEx, UPS, Delhivery, or custom.<br/>
            Columns are auto-detected and mapped globally.
          </div>
          <button onClick={()=>window.dispatchEvent(new CustomEvent("siti:tab",{detail:"upload"}))}
            style={{ background:C.accent,border:"none",borderRadius:12,padding:"12px 28px",
              color:"white",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit" }}>
            Upload Dataset →
          </button>
        </Card>
      )}

      {/* Math section */}
      <Card>
        <div style={{ fontSize:14,fontWeight:700,color:C.text,marginBottom:14 }}>MIMI Kernel Mathematics</div>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))",gap:12 }}>
          {[
            {label:"Load Factor ρ", formula:"λ / μ",              color:C.coral,   desc:"Arrival rate over service capacity. ρ ≥ 0.85 triggers sigmoidal decay cascade."},
            {label:"Sigmoidal Φ(ρ)",formula:"1/(1+e⁻²⁰(ρ−0.85))",color:C.amberLt, desc:"Instability function — models non-linear collapse at saturation threshold."},
            {label:"IRP Score",    formula:"Φ(ρ)·ln(N+1)/K",      color:C.accentLt,desc:"Inverse Reliability Paradox — high-value shipments face worst delays at scale."},
            {label:"Kalman Gain K",formula:"P⁻/(P⁻+R)",           color:C.tealLt,  desc:"Optimal state estimate. P grows each step, K adapts to observation noise R."},
          ].map((m,i)=>(
            <div key={i} style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:16 }}>
              <div style={{ color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:"0.6px",marginBottom:6 }}>{m.label}</div>
              <div style={{ fontFamily:"JetBrains Mono,monospace",fontSize:18,color:m.color,fontWeight:700,marginBottom:8 }}>{m.formula}</div>
              <div style={{ color:C.muted,fontSize:12,lineHeight:1.6 }}>{m.desc}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Pricing ───────────────────────────────────────────────────────────────────
function Pricing({ onBuy }) {
  return (
    <div style={{ display:"flex",flexDirection:"column",gap:24 }}>
      <div style={{ textAlign:"center" }}>
        <h2 style={{ fontSize:26,fontWeight:800,margin:"0 0 8px",color:C.text }}>API Access Pricing</h2>
        <p style={{ color:C.muted,fontSize:14,margin:0 }}>
          Credit-based · No contracts · Cancel anytime · Key delivered via WhatsApp
        </p>
      </div>

      <div style={{ background:C.emerald+"0d",border:`1px solid ${C.emerald}28`,borderRadius:14,
        padding:"18px 22px",display:"flex",gap:18,alignItems:"center" }}>
        <span style={{ fontSize:28 }}>📊</span>
        <div style={{ fontSize:13,color:C.muted,lineHeight:1.8 }}>
          A 3PL with 50K shipments/month, 12% delay rate saves{" "}
          <strong style={{ color:C.text }}>₹{Math.round(50000*0.12*1200*0.15).toLocaleString()}/month</strong>{" "}
          with 15% delay reduction. Growth plan costs ₹45,999.{" "}
          <span style={{ color:C.emerald,fontWeight:700 }}>7× ROI on month one.</span>
        </div>
      </div>

      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16 }}>
        {PLANS.map(p=>(
          <div key={p.id}
            style={{ background:p.rec?C.card:C.surface,border:`1.5px solid ${p.rec?p.color:C.border}`,
              borderRadius:18,padding:"28px 22px",position:"relative",overflow:"hidden",
              boxShadow:p.rec?`0 0 40px ${p.color}14`:"none",transition:"transform 0.2s" }}
            onMouseEnter={e=>e.currentTarget.style.transform="translateY(-4px)"}
            onMouseLeave={e=>e.currentTarget.style.transform=""}>
            <div style={{ position:"absolute",top:0,left:0,right:0,height:3,background:p.color }} />
            {p.rec && (
              <div style={{ position:"absolute",top:14,right:14,background:p.color+"22",
                color:p.color,border:`1px solid ${p.color}44`,borderRadius:20,
                padding:"3px 10px",fontSize:10,fontWeight:800 }}>MOST POPULAR</div>
            )}
            <div style={{ color:p.color,fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:"1px",marginBottom:8 }}>{p.name}</div>
            <div style={{ display:"flex",alignItems:"baseline",gap:4,marginBottom:4 }}>
              <span style={{ fontFamily:"JetBrains Mono,monospace",fontSize:30,fontWeight:800,color:C.text }}>{p.price}</span>
              <span style={{ color:C.muted,fontSize:12 }}>{p.period}</span>
            </div>
            <div style={{ color:p.color,fontSize:13,fontWeight:700,marginBottom:6 }}>🎫 {p.credits} credits</div>
            <div style={{ color:C.muted,fontSize:12,marginBottom:16,fontStyle:"italic" }}>{p.tag}</div>
            <div style={{ display:"flex",flexDirection:"column",gap:8,marginBottom:20,
              paddingBottom:20,borderBottom:`1px solid ${C.border}` }}>
              {p.feats.map((f,i)=>(
                <div key={i} style={{ display:"flex",gap:8 }}>
                  <span style={{ color:p.color,flexShrink:0 }}>✓</span>
                  <span style={{ color:C.muted,fontSize:13 }}>{f}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize:11,color:C.muted,marginBottom:14,padding:"8px 10px",
              background:C.surface,borderRadius:8,lineHeight:1.6 }}>
              🔒 Key delivered to your <strong style={{ color:C.text }}>WhatsApp</strong> after payment — never shown in browser
            </div>
            <button onClick={()=>onBuy(p)}
              style={{ width:"100%",background:p.rec?p.color:"transparent",
                border:`1.5px solid ${p.color}`,borderRadius:10,padding:12,
                color:p.rec?"white":p.color,fontSize:14,fontWeight:700,
                cursor:"pointer",fontFamily:"inherit" }}>
              {p.cta}
            </button>
          </div>
        ))}
      </div>

      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,
        padding:"16px 22px",display:"flex",gap:16,alignItems:"center" }}>
        <span style={{ fontSize:22 }}>🔒</span>
        <div style={{ fontSize:13,color:C.muted,lineHeight:1.7 }}>
          <strong style={{ color:C.text }}>Secure via Cashfree</strong> · PCI-DSS · UPI, cards, net banking, wallets ·
          API key generated on payment confirmation and sent to your{" "}
          <strong style={{ color:C.text }}>WhatsApp</strong> · Key never stored in browser or shown in UI
        </div>
      </div>
    </div>
  );
}

// ── Help Center ───────────────────────────────────────────────────────────────
function HelpCenter() {
  const sections = [
    {
      title:"🚀 Getting Started",
      body:`1. Purchase a plan on the Pricing tab
2. Your API key is sent to your WhatsApp immediately after payment
3. Go to API Keys tab → paste your key → click Activate
4. Go to Dataset tab → upload your logistics CSV
5. Dashboard shows live hub analysis, Kalman predictions, and IRP scores`
    },
    {
      title:"📁 CSV Format",
      body:`SITI auto-detects columns from any global format:

Hub/Location columns:
  Warehouse_block, hub, depot, zone, dc, terminal, city (→ hub_id)

Arrival/Service rate:
  Auto-synthesized from row distribution if not present

On-time tracking:
  Reached.on.Time_Y.N, on_time_delivery, sla_met (→ on_time)
  1 = on time, 0 = late

Product priority:
  Product_importance: High / Medium / Low → triggers IRP leakage at $3.94/unit

Compatible formats: Kaggle e-commerce, Delhivery, FedEx, UPS, DHL, custom 3PL`
    },
    {
      title:"📱 Twilio Alerts",
      body:`Set in Render Dashboard → Environment Variables:

  TWILIO_ACCOUNT_SID = ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  TWILIO_AUTH_TOKEN  = xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  TWILIO_FROM_NUMBER = +1xxxxxxxxxx  (your Twilio number)
  TWILIO_ALERT_NUMBER = +91xxxxxxxxxx  (number to receive alerts)

NOTE: Free trial Twilio accounts can only send to verified numbers.
Alerts fire automatically when:
  • Any hub reaches risk = "critical" (ρ ≥ 0.85)
  • IRP score > 9.0 (high-priority shipment failure spike)
  • Kalman T+5 prediction > 88% delay probability`
    },
    {
      title:"🤖 Ask AI",
      body:`The "Ask AI — Explain This Hub" button on each hub card calls:
  OpenRouter → Google Gemini Flash

It explains the hub's logistics failure in plain English,
referencing ρ, IRP score, delay rate, and T+3 Kalman forecast.

Requires OPENROUTER_API_KEY in Render env (already configured).
Costs 5 credits per analysis.`
    },
    {
      title:"🚢 Render Deployment",
      body:`Build Command:
  pip install -r backend/requirements.txt

Start Command (EXACT):
  gunicorn backend.server:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120

Required env vars:
  CORS_ORIGINS = https://siti-gsc-kernel.vercel.app,http://localhost:3000
  API_KEYS     = siti-admin-key-001:ADMIN:enterprise
  OPENROUTER_API_KEY = sk-or-v1-...
  SUPABASE_URL = https://nwdtoqfpuzuiltcvrqgu.supabase.co
  SUPABASE_KEY = eyJhbG...
  TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER / TWILIO_ALERT_NUMBER`
    },
  ];
  return (
    <div style={{ maxWidth:760,margin:"0 auto",display:"flex",flexDirection:"column",gap:16 }}>
      <div>
        <h2 style={{ fontSize:22,fontWeight:800,margin:"0 0 6px",color:C.text }}>Help Center</h2>
        <p style={{ color:C.muted,fontSize:13,margin:0 }}>Everything you need to get SITI Intelligence running.</p>
      </div>
      {sections.map((s,i)=>(
        <Card key={i}>
          <div style={{ fontSize:14,fontWeight:700,color:C.text,marginBottom:10 }}>{s.title}</div>
          <pre style={{ margin:0,fontFamily:"JetBrains Mono,monospace",fontSize:12,
            color:C.accentLt,whiteSpace:"pre-wrap",lineHeight:1.8 }}>{s.body}</pre>
        </Card>
      ))}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]           = useState("dashboard");
  const [health, setHealth]     = useState({loading:true});
  const [keyInfo, setKeyInfo]   = useState(null);
  const [showOnce, setShowOnce] = useState(null);   // show-once key modal
  const [kernelData, setKData]  = useState(null);
  const [streamData, setSData]  = useState([]);
  const [streamActive, setStreamActive] = useState(false);
  const [payStatus, setPayStat] = useState(null);
  const { toasts, add: toast }  = useToast();
  const pollRef                 = useRef(null);
  const streamRef               = useRef(null);

  // CSS animations
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes spin { to { transform:rotate(360deg); } }
      @keyframes slideIn { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:none} }
      @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.7} }
      *{box-sizing:border-box;margin:0;padding:0}
      body{background:#07070f;color:#e2e2f0;font-family:'Syne',sans-serif;-webkit-font-smoothing:antialiased}
      ::-webkit-scrollbar{width:5px;height:5px}
      ::-webkit-scrollbar-track{background:#0d0d1c}
      ::-webkit-scrollbar-thumb{background:#252545;border-radius:3px}
      ::-webkit-scrollbar-thumb:hover{background:#6366f1}
    `;
    document.head.appendChild(style);
  }, []);

  // Tab event listener
  useEffect(() => {
    const h = e => setTab(e.detail);
    window.addEventListener("siti:tab", h);
    return () => window.removeEventListener("siti:tab", h);
  }, []);

  // Payment return check
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("payment") === "success") {
      setPayStat({ plan:p.get("plan"), order:p.get("order_id") });
      setTab("keys");
      toast("Payment confirmed! Enter your API key below.", "success", 8000);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Health check with real Twilio/Supabase status
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch(`${API}/health`);
        const d = await r.json();
        setHealth({ ...d, loading:false });
        // Fire toast if Twilio not configured
        if (d.twilio === "not_configured") {
          // Silent — shown in Keys tab instead
        }
      } catch {
        setHealth({ status:"offline", loading:false });
      }
    };
    check();
    const t = setInterval(check, 30_000);
    return () => clearInterval(t);
  }, []);

  // Session key → auto-verify
  useEffect(() => {
    const k = getKey();
    if (k) {
      api("/api/keys/info", {}, k)
        .then(info => setKeyInfo(info))
        .catch(() => clearKey());
    }
  }, []);

  // Kernel data poll
  useEffect(() => {
    if (!getKey()) return;
    const poll = async () => {
      try {
        const d = await api("/api/kernel/status");
        setKData(d);
        // Toast if IRP alert
        if (d.alert_triggered && !kernelData?.alert_triggered) {
          toast(`🔴 IRP Alert — Critical hubs: ${d.critical_irp_hubs?.join(", ")}`, "error", 10000);
        }
      } catch {}
    };
    poll();
    pollRef.current = setInterval(poll, 10_000);
    return () => clearInterval(pollRef.current);
  }, [keyInfo]);

  // Streaming (last 50 rows for Kalman animation)
  useEffect(() => {
    if (!streamActive || !getKey()) {
      clearInterval(streamRef.current);
      return;
    }
    const fetch_ = async () => {
      try {
        const r = await api("/api/kernel/stream?n=50");
        if (r.rows?.length) setSData(r.rows);
      } catch {}
    };
    fetch_();
    streamRef.current = setInterval(fetch_, 2000);
    return () => clearInterval(streamRef.current);
  }, [streamActive, keyInfo]);

  // Payment handler
  const handleBuy = async (plan) => {
    if (!plan.amt) {
      window.open(`https://wa.me/${WA}?text=${encodeURIComponent(`Hi! I'm interested in SITI Intelligence Enterprise plan. Please share pricing.`)}`, "_blank");
      return;
    }
    const k = getKey();
    if (!k) { toast("Enter a demo API key first to initiate payment.", "warn"); setTab("keys"); return; }
    try {
      const r = await api("/api/payments/create-order", {
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({plan:plan.id, amount:plan.amt}),
      });
      if (r.fallback && r.whatsapp_url) { window.open(r.whatsapp_url,"_blank"); return; }
      if (r.payment_session_id) {
        const loaded = await new Promise(res => {
          if (window.Cashfree) return res(true);
          const s = document.createElement("script");
          s.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
          s.onload = ()=>res(true); s.onerror=()=>res(false);
          document.head.appendChild(s);
        });
        if (loaded && window.Cashfree) {
          new window.Cashfree({mode:"production"}).checkout({
            paymentSessionId: r.payment_session_id,
            returnUrl:`${window.location.origin}?payment=success&plan=${plan.id}&order_id=${r.order_id}`,
          }); return;
        }
      }
    } catch(e) { console.error("Payment:", e); }
    window.open(`https://wa.me/${WA}?text=${encodeURIComponent(`Hi! I want to buy SITI ${plan.name} (${plan.price}/month).`)}`, "_blank");
  };

  const hc = health.loading?"checking…":health.status==="healthy"?"Online":health.status==="offline"?"Offline":"Degraded";
  const hcColor = health.loading?C.amber:health.status==="healthy"?C.emerald:C.coral;

  const TABS = [
    {id:"dashboard",label:"Dashboard"},
    {id:"upload",   label:"Dataset"},
    {id:"pricing",  label:"Pricing"},
    {id:"keys",     label:keyInfo?`Keys · ${keyInfo.plan?.toUpperCase()}`:"API Keys"},
    {id:"help",     label:"Help"},
  ];

  return (
    <div style={{ minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'Syne',sans-serif" }}>
      <style>{FONTS}</style>
      <ToastContainer toasts={toasts} />
      {showOnce && <ShowOnceModal keyData={showOnce} onClose={()=>setShowOnce(null)} />}

      {/* Nav */}
      <nav style={{ background:C.surface+"ee",borderBottom:`1px solid ${C.border}`,
        position:"sticky",top:0,zIndex:200,backdropFilter:"blur(12px)" }}>
        <div style={{ maxWidth:1200,margin:"0 auto",padding:"0 24px",
          display:"flex",alignItems:"center",height:56,gap:20 }}>
          <div style={{ display:"flex",alignItems:"center",gap:10,flexShrink:0 }}>
            <div style={{ width:30,height:30,borderRadius:8,
              background:`linear-gradient(135deg,${C.accent},${C.teal})`,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontWeight:900,fontSize:14,color:"white" }}>S</div>
            <span style={{ fontWeight:800,fontSize:15 }}>SITI Intelligence</span>
            <span style={{ color:C.muted,fontSize:10,fontFamily:"JetBrains Mono,monospace" }}>v6.0</span>
          </div>

          <div style={{ display:"flex",gap:2,flex:1,overflowX:"auto" }}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{
                background:tab===t.id?C.accent+"18":"transparent",
                border:"none",borderBottom:`2px solid ${tab===t.id?C.accent:"transparent"}`,
                color:tab===t.id?C.accentLt:C.muted,
                padding:"8px 14px",fontSize:13,cursor:"pointer",
                fontFamily:"inherit",fontWeight:tab===t.id?700:400,whiteSpace:"nowrap",
                transition:"all 0.15s"
              }}>{t.t||t.label}</button>
            ))}
          </div>

          <div style={{ display:"flex",alignItems:"center",gap:12,flexShrink:0 }}>
            <a href={`https://wa.me/${WA}?text=${encodeURIComponent("Hi! I'd like to know more about SITI Intelligence.")}`}
              target="_blank" rel="noreferrer"
              style={{ background:"#25D366",border:"none",borderRadius:8,padding:"6px 12px",
                color:"white",fontSize:12,fontWeight:700,textDecoration:"none" }}>
              💬 Support
            </a>
            <div style={{ display:"flex",alignItems:"center",gap:6,fontSize:11 }}>
              <StatusDot ok={health.status==="healthy"} loading={health.loading} />
              <span style={{ color:hcColor }}>{hc}</span>
              {health.twilio && (
                <span title={`Twilio: ${health.twilio}`}
                  style={{ color:health.twilio==="connected"?C.emerald:C.muted,fontSize:10 }}>
                  · {health.twilio==="connected"?"📱":""}{health.twilio}
                </span>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div style={{ maxWidth:1200,margin:"0 auto",padding:"28px 24px" }}>

        {tab === "dashboard" && (
          <Dashboard
            kernelData={kernelData}
            streamData={streamData}
            streamActive={streamActive}
            setStreamActive={setStreamActive}
            toast={toast}
            plan={keyInfo?.plan}
          />
        )}

        {tab === "upload" && (
          <div style={{ maxWidth:760,margin:"0 auto",display:"flex",flexDirection:"column",gap:20 }}>
            <div>
              <h2 style={{ fontSize:22,fontWeight:800,margin:"0 0 6px",color:C.text }}>Dataset Upload</h2>
              <p style={{ color:C.muted,fontSize:13,margin:0,lineHeight:1.7 }}>
                Upload any global logistics CSV. Columns auto-mapped · Encoding auto-detected · 10 MB limit
              </p>
            </div>
            {!getKey() && (
              <div style={{ padding:"12px 16px",background:C.amber+"10",
                border:`1px solid ${C.amber}33`,borderRadius:10,color:C.amber,fontSize:13 }}>
                ⚠ Enter your API key in the{" "}
                <button onClick={()=>setTab("keys")} style={{ background:"none",border:"none",
                  color:C.amberLt,cursor:"pointer",fontSize:13,textDecoration:"underline" }}>
                  API Keys tab
                </button>{" "}before uploading.
              </div>
            )}
            <Card>
              <CSVPanel onResult={d=>{setKData(d);setTab("dashboard");}} toast={toast} />
            </Card>
            <Card>
              <div style={{ fontSize:13,fontWeight:700,color:C.text,marginBottom:12 }}>Global Column Mappings</div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
                {[
                  ["hub_id","Warehouse_block · hub · depot · zone · dc · terminal · city"],
                  ["arrival_rate","Auto-synthesized from shipment distribution"],
                  ["service_rate","Auto-synthesized (equal capacity / hub count)"],
                  ["on_time","Reached.on.Time_Y.N · sla_met · delivered · on_time_flag"],
                  ["product_importance","Product_importance · priority · service_level · tier"],
                  ["shipment_id","ID · order_id · awb · tracking_number · waybill"],
                ].map(([siti,maps],i)=>(
                  <div key={i} style={{ background:C.surface,borderRadius:8,padding:"10px 12px" }}>
                    <div style={{ fontFamily:"JetBrains Mono,monospace",fontSize:11,color:C.accentLt,marginBottom:4 }}>{siti}</div>
                    <div style={{ color:C.muted,fontSize:11 }}>{maps}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {tab === "pricing" && <Pricing onBuy={handleBuy} />}

        {tab === "keys" && (
          <div style={{ maxWidth:680,margin:"0 auto",display:"flex",flexDirection:"column",gap:20 }}>
            <div>
              <h2 style={{ fontSize:22,fontWeight:800,margin:"0 0 6px",color:C.text }}>API Keys & Credits</h2>
              <p style={{ color:C.muted,fontSize:13,margin:0 }}>
                Keys stored in session only · Never in JS bundle · Cleared on tab close
              </p>
            </div>

            {payStatus && (
              <div style={{ background:C.emerald+"10",border:`1px solid ${C.emerald}40`,
                borderRadius:12,padding:"14px 18px" }}>
                <div style={{ color:C.emerald,fontWeight:800,marginBottom:4 }}>🎉 Payment confirmed!</div>
                <div style={{ color:C.muted,fontSize:13 }}>
                  Plan: <strong style={{ color:C.text }}>{payStatus.plan?.toUpperCase()}</strong><br/>
                  Order: {payStatus.order}<br/>
                  Your API key has been sent to your WhatsApp. Paste it below.
                </div>
              </div>
            )}

            {keyInfo
              ? <KeyInfoPanel info={keyInfo} onLogout={()=>{setKeyInfo(null);}} toast={toast} />
              : <KeyEntry onKeySet={info=>{setKeyInfo(info); toast("API key activated — welcome!", "success");}} />
            }
          </div>
        )}

        {tab === "help" && <HelpCenter />}
      </div>

      <footer style={{ background:C.surface,borderTop:`1px solid ${C.border}`,marginTop:60,padding:"28px 24px" }}>
        <div style={{ maxWidth:1200,margin:"0 auto",display:"flex",justifyContent:"space-between",
          alignItems:"center",flexWrap:"wrap",gap:14 }}>
          <div>
            <div style={{ fontWeight:800,fontSize:14,color:C.text }}>SITI Intelligence</div>
            <div style={{ color:C.muted,fontSize:11,marginTop:3 }}>Logic for the Paradox · MIMI Kernel v6.0 · Global Logistics</div>
          </div>
          <div style={{ display:"flex",gap:18,alignItems:"center",flexWrap:"wrap",fontSize:13 }}>
            <a href={`https://wa.me/${WA}`} target="_blank" rel="noreferrer" style={{ color:"#25D366",textDecoration:"none",fontWeight:600 }}>💬 WhatsApp</a>
            <button onClick={()=>setTab("help")} style={{ background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13,fontFamily:"inherit" }}>Help Center</button>
            <span style={{ color:C.dim,fontSize:11 }}>© 2026 SITI Intelligence</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
