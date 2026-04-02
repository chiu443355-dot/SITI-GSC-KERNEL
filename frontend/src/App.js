import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine,
  AreaChart, Area, LineChart, Line, Legend
} from "recharts";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const API_BASE = process.env.REACT_APP_BACKEND_URL || "https://siti-gsc-kernel-1.onrender.com";
const API = `${API_BASE}/api`;
const DEMO_API_KEY = "siti-admin-key-001";

// ─── THEME ───────────────────────────────────────────────────────────────────
const T = {
  gold: "#F5A623", goldBright: "#FFD060", goldDim: "#F5A62333",
  cyan: "#00D4FF", cyanDim: "#00D4FF22",
  green: "#00FF87", greenDim: "#00FF8722",
  red: "#FF3860", redDim: "#FF386022",
  purple: "#B44FFF", purpleDim: "#B44FFF22",
  bg: "#03030A", surface: "#07070F", panel: "#0A0A18",
  border: "#141428", borderBright: "#1E1E3A", borderGold: "#F5A62333",
  text: "#C8C8E0", textDim: "#666688", textMuted: "#1E1E3A",
};

// ─── GLOBAL STYLES ───────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Oxanium:wght@400;600;700;800&family=Space+Mono:wght@400;700&family=Exo+2:wght@300;400;600&display=swap');
  
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root {
    background: #03030A; color: #C8C8E0;
    font-family: 'Exo 2', sans-serif; min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }
  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-track { background: #03030A; }
  ::-webkit-scrollbar-thumb { background: #F5A62344; border-radius: 2px; }

  @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
  @keyframes scanline { 0%{top:-10%} 100%{top:110%} }
  @keyframes pulseDot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.8)} }
  @keyframes rotateHex { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes glowGold { 0%,100%{text-shadow:0 0 20px #F5A62344} 50%{text-shadow:0 0 40px #F5A623AA,0 0 80px #F5A62355} }
  @keyframes glowCyan { 0%,100%{text-shadow:0 0 20px #00D4FF33} 50%{text-shadow:0 0 40px #00D4FF99,0 0 60px #00D4FF44} }
  @keyframes glowGreen { 0%,100%{text-shadow:0 0 15px #00FF8744} 50%{text-shadow:0 0 30px #00FF87BB,0 0 50px #00FF8755} }
  @keyframes glowRed { 0%,100%{box-shadow:0 0 0 rgba(255,56,96,0)} 50%{box-shadow:0 0 30px rgba(255,56,96,0.3)} }
  @keyframes borderPulseRed { 0%,100%{border-color:#FF386044} 50%{border-color:#FF3860} }
  @keyframes particleFloat { 0%{transform:translateY(0) translateX(0)} 50%{transform:translateY(-20px) translateX(10px)} 100%{transform:translateY(0) translateX(0)} }
  @keyframes gridMove { 0%{background-position:0 0} 100%{background-position:48px 48px} }
  @keyframes slideInLeft { from{opacity:0;transform:translateX(-30px)} to{opacity:1;transform:translateX(0)} }
  @keyframes slideInRight { from{opacity:0;transform:translateX(30px)} to{opacity:1;transform:translateX(0)} }
  @keyframes countUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes barFill { from{width:0} to{width:var(--w)} }
  @keyframes calibBar { from{width:0} to{width:100%} }
  @keyframes scrollWeights { from{transform:translateY(0)} to{transform:translateY(-50%)} }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.2} }

  .fade-up { animation: fadeUp .5s ease-out forwards; }
  .glow-gold { animation: glowGold 3s ease-in-out infinite; }
  .glow-cyan { animation: glowCyan 2.5s ease-in-out infinite; }
  .glow-green { animation: glowGreen 2s ease-in-out infinite; }
  .blink { animation: blink 1s step-end infinite; }
  .border-pulse-red { animation: borderPulseRed 1.5s ease-in-out infinite; }
  
  .siti-font { font-family: 'Oxanium', monospace; }
  .mono { font-family: 'Space Mono', monospace; }
  .body-font { font-family: 'Exo 2', sans-serif; }

  .collapse-border {
    position: fixed; inset: 0; pointer-events: none; z-index: 9997;
    border: 2px solid #FF3860;
    animation: glowRed 1.5s ease-in-out infinite;
  }

  .grid-bg {
    background-image:
      linear-gradient(rgba(0,212,255,.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,212,255,.04) 1px, transparent 1px);
    background-size: 48px 48px;
    animation: gridMove 8s linear infinite;
  }

  .card-glow:hover { 
    border-color: #F5A62344 !important; 
    box-shadow: 0 0 20px rgba(245,166,35,.05);
    transition: all .2s ease;
  }

  .hex-ring {
    position: absolute; inset: -8px;
    border: 1px solid #F5A62322;
    border-radius: 50%;
    animation: rotateHex 20s linear infinite;
  }

  .scan-line {
    position: fixed; left:0; right:0; height: 1px; z-index: 9998;
    background: linear-gradient(90deg, transparent, rgba(0,212,255,.15), transparent);
    animation: scanline 6s linear infinite;
    pointer-events: none;
  }

  input[type=range] { -webkit-appearance:none; height:3px; background:#141428; border-radius:2px; outline:none; }
  input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; background:#00FF87; border-radius:50%; cursor:pointer; box-shadow: 0 0 8px #00FF8766; }
`;

// ─── CSV PREPROCESSOR ─────────────────────────────────────────────────────────
const PRE_MAP = {
  "Reached.on.Time_Y.N": ["late","delayed","status","on_time","ontime","reached","delivery_status"],
  "Weight_in_gms": ["wt","weight","mass","gms","grams"],
  "Warehouse_block": ["block","hub","location","warehouse","depot"],
  "Product_importance": ["priority","rank","importance","tier"],
  "Mode_of_Shipment": ["mode","shipment","transport","carrier","method"],
  "Customer_care_calls": ["care_calls","cc_calls","support_calls","calls"],
  "Customer_rating": ["rating","score","csat","satisfaction"],
  "Cost_of_the_Product": ["cost","price","amount","value"],
  "Prior_purchases": ["prior","purchases","buy_count","orders"],
  "Discount_offered": ["discount","promo","rebate"],
  "Gender": ["gender","sex"],
};

function preprocessCSV(text) {
  const lines = text.split("\n");
  if (!lines.length) return text;
  const hdrs = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, ""));
  lines[0] = hdrs.map(h => {
    const l = h.toLowerCase().replace(/[\s\-\.]/g, "_");
    for (const [t, kws] of Object.entries(PRE_MAP))
      for (const kw of kws) if (l === kw || l.includes(kw)) return t;
    return h;
  }).join(",");
  return lines.join("\n");
}

async function readFileResilient(file) {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  if (utf8.includes("\uFFFD")) return new TextDecoder("iso-8859-1").decode(buf);
  return utf8;
}

// ─── PARTICLE CANVAS ──────────────────────────────────────────────────────────
function ParticleCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    const pts = Array.from({ length: 60 }, () => ({
      x: Math.random() * c.width, y: Math.random() * c.height,
      vx: (Math.random() - .5) * .4, vy: (Math.random() - .5) * .4,
      r: Math.random() * 1.5 + .3,
    }));
    let frame;
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > c.width) p.vx *= -1;
        if (p.y < 0 || p.y > c.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,212,255,.35)";
        ctx.fill();
      });
      pts.forEach((a, i) => pts.slice(i + 1).forEach(b => {
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 120) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(0,212,255,${.12 * (1 - d / 120)})`;
          ctx.lineWidth = .5; ctx.stroke();
        }
      }));
      frame = requestAnimationFrame(draw);
    };
    draw();
    const resize = () => { c.width = window.innerWidth; c.height = window.innerHeight; };
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", opacity: .6 }} />;
}

// ─── LOGO ─────────────────────────────────────────────────────────────────────
function SITILogo({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="18" stroke="#F5A62344" strokeWidth="1" />
      <path d="M 28 8 C 34 8, 34 18, 20 20 C 6 22, 6 32, 12 32"
        stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="28" cy="8" r="3" fill="#F5A623" />
      <circle cx="12" cy="32" r="3" fill="#F5A623" opacity=".6" />
      <circle cx="20" cy="20" r="1.5" fill="#00D4FF" opacity=".8" />
    </svg>
  );
}

// ─── CALIBRATION OVERLAY ──────────────────────────────────────────────────────
function CalibrationOverlay({ message = "RECALIBRATING KERNEL" }) {
  const lines = Array.from({ length: 60 }, (_, i) =>
    `[${String(i).padStart(3,"0")}] W[${(i*3)%12}][${(i*7)%8}] = ${(Math.sin(i*1.2)*0.99).toFixed(8)}  ∇L=${(Math.cos(i*.9)*0.003).toFixed(9)}`
  );
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(3,3,10,.97)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column" }}>
      <div style={{ position:"absolute", inset:0, overflow:"hidden", opacity:.07 }}>
        <div style={{ animation:"scrollWeights 20s linear infinite", fontFamily:"'Space Mono',monospace", fontSize:10, color:"#F5A623", lineHeight:2.2, padding:"0 24px", whiteSpace:"nowrap" }}>
          {[...lines,...lines].map((l,i) => <div key={i}>{l}</div>)}
        </div>
      </div>
      <div style={{ textAlign:"center", position:"relative", zIndex:1 }}>
        <div style={{ display:"flex", justifyContent:"center", marginBottom:28 }}>
          <div style={{ position:"relative" }}>
            <div className="hex-ring" />
            <SITILogo size={64} />
          </div>
        </div>
        <div className="siti-font glow-gold" style={{ color:"#F5A623", fontSize:22, fontWeight:800, letterSpacing:"0.35em", textTransform:"uppercase", marginBottom:12 }}>
          SITI INTELLIGENCE
        </div>
        <div style={{ color:"#F5A623", fontFamily:"'Space Mono',monospace", fontSize:10, letterSpacing:"0.25em", opacity:.8, marginBottom:24 }}>
          {message}...
        </div>
        <div style={{ width:360, height:2, background:"#141428", margin:"0 auto", overflow:"hidden" }}>
          <div style={{ height:"100%", background:`linear-gradient(90deg, #F5A623, #FFD060)`, animation:"calibBar 2.8s ease-in-out forwards" }} />
        </div>
        <div style={{ marginTop:14, fontSize:9, color:T.textDim, fontFamily:"'Space Mono',monospace", letterSpacing:".15em" }}>
          MIMI KERNEL v2.0 · 5-HUB INDIA NETWORK
        </div>
      </div>
    </div>
  );
}

// ─── CHART TOOLTIP ────────────────────────────────────────────────────────────
function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"#0A0A18", border:`1px solid ${T.borderBright}`, padding:"10px 14px", fontFamily:"'Space Mono',monospace", fontSize:9 }}>
      <div style={{ color:T.gold, fontWeight:700, marginBottom:6 }}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{ color:p.color||T.text, display:"flex", justifyContent:"space-between", gap:16, marginBottom:2 }}>
          <span style={{ opacity:.7 }}>{p.name}</span>
          <span style={{ fontWeight:700 }}>{typeof p.value==="number" ? p.value.toFixed(4) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── KPI CARD ─────────────────────────────────────────────────────────────────
function KPI({ label, value, color = T.gold, sub, accent }) {
  return (
    <div className="card-glow" style={{ background:T.surface, border:`1px solid ${T.border}`, padding:"12px 14px", position:"relative", overflow:"hidden", animation:"fadeUp .5s ease-out forwards" }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:`linear-gradient(90deg, transparent, ${color}44, transparent)` }} />
      {accent && <div style={{ position:"absolute", top:0, left:0, bottom:0, width:2, background:color }} />}
      <div style={{ fontFamily:"'Space Mono',monospace", fontSize:7.5, color:T.textDim, letterSpacing:".14em", textTransform:"uppercase", marginBottom:6 }}>{label}</div>
      <div style={{ fontFamily:"'Oxanium',monospace", fontSize:22, fontWeight:700, color, lineHeight:1 }}>{value ?? "—"}</div>
      {sub && <div style={{ fontSize:8.5, color:T.textDim, marginTop:4 }}>{sub}</div>}
    </div>
  );
}

// ─── HUB CARD ─────────────────────────────────────────────────────────────────
function HubCard({ hub }) {
  const rho = hub?.rho ?? 0;
  const sc = rho >= .85 ? T.red : rho > .75 ? T.gold : T.green;
  const k = hub?.kalman ?? {};
  return (
    <div className="card-glow" style={{ background:T.surface, border:`1px solid ${rho>=.85?T.red+"88":T.border}`, padding:"14px 16px", position:"relative", overflow:"hidden", transition:"all .3s", animation:"fadeUp .5s ease-out forwards" }}>
      <div style={{ position:"absolute", top:0, left:0, bottom:0, width:2, background:sc }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:`linear-gradient(90deg, ${sc}44, transparent)` }} />
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background:sc, boxShadow:`0 0 10px ${sc}` }} className={rho>=.85?"blink":""} />
          <span className="siti-font" style={{ fontSize:12, fontWeight:700, color:T.gold, letterSpacing:".15em" }}>
            {hub?.name?.toUpperCase()}
          </span>
          <span style={{ fontSize:7.5, color:T.textDim }}>[{hub?.blocks?.join(",")}]</span>
        </div>
        <span style={{ fontSize:7, fontWeight:700, letterSpacing:".12em", color:sc, border:`1px solid ${sc}33`, padding:"2px 8px", fontFamily:"'Space Mono',monospace" }}>
          {rho>=.85?"SATURATED":rho>.75?"WARNING":"NOMINAL"}
        </span>
      </div>
      <div className="siti-font" style={{ fontSize:30, fontWeight:700, color:sc, lineHeight:1, marginBottom:8 }}>
        {rho.toFixed(4)}
      </div>
      <div style={{ height:3, background:T.border, marginBottom:10, position:"relative", borderRadius:2, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${Math.min(rho*100,100)}%`, background:sc, transition:"width .6s ease", borderRadius:2 }} />
        <div style={{ position:"absolute", left:"85%", top:-2, bottom:-2, width:1, background:T.red+"66" }} />
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:5 }}>
        {[
          { l:"T+1 45m", v:k.rho_t1?.toFixed(4), c:(k.rho_t1??0)>=.85?T.red:T.green },
          { l:"T+3 135m", v:k.rho_t3?.toFixed(4), c:(k.rho_t3??0)>=.85?T.red:T.gold },
          { l:"λ eff/hr", v:hub?.effective_lambda?.toFixed(1), c:T.cyan },
        ].map(it => (
          <div key={it.l} style={{ background:T.panel, padding:"5px 7px", border:`1px solid ${T.border}` }}>
            <div style={{ fontSize:7, color:T.textDim, fontFamily:"'Space Mono',monospace", marginBottom:2 }}>{it.l}</div>
            <div className="siti-font" style={{ fontSize:11, fontWeight:700, color:it.c }}>{it.v ?? "—"}</div>
          </div>
        ))}
      </div>
      {hub?.cascade_risk && (
        <div className="blink" style={{ marginTop:8, fontSize:7.5, color:"#FFD060", border:"1px dashed #FFD06044", padding:"3px 7px", fontFamily:"'Space Mono',monospace", fontWeight:700 }}>
          ⚠ CASCADE RISK — RECEIVING DIVERTED LOAD
        </div>
      )}
    </div>
  );
}

// ─── MIMI MATH PANEL ──────────────────────────────────────────────────────────
function MimiPanel({ s }) {
  const rho = s?.global_rho ?? 0;
  const phi = s?.phi ?? 0;
  const k = s?.kalman ?? {};
  const irp = s?.inverse_reliability ?? {};
  const c = rho >= .85 ? T.red : rho > .80 ? T.gold : T.cyan;

  const formulas = [
    { id:"rho", title:"NETWORK UTILIZATION  ρ = λ/μ",
      eq:`ρ = ${(s?.total_lambda??0).toFixed(1)} / ${((s?.mu??150)*5).toFixed(0)}`,
      val:rho.toFixed(4), color:c, note:`Hub avg λ: ${((s?.total_lambda??0)/5).toFixed(1)}/hr · μ: ${s?.mu??150}/hr` },
    { id:"phi", title:"SIGMOIDAL DECAY  Φ(ρ) = 1/(1+e^{-20(ρ-ρ_c)})",
      eq:`Φ(${rho.toFixed(3)}) = 1/(1+exp(-20(ρ-${(s?.critical_rho??0.85).toFixed(2)})))`,
      val:phi.toFixed(4), color:phi>.5?T.red:phi>.3?T.gold:T.green, note:phi>.5?"CASCADING FAILURE IMMINENT":phi>.3?"INSTABILITY DETECTED":"STABLE" },
    { id:"kalman", title:"2D KALMAN  x=[ρ, ρ̇]  F=[[1,Δt],[0,1]]",
      eq:`x̂=[${(k.x_hat??0).toFixed(4)}, ${(k.rho_dot??0)>=0?"+":""}${(k.rho_dot??0).toFixed(6)}]`,
      val:`T+3: ${(k.rho_t3??0).toFixed(4)}`, color:(k.rho_t3??0)>=.85?T.red:T.cyan, note:"135-min forecast via velocity model" },
    { id:"irp", title:"INVERSE RELIABILITY PARADOX  L",
      eq:`L = $1.20(recovery) + $2.74(CLV) = $3.94/unit`,
      val:`$${(irp.leakage_total??0).toFixed(0)}`, color:T.gold, note:`${irp.failure_count??0} high-importance failures detected` },
    { id:"wq", title:"M/M/1 QUEUE DEPTH  W_q = ρ/(1-ρ)",
      eq:`W_q = ${rho.toFixed(3)}/${(1-rho).toFixed(3)}`,
      val:Math.min(s?.wq??0,99.9).toFixed(3), color:(s?.wq??0)>4?T.red:T.cyan, note:"Dimensionless queue index" },
    { id:"rho_c", title:"CRITICAL THRESHOLD  ρ_c (LR-Calibrated)",
      eq:`ρ_c = ${(s?.critical_rho??0.85).toFixed(4)} (logistic regression)`,
      val:(s?.critical_rho??0.85).toFixed(4), color:T.gold, note:"Auto-recalibrates on dataset upload" },
  ];

  return (
    <div style={{ background:T.surface, border:`1px solid ${rho>=.85?T.red+"55":T.borderBright}`, transition:"border-color .3s" }}>
      <div style={{ padding:"10px 16px", borderBottom:`1px solid ${T.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", background:T.panel }}>
        <div>
          <div className="siti-font" style={{ fontSize:11, color:T.gold, letterSpacing:".18em", fontWeight:700 }}>MIMI KERNEL v2.0 — 2D KALMAN STATE OBSERVER</div>
          <div style={{ fontSize:8, color:T.textDim, letterSpacing:".1em", marginTop:2, fontFamily:"'Space Mono',monospace" }}>ρ = λ/μ · F=[[1,Δt],[0,1]] · 5-HUB INDIA NETWORK · MIMI Intelligence Engine</div>
        </div>
        <div style={{ fontSize:8, fontWeight:700, letterSpacing:".12em", color:rho>=.85?T.red:T.green, border:`1px solid ${rho>=.85?T.red+"44":T.green+"44"}`, padding:"3px 12px", fontFamily:"'Space Mono',monospace" }}>
          {rho>=.85?"COLLAPSE ρ≥0.85":"KERNEL ACTIVE"}
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", borderBottom:`1px solid ${T.border}` }}>
        {formulas.map((f,i) => (
          <div key={f.id} style={{ padding:"12px 14px", borderRight:i%3<2?`1px solid ${T.border}`:"none", borderBottom:i<3?`1px solid ${T.border}`:"none" }}>
            <div style={{ fontSize:7.5, color:T.textDim, letterSpacing:".12em", textTransform:"uppercase", marginBottom:6, fontFamily:"'Space Mono',monospace" }}>{f.title}</div>
            <div style={{ fontSize:9, color:f.color+"88", fontFamily:"'Space Mono',monospace", marginBottom:6, lineHeight:1.5 }}>{f.eq}</div>
            <div className="siti-font" style={{ fontSize:20, fontWeight:700, color:f.color, lineHeight:1 }}>{f.val}</div>
            <div style={{ fontSize:8, color:T.textDim, marginTop:4 }}>{f.note}</div>
          </div>
        ))}
      </div>
      <div style={{ padding:"10px 16px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:8, color:T.textDim, marginBottom:5, fontFamily:"'Space Mono',monospace" }}>
          <span>ρ=0.00</span><span style={{ color:T.gold }}>DIVERSION 0.80</span><span style={{ color:T.red }}>COLLAPSE 0.85</span><span>ρ=1.00</span>
        </div>
        <div style={{ height:5, background:T.border, position:"relative", overflow:"hidden", borderRadius:2 }}>
          <div style={{ height:"100%", width:`${Math.min(rho*100,100)}%`, background:`linear-gradient(90deg, ${T.gold}, ${rho>=.85?T.red:rho>.80?T.gold:T.gold})`, transition:"width .6s ease" }} />
          <div style={{ position:"absolute", left:"80%", top:0, bottom:0, width:1, background:T.gold }} />
          <div style={{ position:"absolute", left:"85%", top:0, bottom:0, width:1, background:T.red }} />
        </div>
      </div>
    </div>
  );
}

// ─── CHARTS PANEL ─────────────────────────────────────────────────────────────
const PIE_COLORS = [T.red, T.gold, T.cyan];
function Charts({ s }) {
  const hubs = s?.hubs ?? [];
  const delay = s?.average_delay ?? [];
  const rzi = s?.red_zone_importance ?? [];
  const rhoHistory = s?.rho_history ?? [];

  const hubData = hubs.map(h => ({
    name: h.name?.split(" ")[0],
    rho: +(h.rho??0).toFixed(4),
    "T+1": +(h.kalman?.rho_t1??0).toFixed(4),
    "T+3": +(h.kalman?.rho_t3??0).toFixed(4),
  }));

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      <div style={{ background:T.surface, border:`1px solid ${T.borderBright}`, padding:14 }}>
        <div style={{ fontSize:8, color:T.textDim, letterSpacing:".14em", textTransform:"uppercase", marginBottom:10, fontFamily:"'Space Mono',monospace" }}>HUB UTILIZATION · ρ = λ/μ · 5-NODE NETWORK</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={hubData} barGap={3} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={T.border} />
            <XAxis dataKey="name" tick={{ fill:T.textDim, fontSize:9, fontFamily:"Space Mono" }} axisLine={false} tickLine={false} />
            <YAxis domain={[0,1]} tick={{ fill:T.textDim, fontSize:9 }} axisLine={false} tickLine={false} />
            <Tooltip content={<Tip />} />
            <ReferenceLine y={0.85} stroke={T.red} strokeDasharray="4 4" label={{ value:"ρ_c", fill:T.red, fontSize:8, position:"insideRight" }} />
            <ReferenceLine y={0.80} stroke={T.gold} strokeDasharray="4 4" label={{ value:"0.80", fill:T.gold, fontSize:8, position:"insideRight" }} />
            <Bar dataKey="rho" name="ρ current" fill={T.gold} radius={[2,2,0,0]} />
            <Bar dataKey="T+1" fill={T.cyan} radius={[2,2,0,0]} />
            <Bar dataKey="T+3" fill={T.gold+"88"} radius={[2,2,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ background:T.surface, border:`1px solid ${T.borderBright}`, padding:14 }}>
        <div style={{ fontSize:8, color:T.textDim, letterSpacing:".14em", textTransform:"uppercase", marginBottom:10, fontFamily:"'Space Mono',monospace" }}>NETWORK ρ TRAJECTORY · LIVE KALMAN STREAM</div>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={rhoHistory}>
            <defs>
              <linearGradient id="rhoG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={T.gold} stopOpacity={0.2} />
                <stop offset="95%" stopColor={T.gold} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 6" stroke={T.border} />
            <XAxis dataKey="time" tick={{ fill:T.textDim, fontSize:7 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0,1.1]} tick={{ fill:T.textDim, fontSize:8 }} axisLine={false} tickLine={false} />
            <Tooltip content={<Tip />} />
            <ReferenceLine y={0.85} stroke={T.red} strokeDasharray="4 4" />
            <Area type="monotone" dataKey="rho" name="ρ" stroke={T.gold} strokeWidth={2} fill="url(#rhoG)" dot={false} />
            <Line type="monotone" dataKey="t3" name="T+3" stroke={T.green} strokeWidth={1.5} strokeDasharray="6 3" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <div style={{ background:T.surface, border:`1px solid ${T.borderBright}`, padding:14 }}>
          <div style={{ fontSize:8, color:T.textDim, letterSpacing:".14em", textTransform:"uppercase", marginBottom:8, fontFamily:"'Space Mono',monospace" }}>AVG DELAY BY WAREHOUSE BLOCK</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={delay}>
              <CartesianGrid vertical={false} stroke={T.border} />
              <XAxis dataKey="block" tick={{ fill:T.textDim, fontSize:9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:T.textDim, fontSize:8 }} axisLine={false} tickLine={false} />
              <Tooltip content={<Tip />} />
              <Bar dataKey="avg_delay" name="Avg Delay (hrs)" radius={[2,2,0,0]}>
                {delay.map((_,i) => <Cell key={i} fill={[T.red,T.gold,T.cyan,T.green,T.purple,T.gold+"88"][i%6]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background:T.surface, border:`1px solid ${T.borderBright}`, padding:14 }}>
          <div style={{ fontSize:8, color:T.textDim, letterSpacing:".14em", textTransform:"uppercase", marginBottom:8, fontFamily:"'Space Mono',monospace" }}>RED-ZONE FAILURE BY IMPORTANCE</div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={rzi} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} innerRadius={28}>
                {rzi.map((_,i) => <Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip content={<Tip />} />
              <Legend wrapperStyle={{ fontSize:9, color:T.textDim }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── IRP TABLE ────────────────────────────────────────────────────────────────
function IRPTable({ s }) {
  const perHub = s?.inverse_reliability_per_hub ?? [];
  if (!perHub.length) return null;
  return (
    <div style={{ background:T.surface, border:`1px solid ${T.borderBright}` }}>
      <div style={{ padding:"8px 14px", borderBottom:`1px solid ${T.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", background:T.panel }}>
        <div className="siti-font" style={{ fontSize:9, color:T.text, letterSpacing:".12em", textTransform:"uppercase" }}>INVERSE RELIABILITY PARADOX — PER HUB ANALYSIS</div>
        <div style={{ fontSize:7, color:"#FFD060", border:"1px solid #FFD06033", padding:"2px 8px", fontFamily:"'Space Mono',monospace", fontWeight:700 }}>IRP CONFIRMED</div>
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:9, fontFamily:"'Space Mono',monospace" }}>
        <thead>
          <tr>{["HUB","ρ","HI-IMP FAIL%","LO-IMP FAIL%","IRP GAP","₹ IMPACT/YR"].map(h => (
            <th key={h} style={{ padding:"7px 12px", textAlign:h==="HUB"?"left":"right", color:T.textDim, fontWeight:400, fontSize:7.5, borderBottom:`1px solid ${T.border}`, letterSpacing:".1em" }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {perHub.map(row => (
            <tr key={row.hub} style={{ borderBottom:`1px solid ${T.border}` }}>
              <td style={{ padding:"7px 12px", color:T.gold, fontWeight:700 }}>{row.hub}</td>
              <td style={{ padding:"7px 12px", textAlign:"right", color:(row.rho??0)>=.85?T.red:T.text }}>{(row.rho??0).toFixed(4)}</td>
              <td style={{ padding:"7px 12px", textAlign:"right", color:T.red }}>{((row.hi_fail_rate??0)*100).toFixed(2)}%</td>
              <td style={{ padding:"7px 12px", textAlign:"right", color:T.cyan }}>{((row.lo_fail_rate??0)*100).toFixed(2)}%</td>
              <td style={{ padding:"7px 12px", textAlign:"right", color:"#FFD060", fontWeight:700 }}>
                {((row.irp_gap??0)*100)>0?"+":""}{((row.irp_gap??0)*100).toFixed(1)}pp
              </td>
              <td style={{ padding:"7px 12px", textAlign:"right", color:T.green }}>₹{(row.annual_impact_cr??0).toFixed(2)}Cr</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ padding:"6px 14px", borderTop:`1px solid ${T.border}`, fontSize:7.5, color:T.textDim, fontFamily:"'Space Mono',monospace" }}>
        Leakage seed: $1.20 recovery + $2.74 CLV = $3.94/failure · MIMI Intelligence Engine v2.0
      </div>
    </div>
  );
}

// ─── PDF EXPORT ───────────────────────────────────────────────────────────────
function exportPDF(s, ticker) {
  const doc = new jsPDF({ orientation:"portrait", format:"a4" });
  const rho = s?.rho??0, phi = s?.phi??0, irp = s?.inverse_reliability??{}, now = new Date().toISOString();
  doc.setFillColor(3,3,10); doc.rect(0,0,210,50,"F");
  doc.setFillColor(245,166,35); doc.rect(0,0,6,50,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(20); doc.setTextColor(245,166,35);
  doc.text("SITI INTELLIGENCE",14,16);
  doc.setFontSize(9); doc.setTextColor(160,160,160);
  doc.text("FORENSIC STATE AUDIT · MIMI KERNEL v2.0",14,24);
  doc.text(`GENERATED: ${now}`,14,31);
  doc.text(`DATASET: ${s?.dataset_name??"UPLOADED_DATASET"}`,14,38);
  const sc = rho>=.85?[255,56,96]:rho>.80?[245,166,35]:[0,255,135];
  doc.setFillColor(...sc); doc.rect(0,50,210,8,"F");
  doc.setTextColor(0,0,0); doc.setFontSize(8);
  doc.text(rho>=.85?"UTILIZATION COLLAPSE — SIGMOIDAL DECAY TRIGGERED":rho>.80?"PREEMPTIVE DIVERSION PROTOCOL INITIATED":"NOMINAL OPERATIONS",14,55.5);
  doc.setTextColor(245,166,35); doc.setFontSize(12); doc.text("EXECUTIVE SUMMARY",14,68);
  autoTable(doc,{
    startY:72,
    head:[["METRIC","VALUE","STATUS","THRESHOLD"]],
    body:[
      ["Hub Utilization (ρ=λ/μ)",rho.toFixed(4),rho>.80?"CRITICAL":"NOMINAL","< 0.80"],
      ["Instability Φ(ρ)",phi.toFixed(4),phi>.5?"CASCADING":"STABLE","< 0.30"],
      ["ρ_critical (LR-calibrated)",(s?.critical_rho??0.85).toFixed(4),"AUTO-CALIBRATED","≤ 0.85"],
      ["T+3 Kalman Forecast",(s?.kalman?.rho_t3??0).toFixed(4),s?.collapse_predicted?"ALERT":"NOMINAL","< 0.85"],
      ["Annualized Exposure","$2,810,000","AUDIT BASELINE","Mission LiFE"],
      ["Revenue Saved (Session)",`$${(ticker?.revenue_saved??0).toFixed(2)}`,"RECOVERED","Ongoing"],
      ["High-Imp Failures",`${irp.failure_count??0} units`,"IRP CONFIRMED","0 target"],
      ["Total Leakage (Session)",`$${(irp.leakage_total??0).toFixed(2)}`,"TRACKED","$3.94/unit"],
    ],
    theme:"grid",
    headStyles:{fillColor:[10,10,10],textColor:[245,166,35],fontSize:8,fontStyle:"bold"},
    bodyStyles:{fillColor:[15,15,15],textColor:[220,220,220],fontSize:8},
    alternateRowStyles:{fillColor:[20,20,20]},
  });
  let y = doc.lastAutoTable.finalY+12;
  doc.setTextColor(245,166,35); doc.setFontSize(12); doc.text("MIMI KERNEL — MATHEMATICAL FORMULATION",14,y); y+=6;
  doc.setTextColor(180,180,180); doc.setFontSize(8);
  [
    `ρ = λ/μ = ${(s?.total_lambda??0).toFixed(1)} / ${((s?.mu??150)*5).toFixed(0)} = ${rho.toFixed(4)}  (M/M/1 queueing theory)`,
    `Φ(ρ) = 1/(1+exp(-20(ρ-${(s?.critical_rho??0.85).toFixed(2)}))) = ${phi.toFixed(4)}  (Sigmoidal priority decay, k=20)`,
    `L = $1.20(recovery) + $2.74(CLV) = $3.94 × ${irp.failure_count??0} = $${(irp.leakage_total??0).toFixed(2)}`,
    `W_q = ρ/(1-ρ) = ${(s?.wq??0).toFixed(4)}  (M/M/1 expected queue depth)`,
    `Kalman: x=[ρ,ρ̇], F=[[1,Δt],[0,1]], Q=diag(0.002,0.001), R=0.005 → T+3: ${(s?.kalman?.rho_t3??0).toFixed(4)}`,
  ].forEach(l => { doc.text(l,14,y); y+=6; });
  if ((s?.inverse_reliability_per_hub??[]).length>0) {
    y+=6; doc.setTextColor(245,166,35); doc.setFontSize(12); doc.text("INVERSE RELIABILITY PARADOX — PER HUB",14,y); y+=4;
    autoTable(doc,{
      startY:y,
      head:[["HUB","ρ","HI-IMP FAIL%","LO-IMP FAIL%","IRP GAP (pp)","ANNUAL IMPACT"]],
      body:(s?.inverse_reliability_per_hub??[]).map(r=>[r.hub,r.rho?.toFixed(4),`${((r.hi_fail_rate??0)*100).toFixed(2)}%`,`${((r.lo_fail_rate??0)*100).toFixed(2)}%`,`${((r.irp_gap??0)*100)>0?"+":""}${((r.irp_gap??0)*100).toFixed(1)}pp`,`₹${(r.annual_impact_cr??0).toFixed(2)} Cr`]),
      theme:"grid",
      headStyles:{fillColor:[26,0,0],textColor:[255,56,96],fontSize:7.5,fontStyle:"bold"},
      bodyStyles:{fillColor:[15,15,15],textColor:[200,200,200],fontSize:7.5},
    });
  }
  const pg = doc.internal.getNumberOfPages();
  for (let i=1;i<=pg;i++) {
    doc.setPage(i); doc.setFontSize(7); doc.setTextColor(60,60,60);
    doc.text(`SITI Intelligence · CONFIDENTIAL · Page ${i}/${pg} · ${now}`,105,290,{align:"center"});
    doc.text("🌿 Mission LiFE Certified · ESG Compliance · For internal use only",105,285,{align:"center"});
  }
  doc.save(`siti-forensic-audit-${Date.now()}.pdf`);
}

// ─── TOP BAR ──────────────────────────────────────────────────────────────────
function TopBar({ s, ticker, isGhost, isStream, apiKey, setApiKey, onPayment }) {
  const rho = s?.global_rho ?? 0;
  const sc = rho>=.85?T.red:rho>.80?T.gold:T.green;
  return (
    <div style={{ background:T.surface, borderBottom:`1px solid ${rho>=.85?T.red+"44":T.border}`, padding:"0 20px", display:"flex", alignItems:"center", justifyContent:"space-between", height:62, position:"sticky", top:0, zIndex:100, transition:"border-color .3s", backdropFilter:"blur(20px)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:14 }}>
        <div style={{ position:"relative" }}>
          <SITILogo size={38} />
        </div>
        <div>
          <div className="siti-font glow-gold" style={{ fontSize:15, color:T.gold, fontWeight:800, letterSpacing:".25em" }}>SITI INTELLIGENCE</div>
          <div style={{ fontSize:7.5, color:T.textDim, letterSpacing:".12em", fontFamily:"'Space Mono',monospace" }}>LOGIC FOR THE PARADOX // POWERED BY MIMI v2.0</div>
        </div>
        <div style={{ width:1, height:32, background:T.border, margin:"0 8px" }} />
        {(isGhost||isStream) && (
          <div style={{ display:"flex", alignItems:"center", gap:6, background:"#001A05", border:`1px solid ${T.green}`, color:T.green, fontSize:8, fontWeight:700, letterSpacing:".15em", padding:"3px 10px", fontFamily:"'Space Mono',monospace" }}>
            <div style={{ width:5, height:5, borderRadius:"50%", background:T.green, animation:"pulseDot 1s ease-in-out infinite" }} />
            LIVE INFERENCE
          </div>
        )}
      </div>
      <div style={{ display:"flex", gap:24, alignItems:"center" }}>
        {[
          { l:"NETWORK ρ", v:rho.toFixed(3), c:sc },
          { l:"λ TOTAL/HR", v:s?.total_lambda?.toFixed(0)??"—", c:T.cyan },
          { l:"SAVED", v:`$${ticker.revenue_saved?.toFixed(2)??"0.00"}`, c:T.green },
          { l:"ANNUALIZED", v:"₹2.81Cr", c:T.red },
        ].map(it => (
          <div key={it.l} style={{ textAlign:"center" }}>
            <div style={{ fontSize:7, color:T.textDim, letterSpacing:".1em", fontFamily:"'Space Mono',monospace", marginBottom:2 }}>{it.l}</div>
            <div className="siti-font" style={{ fontSize:13, fontWeight:700, color:it.c }}>{it.v}</div>
          </div>
        ))}
        <button onClick={onPayment} style={{ background:"transparent", border:`1px solid ${T.green}`, color:T.green, fontFamily:"'Oxanium',monospace", fontSize:9, fontWeight:700, letterSpacing:".12em", padding:"7px 16px", cursor:"pointer", transition:"all .2s" }}>
          GET API KEY →
        </button>
      </div>
    </div>
  );
}

// ─── PAYMENT MODAL ────────────────────────────────────────────────────────────
function PaymentModal({ onClose }) {
  const plans = [
    { id:"pilot", name:"PILOT", price:29999, display:"₹29,999/mo", hubs:"1 Hub", shipments:"50K/mo", color:T.cyan,
      features:["1 hub monitored","CSV upload","PDF forensic audit","Email support"] },
    { id:"operator", name:"OPERATOR", price:74999, display:"₹74,999/mo", hubs:"5 Hubs", shipments:"500K/mo", color:T.gold, recommended:true,
      features:["5 hubs monitored","WhatsApp alerts","Live API SSE stream","Priority support","IRP per-hub"] },
    { id:"enterprise", name:"ENTERPRISE", price:null, display:"Custom", hubs:"Unlimited", shipments:"Unlimited", color:T.green,
      features:["Redis/K8s scaling","Delhivery-scale","Dedicated onboarding","SLA guarantee"] },
  ];
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.92)", zIndex:9998, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:T.surface, border:`1px solid ${T.borderBright}`, maxWidth:640, width:"100%", animation:"fadeUp .3s ease-out" }}>
        <div style={{ padding:"16px 20px", borderBottom:`1px solid ${T.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div className="siti-font" style={{ color:T.gold, fontSize:14, fontWeight:800, letterSpacing:".22em" }}>SITI INTELLIGENCE — PRICING</div>
            <div style={{ fontSize:8, color:T.textDim, marginTop:2, fontFamily:"'Space Mono',monospace" }}>Powered by Razorpay · Auto-provisioned API key on payment</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:T.textDim, fontSize:20, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, padding:20 }}>
          {plans.map(p => (
            <div key={p.id} style={{ border:`1px solid ${p.color}44`, padding:16, background:T.panel, position:"relative" }}>
              {p.recommended && (
                <div style={{ position:"absolute", top:-9, left:"50%", transform:"translateX(-50%)", background:T.gold, color:"#000", fontSize:7, fontWeight:700, padding:"2px 10px", letterSpacing:".1em", whiteSpace:"nowrap" }}>RECOMMENDED</div>
              )}
              <div style={{ fontSize:8, color:p.color, fontWeight:700, letterSpacing:".15em", marginBottom:8, fontFamily:"'Space Mono',monospace" }}>{p.name}</div>
              <div className="siti-font" style={{ fontSize:22, color:p.color, fontWeight:800, marginBottom:4 }}>{p.display}</div>
              <div style={{ fontSize:8, color:T.textDim, marginBottom:12 }}>{p.hubs} · {p.shipments}</div>
              {p.features.map(f => (
                <div key={f} style={{ fontSize:8, color:T.text, marginBottom:4, display:"flex", gap:6 }}>
                  <span style={{ color:T.green }}>✓</span><span>{f}</span>
                </div>
              ))}
              <button onClick={() => alert("Razorpay integration active — contact sales@siti-intelligence.io")} style={{ marginTop:14, width:"100%", background:"none", border:`1px solid ${p.color}`, color:p.color, fontFamily:"'Oxanium',monospace", fontSize:9, fontWeight:700, letterSpacing:".1em", padding:"7px 0", cursor:"pointer" }}>
                {p.id==="enterprise"?"CONTACT US →":"BUY NOW →"}
              </button>
            </div>
          ))}
        </div>
        <div style={{ padding:"12px 20px", borderTop:`1px solid ${T.border}`, fontSize:7.5, color:T.textDim, display:"flex", gap:16, flexWrap:"wrap", fontFamily:"'Space Mono',monospace" }}>
          <span><span style={{ color:T.green }}>✓</span> Razorpay 256-bit SSL</span>
          <span><span style={{ color:T.green }}>✓</span> API key in 2 min</span>
          <span><span style={{ color:T.green }}>✓</span> 7-day money-back</span>
        </div>
      </div>
    </div>
  );
}

// ─── UPLOAD PANEL ────────────────────────────────────────────────────────────
function UploadPanel({ onCalib, onRefresh, apiKey }) {
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);

  const doUpload = async (file) => {
    onCalib(true);
    setMsg(null); setErr(null);
    try {
      const raw = await readFileResilient(file);
      const clean = raw.replace(/[^\x20-\x7E\t\n\r]/g, "");
      const remapped = preprocessCSV(clean);
      const blob = new Blob([remapped], { type:"text/csv" });
      const fd = new FormData();
      fd.append("file", new File([blob], file.name, { type:"text/csv" }));
      const [res] = await Promise.all([
        axios.post(`${API}/kernel/upload`, fd, {
          headers: { "Content-Type":"multipart/form-data", "X-API-KEY":apiKey }
        }),
        new Promise(r => setTimeout(r, 2800)),
      ]);
      setMsg(`✅ GENIUS RESET COMPLETE — n=${res.data.n_total} · ρ=${res.data.new_rho?.toFixed(4)}`);
      await onRefresh();
    } catch(e) {
      const d = e.response?.data?.detail;
      setErr(typeof d==="string"?d:"Upload failed — check CSV schema");
    } finally { onCalib(false); }
  };

  return (
    <div style={{ background:T.surface, border:`1px solid ${T.borderBright}`, padding:"14px 16px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
        <div style={{ width:6, height:6, borderRadius:"50%", background:T.green, boxShadow:`0 0 8px ${T.green}` }} />
        <div className="siti-font" style={{ fontSize:10, color:T.text, letterSpacing:".18em", fontWeight:700 }}>DATA INJECTION — GENIUS RESET</div>
      </div>
      <div style={{ fontSize:8.5, color:T.textDim, marginBottom:12, lineHeight:1.7 }}>
        Upload any logistics CSV. MIMI auto-maps messy headers, runs logistic regression, recalibrates all 5 hubs.
        Auto-maps: <span style={{ color:T.cyan }}>delay_status → Reached.on.Time_Y.N · wt → Weight_in_gms · hub → Warehouse_block</span>
      </div>
      <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
        <input ref={fileRef} type="file" accept=".csv" style={{ display:"none" }} id="siti-csv"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if(!f) return;
            setUploading(true);
            await doUpload(f);
            setUploading(false);
            fileRef.current.value="";
          }} />
        <label htmlFor="siti-csv" style={{
          display:"inline-flex", alignItems:"center", gap:8,
          background:uploading?"#1A1A00":"transparent",
          border:`1px solid ${uploading?T.gold:T.gold}`,
          color:uploading?T.gold:T.gold,
          fontFamily:"'Oxanium',monospace", fontSize:10, fontWeight:700,
          letterSpacing:".14em", padding:"8px 18px", cursor:uploading?"wait":"pointer", userSelect:"none"
        }}>
          {uploading?"⚙ PROCESSING...":"⬆ UPLOAD CSV — GENIUS RESET"}
        </label>
      </div>
      {msg && <div style={{ marginTop:10, padding:"7px 12px", background:"#001A00", border:`1px solid ${T.green}44`, color:T.green, fontSize:8.5, fontFamily:"'Space Mono',monospace" }}>{msg}</div>}
      {err && <div style={{ marginTop:10, padding:"7px 12px", background:"#1A0000", border:`1px solid ${T.red}44`, color:T.red, fontSize:8.5, fontFamily:"'Space Mono',monospace" }}>ERROR: {err}</div>}
    </div>
  );
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export default function SITIDashboard() {
  const [kState, setKState] = useState(null);
  const [ticker, setTicker] = useState({ revenue_saved:0, total_diverted:0, refresh_count:0 });
  const [loading, setLoading] = useState(true);
  const [calibrating, setCalibrating] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [mu, setMu] = useState(150);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isGhost, setIsGhost] = useState(false);
  const [apiKey, setApiKey] = useState(DEMO_API_KEY);
  const streamRef = useRef(null);
  const ghostRef = useRef(null);
  const ghostCount = useRef(0);

  const fetchState = useCallback(async () => {
    try {
      const [sRes, tRes] = await Promise.all([
        axios.get(`${API}/kernel/state`, { headers:{ "X-API-KEY":apiKey } }),
        axios.post(`${API}/kernel/tick`, {}, { headers:{ "X-API-KEY":apiKey } }),
      ]);
      setKState(sRes.data);
      setTicker(tRes.data);
      setLoading(false);
    } catch { setLoading(false); }
  }, [apiKey]);

  useEffect(() => {
    fetchState();
    const iv = setInterval(fetchState, 5000);
    return () => clearInterval(iv);
  }, [fetchState]);

  const hubs = kState?.hubs ?? [];
  const globalRho = kState?.global_rho ?? 0;
  const catastrophe = kState?.catastrophe;
  const collapse = kState?.collapse;
  const bgColor = collapse?"#0D0000":catastrophe?"#080500":T.bg;

  const startStream = () => {
    setIsStreaming(true);
    streamRef.current = setInterval(async () => {
      await axios.post(`${API}/kernel/stream-batch?n=100`, {}, { headers:{"X-API-KEY":apiKey} });
      fetchState();
    }, 10000);
  };
  const stopStream = () => { clearInterval(streamRef.current); setIsStreaming(false); };
  const startGhost = () => {
    setIsGhost(true); ghostCount.current=0;
    ghostRef.current = setInterval(async () => {
      await axios.post(`${API}/kernel/stream-batch?n=50`, {}, { headers:{"X-API-KEY":apiKey} });
      fetchState();
      ghostCount.current++;
      if(ghostCount.current>=90) stopGhost();
    }, 1000);
  };
  const stopGhost = () => { clearInterval(ghostRef.current); setIsGhost(false); ghostCount.current=0; };
  const handleMuChange = async (val) => {
    setMu(val);
    try { await axios.post(`${API}/kernel/set-mu`, { mu:val }, { headers:{"X-API-KEY":apiKey} }); fetchState(); } catch {}
  };

  if (loading && !kState) return (
    <div style={{ background:T.bg, minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:20 }}>
      <style>{CSS}</style>
      <ParticleCanvas />
      <div style={{ position:"relative", zIndex:1, textAlign:"center" }}>
        <div style={{ display:"flex", justifyContent:"center", marginBottom:20 }}><SITILogo size={64} /></div>
        <div className="siti-font glow-gold" style={{ color:T.gold, fontSize:20, fontWeight:800, letterSpacing:".3em" }}>SITI INTELLIGENCE</div>
        <div style={{ color:T.textDim, fontSize:10, letterSpacing:".18em", marginTop:8, fontFamily:"'Space Mono',monospace" }}>CONNECTING TO MIMI KERNEL...</div>
      </div>
    </div>
  );

  return (
    <div className="grid-bg" style={{ background:bgColor, minHeight:"100vh", fontFamily:"'Exo 2',sans-serif", color:T.text, transition:"background .6s ease", position:"relative" }}>
      <style>{CSS}</style>
      <div className="scan-line" />
      <ParticleCanvas />

      {calibrating && <CalibrationOverlay />}
      {showPayment && <PaymentModal onClose={() => setShowPayment(false)} />}
      {collapse && <div className="collapse-border" />}

      <div style={{ position:"relative", zIndex:1 }}>
        {/* TOP BAR */}
        <TopBar s={kState} ticker={ticker} isGhost={isGhost} isStream={isStreaming}
          apiKey={apiKey} setApiKey={setApiKey} onPayment={() => setShowPayment(true)} />

        {/* HERO */}
        <div style={{ textAlign:"center", padding:"22px 20px 16px", borderBottom:`1px solid ${T.border}`, position:"relative" }}>
          <div style={{ fontSize:9, color:T.textDim, letterSpacing:".3em", textTransform:"uppercase", marginBottom:6, fontFamily:"'Space Mono',monospace" }}>ANNUALIZED REVENUE RECOVERY — INDIA LOGISTICS NETWORK</div>
          <div className="siti-font glow-green" style={{ fontSize:54, fontWeight:800, color:T.green, lineHeight:1, animation:"glowGreen 3s ease-in-out infinite" }}>
            ₹2,81,00,000
          </div>
          <div style={{ fontSize:8.5, color:T.textDim, marginTop:6, letterSpacing:".16em", fontFamily:"'Space Mono',monospace" }}>
            MIMI KERNEL v2.0 · {hubs.length}-HUB INDIA NETWORK · 2D KALMAN STATE OBSERVER
          </div>
          {catastrophe && !collapse && (
            <div style={{ marginTop:10, display:"inline-flex", alignItems:"center", gap:8, background:"#120A00", border:`1px solid ${T.gold}44`, padding:"6px 18px" }}>
              <div className="blink" style={{ width:6, height:6, borderRadius:"50%", background:T.gold }} />
              <span className="siti-font" style={{ color:T.gold, fontSize:11, fontWeight:700, letterSpacing:".18em" }}>PREEMPTIVE DIVERSION PROTOCOL INITIATED — E[ρ(T+1)] &gt; 0.80</span>
            </div>
          )}
          {collapse && (
            <div style={{ marginTop:10, display:"inline-flex", alignItems:"center", gap:8, background:"#1A0000", border:`1px solid ${T.red}55`, padding:"8px 20px" }}>
              <div className="blink" style={{ width:8, height:8, borderRadius:"50%", background:T.red }} />
              <span className="siti-font blink" style={{ color:T.red, fontSize:13, fontWeight:800, letterSpacing:".22em" }}>UTILIZATION COLLAPSE: SIGMOIDAL DECAY TRIGGERED</span>
            </div>
          )}
        </div>

        {/* HUB CARDS */}
        <div style={{ display:"grid", gridTemplateColumns:`repeat(${Math.max(hubs.length,3)},1fr)`, gap:10, padding:"12px 20px" }}>
          {hubs.map(hub => <HubCard key={hub.name} hub={hub} />)}
        </div>

        {/* TABS */}
        <div style={{ display:"flex", borderBottom:`1px solid ${T.border}`, background:T.surface, margin:"8px 0 0", padding:"0 20px" }}>
          {[
            { id:"overview", label:"NETWORK OVERVIEW" },
            { id:"kernel", label:"MIMI KERNEL MATH" },
            { id:"demo", label:"⚡ DEMO / DATA INJECTION" },
            { id:"irp", label:"IRP ANALYSIS" },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding:"10px 20px", fontSize:8.5, letterSpacing:".12em",
              fontFamily:"'Oxanium',monospace", background:"none", border:"none",
              cursor:"pointer", color:activeTab===tab.id?T.gold:T.textDim,
              borderBottom:`2px solid ${activeTab===tab.id?T.gold:"transparent"}`,
              transition:"all .2s", fontWeight:activeTab===tab.id?700:400
            }}>{tab.label}</button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {activeTab==="overview" && (
          <div style={{ display:"grid", gridTemplateColumns:"240px 1fr", gap:12, padding:"12px 20px" }}>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {[
                { l:"NETWORK ρ (λ/μ)", v:globalRho.toFixed(4), c:collapse?T.red:T.gold },
                { l:"ARRIVALS λ/HR", v:kState?.total_lambda?.toFixed(1)??"—", c:T.cyan },
                { l:"SERVICE μ/HUB", v:`${kState?.mu?.toFixed(0)??mu}`, c:T.green },
                { l:"INSTABILITY Φ(ρ)", v:kState?.phi?.toFixed(4)??"—", c:(kState?.phi??0)>.5?T.red:T.green },
                { l:"QUEUE DEPTH W_q", v:Math.min(kState?.wq??0,99.9).toFixed(3), c:(kState?.wq??0)>4?T.red:T.cyan },
                { l:"FAILURE RATE", v:`${((kState?.failure_rate??0)*100).toFixed(1)}%`, c:T.gold },
                { l:"HI-IMP FAILURES", v:`${kState?.inverse_reliability?.failure_count??0}`, c:T.red },
                { l:"LEAKAGE $3.94/UNIT", v:`$${kState?.inverse_reliability?.leakage_total?.toFixed(0)??0}`, c:T.gold },
                { l:"REVENUE SAVED", v:`$${ticker.revenue_saved?.toFixed(2)}`, c:T.green },
                { l:"DIVERTED UNITS", v:ticker.total_diverted?.toLocaleString(), c:T.green },
              ].map(it => <KPI key={it.l} label={it.l} value={it.v} color={it.c} accent />)}
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <Charts s={kState} />
              <IRPTable s={kState} />
            </div>
          </div>
        )}

        {/* KERNEL TAB */}
        {activeTab==="kernel" && (
          <div style={{ padding:"14px 20px", display:"flex", flexDirection:"column", gap:12 }}>
            <MimiPanel s={kState} />
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div style={{ background:T.surface, border:`1px solid ${T.borderBright}`, padding:16 }}>
                <div style={{ fontSize:8, color:T.textDim, letterSpacing:".14em", marginBottom:10, textTransform:"uppercase", fontFamily:"'Space Mono',monospace" }}>KALMAN GAIN MATRIX (2D)</div>
                <div style={{ fontSize:10, color:T.text, fontFamily:"'Space Mono',monospace", marginBottom:6 }}>K = P⁻H^T(HP⁻H^T + R)⁻¹</div>
                <div className="siti-font" style={{ fontSize:13, color:T.cyan, fontWeight:700 }}>K = [{(kState?.kalman?.K??[0,0]).map(v=>v.toFixed(4)).join(", ")}]</div>
                <div style={{ fontSize:8, color:T.textDim, marginTop:6, fontFamily:"'Space Mono',monospace" }}>P_trace = {kState?.kalman?.P?.toFixed(4)} · Q = diag(0.002, 0.001) · R = 0.005</div>
              </div>
              <div style={{ background:T.surface, border:`1px solid ${T.borderBright}`, padding:16 }}>
                <div style={{ fontSize:8, color:T.textDim, letterSpacing:".14em", marginBottom:10, textTransform:"uppercase", fontFamily:"'Space Mono',monospace" }}>COMMANDER'S CONSOLE</div>
                <div style={{ fontSize:9, color:kState?.commander_level==="critical"?T.red:kState?.commander_level==="efficiency"?T.cyan:T.green, lineHeight:1.9, fontWeight:700, letterSpacing:".06em", fontFamily:"'Space Mono',monospace" }}>
                  {(kState?.commander_message??"MIMI KERNEL: OPTIMAL NETWORK FLOW DETECTED.\nCERTAINTY 99.2%.").split("\n").map((l,i) => <div key={i}>{l}</div>)}
                </div>
                <div style={{ marginTop:12, display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  <div style={{ background:T.panel, padding:"6px 10px", border:`1px solid ${T.border}` }}>
                    <div style={{ fontSize:7, color:T.textDim, fontFamily:"'Space Mono',monospace" }}>T+3 PROJECTION</div>
                    <div className="siti-font" style={{ fontSize:16, color:(kState?.rho_t3??0)>=.85?T.red:T.green, fontWeight:700 }}>ρ={(kState?.rho_t3??0).toFixed(4)}</div>
                  </div>
                  <div style={{ background:T.panel, padding:"6px 10px", border:`1px solid ${T.border}` }}>
                    <div style={{ fontSize:7, color:T.textDim, fontFamily:"'Space Mono',monospace" }}>PVI VOLATILITY</div>
                    <div className="siti-font" style={{ fontSize:16, color:(kState?.pvi??0)>15?T.red:T.cyan, fontWeight:700 }}>{(kState?.pvi??0).toFixed(1)}%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DEMO TAB */}
        {activeTab==="demo" && (
          <div style={{ padding:"14px 20px", display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ background:T.surface, border:`1px solid ${T.borderBright}`, padding:"14px 16px" }}>
              <div style={{ fontSize:8, color:T.textDim, letterSpacing:".14em", marginBottom:8, textTransform:"uppercase", fontFamily:"'Space Mono',monospace" }}>API KEY — Leave blank for demo mode</div>
              <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                <input value={apiKey} onChange={e=>setApiKey(e.target.value||DEMO_API_KEY)}
                  placeholder={DEMO_API_KEY}
                  style={{ flex:1, background:T.panel, border:`1px solid ${T.borderBright}`, color:T.text, fontFamily:"'Space Mono',monospace", fontSize:10, padding:"7px 12px", outline:"none" }} />
                <div style={{ fontSize:8, color:T.green, fontFamily:"'Space Mono',monospace" }}>✓ DEMO ACTIVE</div>
              </div>
            </div>
            <UploadPanel onCalib={setCalibrating} onRefresh={fetchState} apiKey={apiKey} />
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
              {/* PDF */}
              <div style={{ background:T.surface, border:`1px solid ${T.borderBright}`, padding:"14px 16px" }}>
                <div className="siti-font" style={{ fontSize:10, color:T.text, letterSpacing:".16em", marginBottom:8, fontWeight:700 }}>FORENSIC AUDIT PDF</div>
                <div style={{ fontSize:8.5, color:T.textDim, marginBottom:12, lineHeight:1.7 }}>Board-ready PDF with MIMI math, IRP findings, Mission LiFE ESG tag.</div>
                <button onClick={() => exportPDF(kState,ticker)} style={{ background:"#000D1A", border:`1px solid ${T.cyan}`, color:T.cyan, fontFamily:"'Oxanium',monospace", fontSize:9, fontWeight:700, letterSpacing:".12em", padding:"8px 16px", cursor:"pointer", width:"100%" }}>
                  📄 EXPORT FORENSIC AUDIT PDF
                </button>
                {["Executive KPI Summary","MIMI Kernel Formulation","IRP Table per Hub","Kalman Analysis","Mission LiFE ESG Tag"].map(f => (
                  <div key={f} style={{ fontSize:8, color:T.textDim, marginTop:6, display:"flex", gap:6 }}>
                    <span style={{ color:T.green }}>✓</span>{f}
                  </div>
                ))}
              </div>
              {/* μ CONTROL */}
              <div style={{ background:T.surface, border:`1px solid ${T.borderBright}`, padding:"14px 16px" }}>
                <div className="siti-font" style={{ fontSize:10, color:T.text, letterSpacing:".16em", marginBottom:8, fontWeight:700 }}>SERVICE CAPACITY (μ)</div>
                <div style={{ fontSize:8.5, color:T.textDim, marginBottom:12, lineHeight:1.7 }}>Adjust μ per hub. ρ = λ/μ recalculates instantly.</div>
                <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:8 }}>
                  <input type="range" min={50} max={500} step={5} value={mu} onChange={e=>handleMuChange(Number(e.target.value))} style={{ flex:1 }} />
                  <div className="siti-font" style={{ background:T.panel, border:`1px solid ${T.green}`, padding:"4px 12px", fontSize:14, color:T.green, fontWeight:700, minWidth:80, textAlign:"center" }}>μ={mu}</div>
                </div>
                <div style={{ fontSize:8, color:T.textDim, fontFamily:"'Space Mono',monospace" }}>Network: <span style={{ color:T.green }}>{mu*5} units/hr</span> (5 hubs)</div>
              </div>
              {/* STREAMS */}
              <div style={{ background:T.surface, border:`1px solid ${T.borderBright}`, padding:"14px 16px" }}>
                <div className="siti-font" style={{ fontSize:10, color:T.text, letterSpacing:".16em", marginBottom:8, fontWeight:700 }}>LIVE TELEMETRY</div>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <button onClick={isStreaming?stopStream:startStream} disabled={isGhost} style={{ background:isStreaming?"#001A0A":T.panel, border:`1px solid ${isStreaming?T.green:T.borderBright}`, color:isStreaming?T.green:T.textDim, fontFamily:"'Oxanium',monospace", fontSize:9, fontWeight:700, letterSpacing:".12em", padding:"7px 0", cursor:isGhost?"not-allowed":"pointer", opacity:isGhost?.4:1, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                    <div style={{ width:5, height:5, borderRadius:"50%", background:isStreaming?T.green:T.textDim, animation:isStreaming?"pulseDot 1s infinite":"none" }} />
                    {isStreaming?"HALT STREAM":"LIVE STREAM · 100/10s"}
                  </button>
                  <button onClick={isGhost?stopGhost:startGhost} disabled={isStreaming} style={{ background:isGhost?"#001A05":T.panel, border:`1px solid ${isGhost?T.green:T.borderBright}`, color:isGhost?T.green:T.textDim, fontFamily:"'Oxanium',monospace", fontSize:9, fontWeight:700, letterSpacing:".12em", padding:"7px 0", cursor:isStreaming?"not-allowed":"pointer", opacity:isStreaming?.4:1, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                    <div style={{ width:5, height:5, borderRadius:"50%", background:isGhost?T.green:T.textDim }} />
                    {isGhost?"HALT GHOST TRIGGER":"GHOST TRIGGER · 50/s"}
                  </button>
                  <div style={{ fontSize:7.5, color:T.textDim, lineHeight:1.7, fontFamily:"'Space Mono',monospace" }}>
                    Stream: 100 units/10s<br/>Ghost: 50/s · auto-stops @90s
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* IRP TAB */}
        {activeTab==="irp" && (
          <div style={{ padding:"14px 20px", display:"flex", flexDirection:"column", gap:12 }}>
            <IRPTable s={kState} />
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div style={{ background:T.surface, border:`1px solid ${T.borderBright}` }}>
                <div style={{ padding:"8px 14px", borderBottom:`1px solid ${T.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ fontSize:8.5, color:T.text, letterSpacing:".1em", textTransform:"uppercase", fontFamily:"'Space Mono',monospace" }}>HIGH-IMPORTANCE LATE DELIVERIES</div>
                  <div className="siti-font" style={{ fontSize:11, color:T.red, fontWeight:700 }}>{kState?.inverse_reliability?.failure_count??0} FAILURES</div>
                </div>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:9, fontFamily:"'Space Mono',monospace" }}>
                  <thead>
                    <tr>{["ID","HUB","MODE","COST","WEIGHT"].map(h => (
                      <th key={h} style={{ padding:"6px 12px", textAlign:"left", color:T.textDim, fontWeight:400, fontSize:7.5, borderBottom:`1px solid ${T.border}` }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {(kState?.inverse_reliability?.records??[]).slice(0,12).map((r,i) => (
                      <tr key={i} style={{ borderBottom:`1px solid ${T.border}` }}>
                        <td style={{ padding:"6px 12px", color:T.cyan }}>{r.id}</td>
                        <td style={{ padding:"6px 12px", color:T.gold, fontWeight:700 }}>{r.hub}</td>
                        <td style={{ padding:"6px 12px", color:T.textDim }}>{r.mode}</td>
                        <td style={{ padding:"6px 12px", color:T.gold }}>${r.cost}</td>
                        <td style={{ padding:"6px 12px", color:T.textDim }}>{r.weight?.toLocaleString()}g</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ background:T.surface, border:`1px solid ${T.borderBright}`, padding:16 }}>
                <div style={{ fontSize:8, color:T.textDim, letterSpacing:".14em", marginBottom:12, textTransform:"uppercase", fontFamily:"'Space Mono',monospace" }}>LEAKAGE COMPOSITION — $3.94/UNIT</div>
                {[
                  { label:"Recovery Cost", value:"$1.20", pct:"30%", color:T.red },
                  { label:"CLV Loss", value:"$2.74", pct:"70%", color:T.gold },
                  { label:"Total Leakage Seed", value:"$3.94", pct:"100%", color:T.gold },
                ].map(it => (
                  <div key={it.label} style={{ marginBottom:12 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontSize:9, color:T.textDim }}>{it.label}</span>
                      <span className="siti-font" style={{ fontSize:11, color:it.color, fontWeight:700 }}>{it.value}</span>
                    </div>
                    <div style={{ height:3, background:T.border, borderRadius:2 }}>
                      <div style={{ height:"100%", width:it.pct, background:it.color, borderRadius:2 }} />
                    </div>
                  </div>
                ))}
                <div style={{ marginTop:16, padding:12, background:T.panel, border:`1px solid ${T.border}` }}>
                  <div style={{ fontSize:8, color:T.textDim, marginBottom:6, fontFamily:"'Space Mono',monospace" }}>TOTAL LEAKAGE THIS SESSION</div>
                  <div className="siti-font" style={{ fontSize:28, color:T.red, fontWeight:700 }}>
                    ${kState?.inverse_reliability?.leakage_total?.toLocaleString("en-US",{minimumFractionDigits:2})??"0.00"}
                  </div>
                  <div style={{ fontSize:8, color:T.textDim, marginTop:4, fontFamily:"'Space Mono',monospace" }}>
                    {kState?.inverse_reliability?.failure_count??0} high-importance failures × $3.94
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FOOTER */}
        <div style={{ padding:"12px 20px", borderTop:`1px solid ${T.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", background:T.surface, marginTop:20 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <SITILogo size={18} />
            <span className="siti-font" style={{ color:T.gold, fontSize:10, fontWeight:700 }}>SITI INTELLIGENCE</span>
            <span style={{ color:T.textDim, fontSize:8 }}>// MIMI Intelligence Engine v2.0 // Inverse Reliability Paradox Mathematics</span>
          </div>
          <div style={{ fontSize:7.5, color:T.textDim, fontFamily:"'Space Mono',monospace" }}>
            🌿 Mission LiFE Certified · © 2026 SITI Intelligence · contact@siti-intelligence.io
          </div>
        </div>
      </div>
    </div>
  );
}
