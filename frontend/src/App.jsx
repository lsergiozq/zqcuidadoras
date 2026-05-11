import { useState, useEffect, useMemo, useCallback, createContext, useContext } from "react";

// ─── Config ──────────────────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:8000" : "/api");
const API_TIMEOUT_MS = 15000;

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtDate = (d) => { if (!d) return ""; const [y,m,day] = d.split("-"); return `${day}/${m}/${y}`; };
const today = () => new Date().toISOString().slice(0,10);
const monthName = (m) => ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"][m-1];
const getWeekRange = (dateStr) => {
  const d = new Date(dateStr+"T12:00:00"); const day = d.getDay();
  const diff = day===0?-6:1-day; const mon = new Date(d); mon.setDate(d.getDate()+diff);
  const sun = new Date(mon); sun.setDate(mon.getDate()+6);
  return [mon.toISOString().slice(0,10), sun.toISOString().slice(0,10)];
};
const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();
const shiftLabel = { Day12h:"Diurno 12h", Night12h:"Noturno 12h", Full24h:"24 horas" };
const shiftIcon  = { Day12h:"☀️", Night12h:"🌙", Full24h:"🌗" };
const shiftColor = { Day12h:"#f59e0b", Night12h:"#6366f1", Full24h:"#10b981" };

// ─── Mobile context ───────────────────────────────────────────────────────────
const MobileCtx = createContext(false);
const useMobile = () => useContext(MobileCtx);

function useIsMobile() {
  const [m, setM] = useState(() => window.innerWidth < 700);
  useEffect(() => {
    const fn = () => setM(window.innerWidth < 700);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return m;
}

// ─── Auth token storage ───────────────────────────────────────────────────────
const AUTH_CHANGED_EVENT = "zq-auth-changed";

const emitAuthChanged = () => window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
const getToken  = () => localStorage.getItem("cc_token");
const setToken  = (t) => { localStorage.setItem("cc_token", t); emitAuthChanged(); };
const getUser   = () => localStorage.getItem("cc_user");
const setUser   = (u) => { localStorage.setItem("cc_user", u); emitAuthChanged(); };
const clearSession = () => {
  localStorage.removeItem("cc_token");
  localStorage.removeItem("cc_user");
  emitAuthChanged();
};

// ─── API helpers ──────────────────────────────────────────────────────────────
const authHeaders = () => ({ "Content-Type":"application/json", "Authorization":`Bearer ${getToken()}` });

const readErrorMessage = async (response, fallback) => {
  try {
    const data = await response.json();
    if (typeof data?.detail === "string" && data.detail.trim()) return data.detail;
    if (typeof data?.message === "string" && data.message.trim()) return data.message;
  } catch {}
  try {
    const text = await response.text();
    if (text.trim()) return text;
  } catch {}
  return fallback;
};

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Tempo limite ao carregar dados da API. Verifique a conexao com o banco na Vercel.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const ensureApiSuccess = async (response, fallback) => {
  if (response.status === 401) {
    clearSession();
    throw new Error(await readErrorMessage(response, "Sessão expirada. Entre novamente."));
  }
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, fallback));
  }
  return response;
};

const api = {
  login: async (username, password) => {
    const form = new URLSearchParams({ username, password });
    const r = await fetchWithTimeout(`${API}/auth/login`, { method:"POST", body: form });
    await ensureApiSuccess(r, "Usuário ou senha incorretos");
    return r.json();
  },
  get: async (path) => {
    const r = await fetchWithTimeout(`${API}${path}`, { headers: authHeaders() });
    await ensureApiSuccess(r, "Não foi possível carregar os dados.");
    return r.json();
  },
  post: async (path, body) => {
    const r = await fetchWithTimeout(`${API}${path}`, { method:"POST", headers: authHeaders(), body: JSON.stringify(body) });
    await ensureApiSuccess(r, "Não foi possível salvar os dados.");
    return r.json();
  },
  put: async (path, body) => {
    const r = await fetchWithTimeout(`${API}${path}`, { method:"PUT", headers: authHeaders(), body: JSON.stringify(body) });
    await ensureApiSuccess(r, "Não foi possível atualizar os dados.");
    return r.json();
  },
  patch: async (path, body) => {
    const r = await fetchWithTimeout(`${API}${path}`, { method:"PATCH", headers: authHeaders(), body: JSON.stringify(body) });
    await ensureApiSuccess(r, "Não foi possível atualizar os dados.");
    return r.json();
  },
  delete: async (path) => {
    const r = await fetchWithTimeout(`${API}${path}`, { method:"DELETE", headers: authHeaders() });
    await ensureApiSuccess(r, "Não foi possível remover os dados.");
  },
};

// ─── Design tokens ────────────────────────────────────────────────────────────
const G = {
  bg:"#0f1117", card:"#181d27", cardBorder:"#252c3b",
  text:"#e8eaf0", muted:"#6b7280", accent:"#3b82f6",
  green:"#10b981", amber:"#f59e0b", red:"#ef4444",
  purple:"#8b5cf6", teal:"#14b8a6", input:"#1e2535", inputBorder:"#2d3748",
};
const css = {
  page: { minHeight:"100vh", background:G.bg, color:G.text, fontFamily:"'DM Sans','Segoe UI',sans-serif", display:"flex", flexDirection:"column" },
  topbar: { background:G.card, borderBottom:`1px solid ${G.cardBorder}`, padding:"0 16px", display:"flex", alignItems:"center", gap:12, height:56, position:"sticky", top:0, zIndex:100 },
  logo: { fontSize:18, fontWeight:700, color:G.accent, letterSpacing:"-0.5px", flexShrink:0 },
  main: { flex:1, padding:"20px 16px", maxWidth:1100, margin:"0 auto", width:"100%", boxSizing:"border-box" },
  mainMobile: { flex:1, padding:"14px 12px 80px", width:"100%", boxSizing:"border-box" },
  card: { background:G.card, border:`1px solid ${G.cardBorder}`, borderRadius:14, padding:22 },
  cardMobile: { background:G.card, border:`1px solid ${G.cardBorder}`, borderRadius:12, padding:14 },
  h1: { fontSize:20, fontWeight:700, margin:"0 0 16px", letterSpacing:"-0.3px" },
  h2: { fontSize:15, fontWeight:600, margin:"0 0 12px", color:G.text },
  label: { display:"block", fontSize:12, fontWeight:600, color:G.muted, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.5px" },
  input: { width:"100%", boxSizing:"border-box", background:G.input, border:`1px solid ${G.inputBorder}`, color:G.text, borderRadius:8, padding:"10px 12px", fontSize:14, outline:"none" },
  select: { width:"100%", boxSizing:"border-box", background:G.input, border:`1px solid ${G.inputBorder}`, color:G.text, borderRadius:8, padding:"10px 12px", fontSize:14, outline:"none", cursor:"pointer" },
  btn: (c=G.accent) => ({ background:c, color:"#fff", border:"none", borderRadius:8, padding:"10px 20px", fontSize:14, fontWeight:600, cursor:"pointer" }),
  btnSm: (c=G.accent) => ({ background:c, color:"#fff", border:"none", borderRadius:6, padding:"5px 11px", fontSize:12, fontWeight:600, cursor:"pointer" }),
  btnGhost: { background:"transparent", color:G.muted, border:`1px solid ${G.cardBorder}`, borderRadius:8, padding:"10px 20px", fontSize:14, fontWeight:600, cursor:"pointer" },
  grid: (n) => ({ display:"grid", gridTemplateColumns:`repeat(${n},1fr)`, gap:16 }),
  badge: (c) => ({ display:"inline-block", padding:"2px 8px", borderRadius:20, fontSize:11, fontWeight:700, background:c+"22", color:c, border:`1px solid ${c}44` }),
  table: { width:"100%", borderCollapse:"collapse" },
  th: { textAlign:"left", padding:"10px 14px", fontSize:12, fontWeight:700, color:G.muted, textTransform:"uppercase", letterSpacing:"0.5px", borderBottom:`1px solid ${G.cardBorder}` },
  td: { padding:"11px 14px", fontSize:14, borderBottom:`1px solid ${G.cardBorder}22` },
};

// ─── Reusable ─────────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return <div style={{ marginBottom:16 }}><label style={css.label}>{label}</label>{children}</div>;
}

function Modal({ title, onClose, children, wide }) {
  const m = useMobile();
  const overlay = { position:"fixed", inset:0, background:"#000a", zIndex:200, display:"flex", alignItems: m ? "flex-end" : "center", justifyContent:"center", padding: m ? 0 : 20 };
  const box = m
    ? { ...css.card, width:"100%", maxHeight:"92vh", overflowY:"auto", borderBottomLeftRadius:0, borderBottomRightRadius:0, borderTopLeftRadius:18, borderTopRightRadius:18 }
    : { ...css.card, width:"100%", maxWidth:wide?700:520, maxHeight:"90vh", overflowY:"auto" };
  return (
    <div style={overlay} onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={box}>
        <div style={{ display:"flex", alignItems:"center", marginBottom:20 }}>
          <span style={{ fontWeight:700, fontSize:16 }}>{title}</span>
          <button onClick={onClose} style={{ marginLeft:"auto", background:"none", border:"none", color:G.muted, fontSize:24, cursor:"pointer", lineHeight:1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatCard({ label, value, color=G.accent, icon }) {
  return (
    <div style={{ ...css.card, display:"flex", flexDirection:"column", gap:6 }}>
      <span style={{ fontSize:12, color:G.muted, fontWeight:600 }}>{icon} {label}</span>
      <span style={{ fontSize:20, fontWeight:800, color, letterSpacing:"-0.5px" }}>{value}</span>
    </div>
  );
}

function ErrorBanner({ msg }) {
  return msg ? <div style={{ background:G.red+"22", border:`1px solid ${G.red}44`, borderRadius:8, padding:"10px 14px", color:G.red, marginBottom:16, fontSize:13 }}>⚠️ {msg}</div> : null;
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!username || !password) return setError("Preencha usuário e senha");
    setLoading(true); setError("");
    try {
      const data = await api.login(username, password);
      setToken(data.access_token);
      setUser(data.username);
      onLogin(data.username);
    } catch (err) {
      setError(err.message || "Erro ao fazer login");
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:"100vh", background:G.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ width:"100%", maxWidth:380 }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:48, marginBottom:8 }}>💊</div>
          <div style={{ fontSize:26, fontWeight:800, color:G.accent, letterSpacing:"-0.5px" }}>ZQCuidadoras</div>
          <div style={{ fontSize:13, color:G.muted, marginTop:6 }}>Controle de despesas com cuidadoras</div>
        </div>
        <div style={css.card}>
          <ErrorBanner msg={error} />
          <form onSubmit={submit}>
            <Field label="Usuário">
              <input style={css.input} value={username} onChange={e=>setUsername(e.target.value)} placeholder="seu usuário" autoFocus />
            </Field>
            <Field label="Senha">
              <input type="password" style={css.input} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" />
            </Field>
            <button type="submit" style={{ ...css.btn(), width:"100%", marginTop:8, padding:"12px 20px", fontSize:15 }} disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── useData hook ─────────────────────────────────────────────────────────────
function useData(enabled) {
  const [caregivers, setCaregivers] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [extras, setExtras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAll = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      setError("");
      return;
    }
    try {
      setError("");
      const [cgs, shs, exs] = await Promise.all([
        api.get("/caregivers"),
        api.get("/shifts"),
        api.get("/extra-charges"),
      ]);
      setCaregivers(cgs); setShifts(shs); setExtras(exs);
    } catch(e) {
      setError(e?.message || "Não foi possível conectar ao servidor.");
    } finally { setLoading(false); }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    loadAll();
  }, [enabled, loadAll]);
  return { caregivers, setCaregivers, shifts, setShifts, extras, setExtras, loading, error };
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ caregivers, shifts, extras }) {
  const m = useMobile();
  const td = today(); const [wStart,wEnd] = getWeekRange(td); const mStr = td.slice(0,7);
  const all = [...shifts.map(s=>({...s,date:s.shift_date})),...extras.map(e=>({...e,date:e.charge_date}))];
  const sum = (arr) => arr.reduce((a,x)=>a+Number(x.value),0);
  const pendByCg = caregivers
    .map(c=>({c,val:sum(all.filter(x=>x.caregiver_id===c.id&&x.payment_status==="Pending"))}))
    .filter(x=>x.val>0);
  return (
    <div>
      <h1 style={css.h1}>📊 Dashboard</h1>
      <div style={{ ...css.grid(m?2:2), marginBottom:16 }}>
        <StatCard label="Gasto Hoje"            value={fmt(sum(all.filter(x=>x.date===td)))}                           color={G.green}  icon="📅" />
        <StatCard label="Gasto na Semana"       value={fmt(sum(all.filter(x=>x.date>=wStart&&x.date<=wEnd)))}          color={G.accent} icon="📆" />
        <StatCard label="Gasto no Mês"          value={fmt(sum(all.filter(x=>x.date.startsWith(mStr))))}               color={G.purple} icon="🗓️" />
        <StatCard label="Pendente de Pagamento" value={fmt(sum(all.filter(x=>x.payment_status==="Pending")))}          color={G.amber}  icon="⏳" />
      </div>
      {pendByCg.length>0&&(
        <div style={{ ...css.card, marginBottom:16 }}>
          <h2 style={css.h2}>⚠️ Cuidadoras com pagamento pendente</h2>
          {pendByCg.map(({c,val})=>(
            <div key={c.id} style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:`1px solid ${G.cardBorder}22` }}>
              <span>{c.name}</span><span style={{ color:G.amber, fontWeight:700 }}>{fmt(val)}</span>
            </div>
          ))}
        </div>
      )}
      {(() => {
        const ts = shifts.filter(s=>s.shift_date===td);
        const te = extras.filter(e=>e.charge_date===td);
        if (!ts.length&&!te.length) return null;
        return (
          <div style={css.card}>
            <h2 style={css.h2}>📋 Lançamentos de Hoje</h2>
            {ts.map(s=>{ const cg=caregivers.find(c=>c.id===s.caregiver_id); return (
              <div key={s.id} style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:`1px solid ${G.cardBorder}22` }}>
                <div><span style={{ marginRight:8 }}>{shiftIcon[s.shift_type]}</span><span>{cg?.name||"—"}</span><span style={{ ...css.badge(shiftColor[s.shift_type]), marginLeft:8 }}>{shiftLabel[s.shift_type]}</span></div>
                <span style={{ fontWeight:700 }}>{fmt(s.value)}</span>
              </div>
            ); })}
            {te.map(e=>{ const cg=caregivers.find(c=>c.id===e.caregiver_id); return (
              <div key={e.id} style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:`1px solid ${G.cardBorder}22` }}>
                <div><span style={{ marginRight:8 }}>💊</span><span>{cg?.name||"—"}</span><span style={{ ...css.badge(G.teal), marginLeft:8 }}>{e.description}</span></div>
                <span style={{ fontWeight:700 }}>{fmt(e.value)}</span>
              </div>
            ); })}
          </div>
        );
      })()}
    </div>
  );
}

// ─── Caregivers ───────────────────────────────────────────────────────────────
function Caregivers({ caregivers, setCaregivers }) {
  const m = useMobile();
  const blank = { name:"", phone:"", day_shift_value:"", night_shift_value:"", full_day_shift_value:"", payment_type:"Weekly", active:true };
  const [form,setForm] = useState(blank); const [editing,setEditing] = useState(null); const [showModal,setShowModal] = useState(false); const [error,setError] = useState("");
  const open = (cg=null) => { setEditing(cg?.id||null); setForm(cg?{...cg}:blank); setShowModal(true); };
  const close = () => { setShowModal(false); setEditing(null); setForm(blank); setError(""); };
  const save = async () => {
    if (!form.name.trim()) return setError("Nome é obrigatório");
    const body = { ...form, day_shift_value:Number(form.day_shift_value), night_shift_value:Number(form.night_shift_value), full_day_shift_value:Number(form.full_day_shift_value) };
    try {
      if (editing) { const u=await api.put(`/caregivers/${editing}`,body); setCaregivers(caregivers.map(c=>c.id===editing?u:c)); }
      else { const c=await api.post("/caregivers",body); setCaregivers([...caregivers,c]); }
      close();
    } catch { setError("Erro ao salvar."); }
  };
  const toggle = async (cg) => { const u=await api.put(`/caregivers/${cg.id}`,{...cg,active:!cg.active}); setCaregivers(caregivers.map(c=>c.id===cg.id?u:c)); };

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", marginBottom:16 }}>
        <h1 style={{ ...css.h1, margin:0 }}>👩‍⚕️ Cuidadoras</h1>
        <button style={{ ...css.btn(), marginLeft:"auto", fontSize: m?13:14, padding: m?"8px 14px":"10px 20px" }} onClick={()=>open()}>+ Nova</button>
      </div>

      {/* Mobile: cards */}
      {m ? (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {caregivers.length===0&&<div style={{ ...css.card, color:G.muted, textAlign:"center", padding:32 }}>Nenhuma cuidadora cadastrada</div>}
          {caregivers.map(c=>(
            <div key={c.id} style={{ ...css.cardMobile }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                <div>
                  <strong style={{ fontSize:15 }}>{c.name}</strong>
                  {c.phone&&<div style={{ fontSize:12, color:G.muted, marginTop:2 }}>{c.phone}</div>}
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <span style={css.badge(c.active?G.green:G.red)}>{c.active?"Ativa":"Inativa"}</span>
                </div>
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:10, fontSize:13 }}>
                <span style={{ color:G.muted }}>☀️ <strong style={{ color:G.text }}>{fmt(c.day_shift_value)}</strong></span>
                <span style={{ color:G.muted }}>🌙 <strong style={{ color:G.text }}>{fmt(c.night_shift_value)}</strong></span>
                <span style={{ color:G.muted }}>🌗 <strong style={{ color:G.text }}>{fmt(c.full_day_shift_value)}</strong></span>
                <span style={css.badge(c.payment_type==="Weekly"?G.purple:G.accent)}>{c.payment_type==="Weekly"?"Semanal":"Mensal"}</span>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button style={{ ...css.btnSm(G.accent), flex:1 }} onClick={()=>open(c)}>✏️ Editar</button>
                <button style={{ ...css.btnSm(c.active?G.red:G.green), flex:1 }} onClick={()=>toggle(c)}>{c.active?"Desativar":"Ativar"}</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Desktop: table */
        <div style={css.card}>
          <table style={css.table}>
            <thead><tr>{["Nome","Diurno","Noturno","24h","Pagamento","Status","Ações"].map(h=><th key={h} style={css.th}>{h}</th>)}</tr></thead>
            <tbody>
              {caregivers.length===0&&<tr><td colSpan={7} style={{ ...css.td, color:G.muted, textAlign:"center", padding:40 }}>Nenhuma cuidadora cadastrada</td></tr>}
              {caregivers.map(c=>(
                <tr key={c.id}>
                  <td style={css.td}><strong>{c.name}</strong>{c.phone&&<div style={{ fontSize:12, color:G.muted }}>{c.phone}</div>}</td>
                  <td style={css.td}>{fmt(c.day_shift_value)}</td>
                  <td style={css.td}>{fmt(c.night_shift_value)}</td>
                  <td style={css.td}>{fmt(c.full_day_shift_value)}</td>
                  <td style={css.td}><span style={css.badge(c.payment_type==="Weekly"?G.purple:G.accent)}>{c.payment_type==="Weekly"?"Semanal":"Mensal"}</span></td>
                  <td style={css.td}><span style={css.badge(c.active?G.green:G.red)}>{c.active?"Ativa":"Inativa"}</span></td>
                  <td style={css.td}>
                    <button style={{ ...css.btnSm(G.accent), marginRight:6 }} onClick={()=>open(c)}>Editar</button>
                    <button style={css.btnSm(c.active?G.red:G.green)} onClick={()=>toggle(c)}>{c.active?"Desativar":"Ativar"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal&&(
        <Modal title={editing?"Editar Cuidadora":"Nova Cuidadora"} onClose={close}>
          <ErrorBanner msg={error} />
          <Field label="Nome *"><input style={css.input} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} /></Field>
          <Field label="Telefone"><input style={css.input} value={form.phone||""} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="(11) 99999-9999" /></Field>
          <div style={css.grid(m?1:3)}>
            <Field label="☀️ Diurno 12h"><input type="number" style={css.input} value={form.day_shift_value} onChange={e=>setForm({...form,day_shift_value:e.target.value})} /></Field>
            <Field label="🌙 Noturno 12h"><input type="number" style={css.input} value={form.night_shift_value} onChange={e=>setForm({...form,night_shift_value:e.target.value})} /></Field>
            <Field label="🌗 24 horas"><input type="number" style={css.input} value={form.full_day_shift_value} onChange={e=>setForm({...form,full_day_shift_value:e.target.value})} /></Field>
          </div>
          <Field label="Tipo de Pagamento">
            <select style={css.select} value={form.payment_type} onChange={e=>setForm({...form,payment_type:e.target.value})}>
              <option value="Weekly">Semanal</option><option value="Monthly">Mensal</option>
            </select>
          </Field>
          <div style={{ display:"flex", gap:10 }}>
            <button style={css.btn()} onClick={save}>Salvar</button>
            <button style={css.btnGhost} onClick={close}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Extra Charge Modal ───────────────────────────────────────────────────────
function ExtraChargeModal({ caregivers, onClose, onSaved, initial }) {
  const m = useMobile();
  const blank = { caregiver_id:"", charge_date:today(), description:"", value:"", payment_status:"Pending" };
  const [form,setForm] = useState(initial||blank); const [saving,setSaving] = useState(false); const [error,setError] = useState("");
  const save = async () => {
    if (!form.caregiver_id) return setError("Selecione a cuidadora");
    if (!form.description.trim()) return setError("Informe a descrição");
    if (!form.value) return setError("Informe o valor");
    setSaving(true);
    try {
      const body = { ...form, value:Number(form.value) };
      const result = initial?.id ? await api.put(`/extra-charges/${initial.id}`,body) : await api.post("/extra-charges",body);
      onSaved(result);
    } catch { setError("Erro ao salvar."); } finally { setSaving(false); }
  };
  return (
    <Modal title={initial?.id?"Editar Avulso":"Nova Cobrança Avulsa"} onClose={onClose}>
      <ErrorBanner msg={error} />
      <div style={{ background:G.teal+"11", border:`1px solid ${G.teal}33`, borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:13, color:G.teal }}>
        💊 Use para aplicações, procedimentos ou qualquer serviço fora do plantão fixo.
      </div>
      <div style={css.grid(m?1:2)}>
        <Field label="Data"><input type="date" style={css.input} value={form.charge_date} onChange={e=>setForm({...form,charge_date:e.target.value})} /></Field>
        <Field label="Cuidadora *">
          <select style={css.select} value={form.caregiver_id} onChange={e=>setForm({...form,caregiver_id:e.target.value})}>
            <option value="">Selecione...</option>
            {caregivers.filter(c=>c.active).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Descrição *"><input style={css.input} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Ex: Aplicação de insulina, Curativo..." /></Field>
      <div style={css.grid(m?1:2)}>
        <Field label="Valor (R$) *"><input type="number" style={css.input} value={form.value} onChange={e=>setForm({...form,value:e.target.value})} /></Field>
        <Field label="Status">
          <select style={css.select} value={form.payment_status} onChange={e=>setForm({...form,payment_status:e.target.value})}>
            <option value="Pending">Pendente</option><option value="Paid">Pago</option>
          </select>
        </Field>
      </div>
      <div style={{ display:"flex", gap:10 }}>
        <button style={css.btn(G.teal)} onClick={save} disabled={saving}>{saving?"Salvando...":"Salvar Avulso"}</button>
        <button style={css.btnGhost} onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  );
}

// ─── Shifts ───────────────────────────────────────────────────────────────────
function Shifts({ caregivers, shifts, setShifts, extras, setExtras }) {
  const m = useMobile();
  const [activeTab,setActiveTab] = useState("shifts");
  const [filter,setFilter] = useState({ month:today().slice(0,7), caregiverId:"" });
  const blankS = { caregiver_id:"", shift_date:today(), shift_type:"Day12h", value:"", notes:"", payment_status:"Pending" };
  const [formS,setFormS] = useState(blankS); const [editingS,setEditingS] = useState(null); const [showModalS,setShowModalS] = useState(false);
  const [editingExtra,setEditingExtra] = useState(null); const [showModalE,setShowModalE] = useState(false);

  const getVal = (cgId,type) => { const cg=caregivers.find(c=>c.id===cgId); if(!cg) return ""; return type==="Day12h"?cg.day_shift_value:type==="Night12h"?cg.night_shift_value:cg.full_day_shift_value; };
  const openS = (s=null) => { setEditingS(s?.id||null); setFormS(s?{...s}:blankS); setShowModalS(true); };
  const closeS = () => { setShowModalS(false); setEditingS(null); setFormS(blankS); };
  const saveShift = async () => {
    if (!formS.caregiver_id) return alert("Selecione uma cuidadora");
    if (!formS.value) return alert("Informe o valor");
    const body = { ...formS, value:Number(formS.value) };
    if (editingS) { const u=await api.put(`/shifts/${editingS}`,body); setShifts(shifts.map(s=>s.id===editingS?u:s)); }
    else { const c=await api.post("/shifts",body); setShifts([...shifts,c]); }
    closeS();
  };
  const delShift = async (id) => { if(!confirm("Remover?")) return; await api.delete(`/shifts/${id}`); setShifts(shifts.filter(s=>s.id!==id)); };
  const toggleShiftPay = async (s) => { const st=s.payment_status==="Paid"?"Pending":"Paid"; const u=await api.patch(`/shifts/${s.id}/payment`,{payment_status:st,payment_date:st==="Paid"?today():null}); setShifts(shifts.map(x=>x.id===s.id?u:x)); };
  const delExtra = async (id) => { if(!confirm("Remover?")) return; await api.delete(`/extra-charges/${id}`); setExtras(extras.filter(e=>e.id!==id)); };
  const toggleExtraPay = async (e) => { const st=e.payment_status==="Paid"?"Pending":"Paid"; const u=await api.patch(`/extra-charges/${e.id}/payment`,{payment_status:st,payment_date:st==="Paid"?today():null}); setExtras(extras.map(x=>x.id===e.id?u:x)); };

  const filteredS = shifts.filter(s=>s.shift_date.startsWith(filter.month)&&(!filter.caregiverId||s.caregiver_id===filter.caregiverId)).sort((a,b)=>b.shift_date.localeCompare(a.shift_date));
  const filteredE = extras.filter(e=>e.charge_date.startsWith(filter.month)&&(!filter.caregiverId||e.caregiver_id===filter.caregiverId)).sort((a,b)=>b.charge_date.localeCompare(a.charge_date));
  const sum = arr => arr.reduce((a,x)=>a+Number(x.value),0);

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", marginBottom:14, gap:8, flexWrap:"wrap" }}>
        <h1 style={{ ...css.h1, margin:0 }}>📋 Lançamentos</h1>
        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          <button style={{ ...css.btn(), fontSize:m?13:14, padding:m?"8px 12px":"10px 20px" }} onClick={()=>openS()}>+ Plantão</button>
          <button style={{ ...css.btn(G.teal), fontSize:m?13:14, padding:m?"8px 12px":"10px 20px" }} onClick={()=>{ setEditingExtra(null); setShowModalE(true); }}>+ Avulso 💊</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
        <input type="month" style={{ ...css.input, width:m?"100%":160 }} value={filter.month} onChange={e=>setFilter({...filter,month:e.target.value})} />
        <select style={{ ...css.select, width:m?"100%":200 }} value={filter.caregiverId} onChange={e=>setFilter({...filter,caregiverId:e.target.value})}>
          <option value="">Todas as cuidadoras</option>
          {caregivers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:0, marginBottom:12, background:G.card, borderRadius:10, border:`1px solid ${G.cardBorder}`, overflow:"hidden", width:"100%" }}>
        {[["shifts",`🌿 Plantões (${filteredS.length})`],["extras",`💊 Avulsos (${filteredE.length})`]].map(([id,label])=>(
          <button key={id} onClick={()=>setActiveTab(id)} style={{ flex:1, padding:"9px 12px", border:"none", background:activeTab===id?G.accent:"transparent", color:activeTab===id?"#fff":G.muted, fontWeight:600, fontSize:13, cursor:"pointer" }}>{label}</button>
        ))}
      </div>

      {/* Summary bar */}
      <div style={{ ...css.card, marginBottom:12, padding:"12px 16px" }}>
        <div style={{ display:"flex", gap:m?12:24, flexWrap:"wrap" }}>
          <span style={{ color:G.muted, fontSize:13 }}>Plantões: <strong style={{ color:G.text }}>{fmt(sum(filteredS))}</strong></span>
          <span style={{ color:G.muted, fontSize:13 }}>Avulsos: <strong style={{ color:G.teal }}>{fmt(sum(filteredE))}</strong></span>
          <span style={{ color:G.muted, fontSize:13 }}>Total: <strong style={{ color:G.green }}>{fmt(sum(filteredS)+sum(filteredE))}</strong></span>
          <span style={{ color:G.muted, fontSize:13 }}>Pend.: <strong style={{ color:G.amber }}>{fmt(sum([...filteredS,...filteredE].filter(x=>x.payment_status==="Pending")))}</strong></span>
        </div>
      </div>

      {/* Shifts list */}
      {activeTab==="shifts"&&(
        m ? (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {filteredS.length===0&&<div style={{ ...css.card, color:G.muted, textAlign:"center", padding:32 }}>Nenhum plantão</div>}
            {filteredS.map(s=>{ const cg=caregivers.find(c=>c.id===s.caregiver_id); return (
              <div key={s.id} style={{ ...css.cardMobile, opacity:s.payment_status==="Paid"?0.6:1 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15 }}>{cg?.name||"—"}</div>
                    <div style={{ fontSize:12, color:G.muted, marginTop:2 }}>{fmtDate(s.shift_date)}{s.created_by?` · 👤 ${s.created_by}`:""}{s.updated_by&&s.updated_by!==s.created_by?` · ✏️ ${s.updated_by}`:""}</div>
                  </div>
                  <span style={{ fontWeight:800, fontSize:16, color:G.text }}>{fmt(s.value)}</span>
                </div>
                <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
                  <span style={css.badge(shiftColor[s.shift_type])}>{shiftIcon[s.shift_type]} {shiftLabel[s.shift_type]}</span>
                  <span style={css.badge(s.payment_status==="Paid"?G.green:G.amber)}>{s.payment_status==="Paid"?"✓ Pago":"Pendente"}</span>
                  {s.notes&&<span style={{ fontSize:12, color:G.muted }}>{s.notes}</span>}
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button style={{ ...css.btnSm(s.payment_status==="Paid"?G.muted:G.green), flex:1 }} onClick={()=>toggleShiftPay(s)}>{s.payment_status==="Paid"?"Desfazer":"✓ Pagar"}</button>
                  <button style={{ ...css.btnSm(G.accent) }} onClick={()=>openS(s)}>✏️</button>
                  <button style={{ ...css.btnSm(G.red) }} onClick={()=>delShift(s.id)}>🗑️</button>
                </div>
              </div>
            ); })}
          </div>
        ) : (
          <div style={css.card}>
            <table style={css.table}>
              <thead><tr>{["Data","Cuidadora","Tipo","Valor","Status","Obs","Ações"].map(h=><th key={h} style={css.th}>{h}</th>)}</tr></thead>
              <tbody>
                {filteredS.length===0&&<tr><td colSpan={7} style={{ ...css.td, color:G.muted, textAlign:"center", padding:40 }}>Nenhum plantão</td></tr>}
                {filteredS.map(s=>{ const cg=caregivers.find(c=>c.id===s.caregiver_id); return (
                  <tr key={s.id} style={{ opacity:s.payment_status==="Paid"?0.6:1 }}>
                    <td style={css.td}>
                      {fmtDate(s.shift_date)}
                      {s.created_by&&<div style={{ fontSize:11, color:G.muted, marginTop:2 }}>👤 {s.created_by}{s.updated_by&&s.updated_by!==s.created_by?<span> · ✏️ {s.updated_by}</span>:null}</div>}
                    </td>
                    <td style={css.td}>{cg?.name||"—"}</td>
                    <td style={css.td}><span style={css.badge(shiftColor[s.shift_type])}>{shiftIcon[s.shift_type]} {shiftLabel[s.shift_type]}</span></td>
                    <td style={{ ...css.td, fontWeight:700 }}>{fmt(s.value)}</td>
                    <td style={css.td}><span style={css.badge(s.payment_status==="Paid"?G.green:G.amber)}>{s.payment_status==="Paid"?"✓ Pago":"Pendente"}</span></td>
                    <td style={{ ...css.td, fontSize:12, color:G.muted }}>{s.notes||"—"}</td>
                    <td style={css.td}>
                      <button style={{ ...css.btnSm(s.payment_status==="Paid"?G.muted:G.green), marginRight:4 }} onClick={()=>toggleShiftPay(s)}>{s.payment_status==="Paid"?"Desfazer":"Pagar"}</button>
                      <button style={{ ...css.btnSm(G.accent), marginRight:4 }} onClick={()=>openS(s)}>✏️</button>
                      <button style={css.btnSm(G.red)} onClick={()=>delShift(s.id)}>🗑️</button>
                    </td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Extras list */}
      {activeTab==="extras"&&(
        m ? (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {filteredE.length===0&&<div style={{ ...css.card, color:G.muted, textAlign:"center", padding:32 }}>Nenhum avulso</div>}
            {filteredE.map(e=>{ const cg=caregivers.find(c=>c.id===e.caregiver_id); return (
              <div key={e.id} style={{ ...css.cardMobile, opacity:e.payment_status==="Paid"?0.6:1 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15 }}>{cg?.name||"—"}</div>
                    <div style={{ fontSize:12, color:G.muted, marginTop:2 }}>{fmtDate(e.charge_date)}{e.created_by?` · 👤 ${e.created_by}`:""}{e.updated_by&&e.updated_by!==e.created_by?` · ✏️ ${e.updated_by}`:""}</div>
                  </div>
                  <span style={{ fontWeight:800, fontSize:16, color:G.teal }}>{fmt(e.value)}</span>
                </div>
                <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
                  <span style={css.badge(G.teal)}>💊 {e.description}</span>
                  <span style={css.badge(e.payment_status==="Paid"?G.green:G.amber)}>{e.payment_status==="Paid"?"✓ Pago":"Pendente"}</span>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button style={{ ...css.btnSm(e.payment_status==="Paid"?G.muted:G.green), flex:1 }} onClick={()=>toggleExtraPay(e)}>{e.payment_status==="Paid"?"Desfazer":"✓ Pagar"}</button>
                  <button style={{ ...css.btnSm(G.accent) }} onClick={()=>{ setEditingExtra(e); setShowModalE(true); }}>✏️</button>
                  <button style={{ ...css.btnSm(G.red) }} onClick={()=>delExtra(e.id)}>🗑️</button>
                </div>
              </div>
            ); })}
          </div>
        ) : (
          <div style={css.card}>
            <table style={css.table}>
              <thead><tr>{["Data","Cuidadora","Descrição","Valor","Status","Ações"].map(h=><th key={h} style={css.th}>{h}</th>)}</tr></thead>
              <tbody>
                {filteredE.length===0&&<tr><td colSpan={6} style={{ ...css.td, color:G.muted, textAlign:"center", padding:40 }}>Nenhum avulso</td></tr>}
                {filteredE.map(e=>{ const cg=caregivers.find(c=>c.id===e.caregiver_id); return (
                  <tr key={e.id} style={{ opacity:e.payment_status==="Paid"?0.6:1 }}>
                    <td style={css.td}>
                      {fmtDate(e.charge_date)}
                      {e.created_by&&<div style={{ fontSize:11, color:G.muted, marginTop:2 }}>👤 {e.created_by}{e.updated_by&&e.updated_by!==e.created_by?<span> · ✏️ {e.updated_by}</span>:null}</div>}
                    </td>
                    <td style={css.td}>{cg?.name||"—"}</td>
                    <td style={css.td}><span style={css.badge(G.teal)}>💊 {e.description}</span></td>
                    <td style={{ ...css.td, fontWeight:700 }}>{fmt(e.value)}</td>
                    <td style={css.td}><span style={css.badge(e.payment_status==="Paid"?G.green:G.amber)}>{e.payment_status==="Paid"?"✓ Pago":"Pendente"}</span></td>
                    <td style={css.td}>
                      <button style={{ ...css.btnSm(e.payment_status==="Paid"?G.muted:G.green), marginRight:4 }} onClick={()=>toggleExtraPay(e)}>{e.payment_status==="Paid"?"Desfazer":"Pagar"}</button>
                      <button style={{ ...css.btnSm(G.accent), marginRight:4 }} onClick={()=>{ setEditingExtra(e); setShowModalE(true); }}>✏️</button>
                      <button style={css.btnSm(G.red)} onClick={()=>delExtra(e.id)}>🗑️</button>
                    </td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Modals */}
      {showModalS&&(
        <Modal title={editingS?"Editar Plantão":"Novo Plantão"} onClose={closeS}>
          <div style={css.grid(m?1:2)}>
            <Field label="Data"><input type="date" style={css.input} value={formS.shift_date} onChange={e=>setFormS({...formS,shift_date:e.target.value})} /></Field>
            <Field label="Cuidadora">
              <select style={css.select} value={formS.caregiver_id} onChange={e=>{ const v=getVal(e.target.value,formS.shift_type); setFormS({...formS,caregiver_id:e.target.value,value:v}); }}>
                <option value="">Selecione...</option>
                {caregivers.filter(c=>c.active).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Tipo de Plantão">
            <div style={{ display:"flex", gap:8 }}>
              {[["Day12h","☀️ Diurno"],["Night12h","🌙 Noturno"],["Full24h","🌗 24h"]].map(([v,l])=>(
                <button key={v} onClick={()=>{ const val=getVal(formS.caregiver_id,v); setFormS({...formS,shift_type:v,value:val}); }}
                  style={{ flex:1, padding:"10px 6px", borderRadius:8, border:`2px solid ${formS.shift_type===v?shiftColor[v]:G.inputBorder}`, background:formS.shift_type===v?shiftColor[v]+"22":G.input, color:formS.shift_type===v?shiftColor[v]:G.muted, fontWeight:600, fontSize:12, cursor:"pointer" }}>{l}</button>
              ))}
            </div>
          </Field>
          <div style={css.grid(m?1:2)}>
            <Field label="Valor (R$)"><input type="number" style={css.input} value={formS.value} onChange={e=>setFormS({...formS,value:e.target.value})} /></Field>
            <Field label="Status">
              <select style={css.select} value={formS.payment_status} onChange={e=>setFormS({...formS,payment_status:e.target.value})}>
                <option value="Pending">Pendente</option><option value="Paid">Pago</option>
              </select>
            </Field>
          </div>
          <Field label="Observação"><input style={css.input} value={formS.notes||""} onChange={e=>setFormS({...formS,notes:e.target.value})} placeholder="Opcional..." /></Field>
          <div style={{ display:"flex", gap:10 }}>
            <button style={css.btn()} onClick={saveShift}>Salvar</button>
            <button style={css.btnGhost} onClick={closeS}>Cancelar</button>
          </div>
        </Modal>
      )}
      {showModalE&&(
        <ExtraChargeModal caregivers={caregivers} initial={editingExtra}
          onClose={()=>{ setShowModalE(false); setEditingExtra(null); }}
          onSaved={(r)=>{ if(editingExtra?.id) setExtras(extras.map(e=>e.id===r.id?r:e)); else setExtras([...extras,r]); setShowModalE(false); setEditingExtra(null); }}
        />
      )}
    </div>
  );
}

// ─── Calendar ─────────────────────────────────────────────────────────────────
function Calendar({ caregivers, shifts, extras }) {
  const m = useMobile();
  const now = new Date(); const [year,setYear] = useState(now.getFullYear()); const [month,setMonth] = useState(now.getMonth()+1); const [selected,setSelected] = useState(null);
  const days = getDaysInMonth(year,month); const firstDay = new Date(year,month-1,1).getDay();
  const prefix = `${year}-${String(month).padStart(2,"0")}`;
  const byDay = useMemo(() => {
    const map = {};
    shifts.filter(s=>s.shift_date.startsWith(prefix)).forEach(s=>{ const d=parseInt(s.shift_date.split("-")[2]); if(!map[d]) map[d]={shifts:[],extras:[]}; map[d].shifts.push(s); });
    extras.filter(e=>e.charge_date.startsWith(prefix)).forEach(e=>{ const d=parseInt(e.charge_date.split("-")[2]); if(!map[d]) map[d]={shifts:[],extras:[]}; map[d].extras.push(e); });
    return map;
  }, [shifts,extras,year,month]);
  const changeMonth = (delta) => { let mo=month+delta,y=year; if(mo<1){mo=12;y--;} if(mo>12){mo=1;y++;} setMonth(mo); setYear(y); setSelected(null); };
  const selectedDate = selected?`${year}-${String(month).padStart(2,"0")}-${String(selected).padStart(2,"0")}`:null;
  const selData = selected?byDay[selected]:null;
  const selTotal = selData?[...selData.shifts,...selData.extras].reduce((a,x)=>a+Number(x.value),0):0;
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <h1 style={{ ...css.h1, margin:0 }}>📅 Calendário</h1>
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
          <button style={css.btnGhost} onClick={()=>changeMonth(-1)}>‹</button>
          <span style={{ fontWeight:700, minWidth:m?110:140, textAlign:"center", fontSize: m?13:15 }}>{monthName(month)} {year}</span>
          <button style={css.btnGhost} onClick={()=>changeMonth(1)}>›</button>
        </div>
      </div>
      <div style={{ display:"flex", gap:16, alignItems:"flex-start", flexDirection: m?"column":"row" }}>
        <div style={{ ...css.card, flex:1, width:"100%", padding:m?10:16, boxSizing:"border-box" }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, marginBottom:4 }}>
            {["D","S","T","Q","Q","S","S"].map((d,i)=><div key={i} style={{ textAlign:"center", fontSize:10, fontWeight:700, color:G.muted, padding:"3px 0" }}>{d}</div>)}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2 }}>
            {Array(firstDay).fill(null).map((_,i)=><div key={"e"+i} />)}
            {Array(days).fill(null).map((_,i)=>{
              const d=i+1; const data=byDay[d]||{shifts:[],extras:[]}; const total=[...data.shifts,...data.extras].reduce((a,x)=>a+Number(x.value),0);
              const isToday=`${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`===today(); const isSel=selected===d;
              return (
                <div key={d} onClick={()=>setSelected(d===selected?null:d)} style={{ background:isSel?G.accent:isToday?G.accent+"22":G.input, border:`1px solid ${isSel?G.accent:isToday?G.accent:G.cardBorder}`, borderRadius:6, padding:m?"3px 2px":"5px 6px", minHeight:m?52:70, cursor:"pointer" }}>
                  <div style={{ fontSize:m?10:11, fontWeight:700, color:isSel?"#fff":isToday?G.accent:G.muted, marginBottom:1 }}>{d}</div>
                  {!m&&data.shifts.slice(0,2).map(s=>{ const cg=caregivers.find(c=>c.id===s.caregiver_id); return <div key={s.id} style={{ fontSize:9, padding:"1px 3px", borderRadius:3, marginBottom:1, background:isSel?"#ffffff22":shiftColor[s.shift_type]+"22", color:isSel?"#fff":shiftColor[s.shift_type], overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>{shiftIcon[s.shift_type]} {cg?.name?.split(" ")[0]||"?"}</div>; })}
                  {!m&&data.extras.slice(0,1).map(e=><div key={e.id} style={{ fontSize:9, padding:"1px 3px", borderRadius:3, marginBottom:1, background:isSel?"#ffffff22":G.teal+"22", color:isSel?"#fff":G.teal, overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>💊</div>)}
                  {m&&(data.shifts.length+data.extras.length)>0&&<div style={{ fontSize:9, color:isSel?"#fff":G.accent, fontWeight:700 }}>●{data.shifts.length+data.extras.length}</div>}
                  {total>0&&<div style={{ fontSize:9, fontWeight:700, color:isSel?"#fff":G.green, marginTop:1 }}>{m?fmt(total).replace("R$","").trim():fmt(total)}</div>}
                </div>
              );
            })}
          </div>
        </div>
        {selected&&(
          <div style={{ ...css.card, width:m?"100%":300, flexShrink:0 }}>
            <h2 style={{ ...css.h2, marginBottom:16 }}>📅 {fmtDate(selectedDate)}</h2>
            {!selData&&<div style={{ color:G.muted, fontSize:13 }}>Nenhum lançamento</div>}
            {selData?.shifts.map(s=>{ const cg=caregivers.find(c=>c.id===s.caregiver_id); return (
              <div key={s.id} style={{ padding:"10px 0", borderBottom:`1px solid ${G.cardBorder}22` }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ fontWeight:600 }}>{cg?.name||"—"}</span><span style={{ fontWeight:700 }}>{fmt(s.value)}</span></div>
                <div style={{ display:"flex", gap:6, marginTop:4 }}><span style={css.badge(shiftColor[s.shift_type])}>{shiftIcon[s.shift_type]} {shiftLabel[s.shift_type]}</span><span style={css.badge(s.payment_status==="Paid"?G.green:G.amber)}>{s.payment_status==="Paid"?"Pago":"Pendente"}</span></div>
              </div>
            ); })}
            {selData?.extras.map(e=>{ const cg=caregivers.find(c=>c.id===e.caregiver_id); return (
              <div key={e.id} style={{ padding:"10px 0", borderBottom:`1px solid ${G.cardBorder}22` }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ fontWeight:600 }}>{cg?.name||"—"}</span><span style={{ fontWeight:700, color:G.teal }}>{fmt(e.value)}</span></div>
                <div style={{ display:"flex", gap:6, marginTop:4 }}><span style={css.badge(G.teal)}>💊 {e.description}</span><span style={css.badge(e.payment_status==="Paid"?G.green:G.amber)}>{e.payment_status==="Paid"?"Pago":"Pendente"}</span></div>
              </div>
            ); })}
            {selTotal>0&&<div style={{ display:"flex", justifyContent:"space-between", paddingTop:12, fontWeight:800 }}><span>Total do dia</span><span style={{ color:G.green }}>{fmt(selTotal)}</span></div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Weekly ───────────────────────────────────────────────────────────────────
function WeeklyClose({ caregivers, shifts, setShifts, extras, setExtras }) {
  const m = useMobile();
  const [weekDate,setWeekDate] = useState(today()); const [wStart,wEnd] = getWeekRange(weekDate);
  const weekShifts = shifts.filter(s=>s.shift_date>=wStart&&s.shift_date<=wEnd);
  const weekExtras = extras.filter(e=>e.charge_date>=wStart&&e.charge_date<=wEnd);
  const weeklyCgs  = caregivers.filter(c=>c.payment_type==="Weekly");
  const sum = arr => arr.reduce((a,x)=>a+Number(x.value),0);
  const markAllPaid = async (cgId) => {
    const td=today();
    const updS = await Promise.all(weekShifts.filter(s=>s.caregiver_id===cgId&&s.payment_status==="Pending").map(s=>api.patch(`/shifts/${s.id}/payment`,{payment_status:"Paid",payment_date:td})));
    const updE = await Promise.all(weekExtras.filter(e=>e.caregiver_id===cgId&&e.payment_status==="Pending").map(e=>api.patch(`/extra-charges/${e.id}/payment`,{payment_status:"Paid",payment_date:td})));
    setShifts(shifts.map(s=>{ const u=updS.find(x=>x.id===s.id); return u||s; }));
    setExtras(extras.map(e=>{ const u=updE.find(x=>x.id===e.id); return u||e; }));
  };
  return (
    <div>
      <h1 style={css.h1}>📆 Fechamento Semanal</h1>
      <div style={{ ...css.card, marginBottom:16 }}>
        <div style={{ display:"flex", gap:12, alignItems:"flex-end", flexWrap:"wrap" }}>
          <div style={{ flex:1, minWidth:160 }}><label style={css.label}>Semana de referência</label><input type="date" style={css.input} value={weekDate} onChange={e=>setWeekDate(e.target.value)} /></div>
          <div style={{ padding:"10px 14px", background:G.accent+"22", borderRadius:8, color:G.accent, fontWeight:600, fontSize:13 }}>{fmtDate(wStart)} → {fmtDate(wEnd)}</div>
        </div>
      </div>
      {weeklyCgs.length===0&&<div style={{ ...css.card, color:G.muted, textAlign:"center", padding:40 }}>Nenhuma cuidadora com pagamento semanal</div>}
      {weeklyCgs.map(cg=>{
        const cgS=weekShifts.filter(s=>s.caregiver_id===cg.id); const cgE=weekExtras.filter(e=>e.caregiver_id===cg.id);
        if(!cgS.length&&!cgE.length) return null;
        const total=sum(cgS)+sum(cgE); const pend=sum([...cgS,...cgE].filter(x=>x.payment_status==="Pending")); const allPaid=[...cgS,...cgE].every(x=>x.payment_status==="Paid");
        return (
          <div key={cg.id} style={{ ...css.card, marginBottom:14 }}>
            <div style={{ display:"flex", alignItems:"center", marginBottom:12, flexWrap:"wrap", gap:8 }}>
              <span style={{ fontWeight:700, fontSize:15 }}>{cg.name}</span>
              <span style={css.badge(G.purple)}>Semanal</span>
              {allPaid&&<span style={css.badge(G.green)}>✓ Pago</span>}
              {!allPaid&&pend>0&&<button style={{ ...css.btn(G.green), marginLeft:"auto", padding:"8px 14px", fontSize:13 }} onClick={()=>markAllPaid(cg.id)}>Marcar Pago ({fmt(pend)})</button>}
            </div>
            {m ? (
              /* Mobile: cards for shifts/extras */
              <div>
                {cgS.map(s=>(
                  <div key={s.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:`1px solid ${G.cardBorder}22`, opacity:s.payment_status==="Paid"?0.6:1 }}>
                    <div><span style={css.badge(shiftColor[s.shift_type])}>{shiftIcon[s.shift_type]} {shiftLabel[s.shift_type]}</span><div style={{ fontSize:11, color:G.muted, marginTop:2 }}>{fmtDate(s.shift_date)}</div></div>
                    <div style={{ textAlign:"right" }}><div style={{ fontWeight:700 }}>{fmt(s.value)}</div><span style={css.badge(s.payment_status==="Paid"?G.green:G.amber)}>{s.payment_status==="Paid"?"Pago":"Pend."}</span></div>
                  </div>
                ))}
                {cgE.map(e=>(
                  <div key={e.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:`1px solid ${G.cardBorder}22`, opacity:e.payment_status==="Paid"?0.6:1 }}>
                    <div><span style={css.badge(G.teal)}>💊 {e.description}</span><div style={{ fontSize:11, color:G.muted, marginTop:2 }}>{fmtDate(e.charge_date)}</div></div>
                    <div style={{ textAlign:"right" }}><div style={{ fontWeight:700, color:G.teal }}>{fmt(e.value)}</div><span style={css.badge(e.payment_status==="Paid"?G.green:G.amber)}>{e.payment_status==="Paid"?"Pago":"Pend."}</span></div>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                {cgS.length>0&&<><div style={{ fontSize:12, fontWeight:700, color:G.muted, marginBottom:6, textTransform:"uppercase" }}>Plantões</div>
                <table style={{ ...css.table, marginBottom:12 }}><thead><tr>{["Data","Tipo","Valor","Status"].map(h=><th key={h} style={css.th}>{h}</th>)}</tr></thead>
                <tbody>{cgS.map(s=><tr key={s.id} style={{ opacity:s.payment_status==="Paid"?0.6:1 }}><td style={css.td}>{fmtDate(s.shift_date)}</td><td style={css.td}><span style={css.badge(shiftColor[s.shift_type])}>{shiftIcon[s.shift_type]} {shiftLabel[s.shift_type]}</span></td><td style={{ ...css.td, fontWeight:700 }}>{fmt(s.value)}</td><td style={css.td}><span style={css.badge(s.payment_status==="Paid"?G.green:G.amber)}>{s.payment_status==="Paid"?"✓ Pago":"Pendente"}</span></td></tr>)}</tbody></table></>}
                {cgE.length>0&&<><div style={{ fontSize:12, fontWeight:700, color:G.teal, marginBottom:6, textTransform:"uppercase" }}>💊 Avulsos</div>
                <table style={{ ...css.table, marginBottom:12 }}><thead><tr>{["Data","Descrição","Valor","Status"].map(h=><th key={h} style={css.th}>{h}</th>)}</tr></thead>
                <tbody>{cgE.map(e=><tr key={e.id} style={{ opacity:e.payment_status==="Paid"?0.6:1 }}><td style={css.td}>{fmtDate(e.charge_date)}</td><td style={css.td}>{e.description}</td><td style={{ ...css.td, fontWeight:700, color:G.teal }}>{fmt(e.value)}</td><td style={css.td}><span style={css.badge(e.payment_status==="Paid"?G.green:G.amber)}>{e.payment_status==="Paid"?"✓ Pago":"Pendente"}</span></td></tr>)}</tbody></table></>}
              </div>
            )}
            <div style={{ display:"flex", gap:16, paddingTop:10, borderTop:`1px solid ${G.cardBorder}`, flexWrap:"wrap" }}>
              {cgS.length>0&&<span style={{ fontSize:13, color:G.muted }}>Plantões: <strong style={{ color:G.text }}>{fmt(sum(cgS))}</strong></span>}
              {cgE.length>0&&<span style={{ fontSize:13, color:G.muted }}>Avulsos: <strong style={{ color:G.teal }}>{fmt(sum(cgE))}</strong></span>}
              <span style={{ fontSize:14, fontWeight:800, color:G.accent, marginLeft:"auto" }}>Total: {fmt(total)}</span>
            </div>
          </div>
        );
      })}
      {(weekShifts.length>0||weekExtras.length>0)&&(
        <div style={{ ...css.card, background:G.accent+"11", border:`1px solid ${G.accent}44` }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
            <div><div style={{ fontWeight:700 }}>Total Geral da Semana</div><div style={{ fontSize:12, color:G.muted, marginTop:2 }}>Plantões: {fmt(sum(weekShifts))} · Avulsos: {fmt(sum(weekExtras))}</div></div>
            <span style={{ fontWeight:800, fontSize:20, color:G.accent }}>{fmt(sum(weekShifts)+sum(weekExtras))}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Monthly ──────────────────────────────────────────────────────────────────
function MonthlyClose({ caregivers, shifts, setShifts, extras, setExtras }) {
  const m = useMobile();
  const now = new Date(); const [year,setYear] = useState(now.getFullYear()); const [month,setMonth] = useState(now.getMonth()+1);
  const mStr = `${year}-${String(month).padStart(2,"0")}`;
  const monthShifts = shifts.filter(s=>s.shift_date.startsWith(mStr));
  const monthExtras = extras.filter(e=>e.charge_date.startsWith(mStr));
  const sum = arr => arr.reduce((a,x)=>a+Number(x.value),0);
  const markAllPaid = async (cgId) => {
    const td=today();
    const updS=await Promise.all(monthShifts.filter(s=>s.caregiver_id===cgId&&s.payment_status==="Pending").map(s=>api.patch(`/shifts/${s.id}/payment`,{payment_status:"Paid",payment_date:td})));
    const updE=await Promise.all(monthExtras.filter(e=>e.caregiver_id===cgId&&e.payment_status==="Pending").map(e=>api.patch(`/extra-charges/${e.id}/payment`,{payment_status:"Paid",payment_date:td})));
    setShifts(shifts.map(s=>{ const u=updS.find(x=>x.id===s.id); return u||s; }));
    setExtras(extras.map(e=>{ const u=updE.find(x=>x.id===e.id); return u||e; }));
  };
  const changeMonth = (delta) => { let mo=month+delta,y=year; if(mo<1){mo=12;y--;} if(mo>12){mo=1;y++;} setMonth(mo); setYear(y); };
  const allCgs = caregivers.filter(c=>[...monthShifts,...monthExtras].some(x=>x.caregiver_id===c.id));
  const all = [...monthShifts,...monthExtras];
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <h1 style={{ ...css.h1, margin:0 }}>🗓️ Mensal</h1>
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
          <button style={css.btnGhost} onClick={()=>changeMonth(-1)}>‹</button>
          <span style={{ fontWeight:700, minWidth:m?110:160, textAlign:"center", fontSize:m?13:15 }}>{monthName(month)} {year}</span>
          <button style={css.btnGhost} onClick={()=>changeMonth(1)}>›</button>
        </div>
      </div>
      <div style={{ ...css.grid(m?1:3), marginBottom:16 }}>
        <StatCard label="Total do Mês" value={fmt(sum(all))} color={G.accent} icon="💰" />
        <StatCard label="Total Pago"   value={fmt(sum(all.filter(x=>x.payment_status==="Paid")))} color={G.green} icon="✅" />
        <StatCard label="Pendente"     value={fmt(sum(all.filter(x=>x.payment_status==="Pending")))} color={G.amber} icon="⏳" />
      </div>
      {allCgs.length===0&&<div style={{ ...css.card, color:G.muted, textAlign:"center", padding:40 }}>Nenhum lançamento neste mês</div>}
      {allCgs.map(cg=>{
        const cgS=monthShifts.filter(s=>s.caregiver_id===cg.id); const cgE=monthExtras.filter(e=>e.caregiver_id===cg.id);
        const total=sum(cgS)+sum(cgE); const pend=sum([...cgS,...cgE].filter(x=>x.payment_status==="Pending")); const allPaid=[...cgS,...cgE].every(x=>x.payment_status==="Paid");
        return (
          <div key={cg.id} style={{ ...css.card, marginBottom:14 }}>
            <div style={{ display:"flex", alignItems:"center", marginBottom:12, flexWrap:"wrap", gap:8 }}>
              <span style={{ fontWeight:700, fontSize:15 }}>{cg.name}</span>
              <span style={css.badge(cg.payment_type==="Weekly"?G.purple:G.accent)}>{cg.payment_type==="Weekly"?"Semanal":"Mensal"}</span>
              {allPaid&&<span style={css.badge(G.green)}>✓ Pago</span>}
              {!allPaid&&pend>0&&<button style={{ ...css.btn(G.green), marginLeft:"auto", padding:"8px 14px", fontSize:13 }} onClick={()=>markAllPaid(cg.id)}>Marcar Pago</button>}
            </div>
            <div style={{ display:"flex", gap:16, flexWrap:"wrap", marginBottom:10 }}>
              {sum(cgS.filter(s=>s.shift_type==="Day12h"))>0&&<div><div style={{ fontSize:11, color:G.amber, fontWeight:600 }}>☀️ Diurno</div><div style={{ fontWeight:700 }}>{fmt(sum(cgS.filter(s=>s.shift_type==="Day12h")))}</div></div>}
              {sum(cgS.filter(s=>s.shift_type==="Night12h"))>0&&<div><div style={{ fontSize:11, color:G.purple, fontWeight:600 }}>🌙 Noturno</div><div style={{ fontWeight:700 }}>{fmt(sum(cgS.filter(s=>s.shift_type==="Night12h")))}</div></div>}
              {sum(cgS.filter(s=>s.shift_type==="Full24h"))>0&&<div><div style={{ fontSize:11, color:G.green, fontWeight:600 }}>🌗 24h</div><div style={{ fontWeight:700 }}>{fmt(sum(cgS.filter(s=>s.shift_type==="Full24h")))}</div></div>}
              {sum(cgE)>0&&<div><div style={{ fontSize:11, color:G.teal, fontWeight:600 }}>💊 Avulsos</div><div style={{ fontWeight:700, color:G.teal }}>{fmt(sum(cgE))}</div><div style={{ fontSize:11, color:G.muted }}>{cgE.length} item(ns)</div></div>}
              <div style={{ marginLeft:"auto" }}><div style={{ fontSize:11, color:G.muted, fontWeight:600 }}>TOTAL</div><div style={{ fontWeight:800, fontSize:20, color:G.accent }}>{fmt(total)}</div></div>
            </div>
            <div style={{ fontSize:12, color:G.muted }}>{cgS.length} plantão(ões) · {cgE.length} avulso(s) · {[...cgS,...cgE].filter(x=>x.payment_status==="Paid").length} pago(s)</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Bottom nav (mobile) ──────────────────────────────────────────────────────
const TABS = [
  ["dash","🏠","Início"],
  ["shifts","📋","Lançamentos"],
  ["cal","📅","Calendário"],
  ["weekly","📆","Semanal"],
  ["monthly","🗓️","Mensal"],
  ["cgs","👩‍⚕️","Cuidadoras"],
];

function BottomNav({ tab, setTab }) {
  return (
    <div style={{ position:"fixed", bottom:0, left:0, right:0, background:G.card, borderTop:`1px solid ${G.cardBorder}`, display:"flex", zIndex:100 }}>
      {TABS.map(([id,icon,label])=>(
        <button key={id} onClick={()=>setTab(id)} style={{ flex:1, padding:"8px 2px 10px", border:"none", background:"none", color:tab===id?G.accent:G.muted, display:"flex", flexDirection:"column", alignItems:"center", gap:2, cursor:"pointer", fontSize:10, fontWeight:tab===id?700:500 }}>
          <span style={{ fontSize:18, lineHeight:1 }}>{icon}</span>
          <span style={{ fontSize:9 }}>{label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const isMobile = useIsMobile();
  const [tab,setTab] = useState("dash");
  const [loggedUser,setLoggedUser] = useState(getUser);
  const isAuthenticated = Boolean(loggedUser && getToken());
  const { caregivers,setCaregivers,shifts,setShifts,extras,setExtras,loading,error } = useData(isAuthenticated);

  useEffect(() => {
    const syncAuth = () => setLoggedUser(getUser());
    window.addEventListener(AUTH_CHANGED_EVENT, syncAuth);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, syncAuth);
  }, []);

  const logout = () => { clearSession(); setLoggedUser(null); };

  if (!isAuthenticated) {
    return (
      <MobileCtx.Provider value={isMobile}>
        <LoginScreen onLogin={(u) => { setLoggedUser(u); }} />
      </MobileCtx.Provider>
    );
  }

  if (loading) return <div style={{ ...css.page, alignItems:"center", justifyContent:"center", color:G.muted }}>⏳ Carregando...</div>;

  const props = { caregivers,setCaregivers,shifts,setShifts,extras,setExtras };

  return (
    <MobileCtx.Provider value={isMobile}>
      <div style={css.page}>
        {/* Topbar */}
        <div style={css.topbar}>
          <span style={css.logo}>💊 ZQCuidadoras</span>
          {isMobile ? (
            <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:12, color:G.muted }}>👤 {loggedUser}</span>
              <button onClick={logout} style={{ ...css.btnSm(G.red) }}>Sair</button>
            </div>
          ) : (
            <nav style={{ display:"flex", gap:4, marginLeft:"auto", flexWrap:"wrap" }}>
              {TABS.map(([id,,label])=>(
                <button key={id} style={{ padding:"6px 14px", borderRadius:8, border:"none", background:tab===id?G.accent:"transparent", color:tab===id?"#fff":G.muted, fontWeight:500, fontSize:13, cursor:"pointer" }} onClick={()=>setTab(id)}>{label}</button>
              ))}
              <div style={{ display:"flex", alignItems:"center", gap:8, marginLeft:8, paddingLeft:8, borderLeft:`1px solid ${G.cardBorder}` }}>
                <span style={{ fontSize:12, color:G.muted }}>👤 {loggedUser}</span>
                <button onClick={logout} style={{ ...css.btnSm(G.red) }}>Sair</button>
              </div>
            </nav>
          )}
        </div>

        {/* Main content */}
        <main style={isMobile ? css.mainMobile : css.main}>
          {error&&<div style={{ background:G.red+"22", border:`1px solid ${G.red}44`, borderRadius:8, padding:"10px 14px", color:G.red, marginBottom:16, fontSize:13 }}>⚠️ {error}</div>}
          {tab==="dash"    &&<Dashboard    {...props} />}
          {tab==="shifts"  &&<Shifts       {...props} />}
          {tab==="cal"     &&<Calendar     {...props} />}
          {tab==="weekly"  &&<WeeklyClose  {...props} />}
          {tab==="monthly" &&<MonthlyClose {...props} />}
          {tab==="cgs"     &&<Caregivers   {...props} />}
        </main>

        {/* Bottom navigation (mobile only) */}
        {isMobile && <BottomNav tab={tab} setTab={setTab} />}
      </div>
    </MobileCtx.Provider>
  );
}
