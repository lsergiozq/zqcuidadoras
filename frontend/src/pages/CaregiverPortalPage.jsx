import { useEffect, useState } from "react";
import { api } from "../app/api";
import { G, css, currentTimeHHmm, fmt, fmtDate, getWeekRange, MEASUREMENT_PERIOD_OPTIONS, shiftColor, shiftIcon, shiftLabel, today, useMobile } from "../app/shared";
import { ErrorBanner, Field, StatCard } from "../components/ui";

const CAREGIVER_PORTAL_NAV = [
  { id: "dash", label: "Home", icon: "🏠", color: G.accent },
  { id: "shift", label: "Plantão", icon: "📋", color: G.accent },
  { id: "service", label: "Medição/Aplicação", icon: "🩺", color: G.teal },
  { id: "hour", label: "Hora Avulsa", icon: "🕒", color: G.purple },
  { id: "sep", label: "Separação", icon: "💊", color: G.green },
];

// ── Painel de separação semanal (cuidadora) ───────────────────────────────────

const SEP_FAIXA_LABEL = {
  jejum: "🌅 Jejum", manhã: "☀️ Manhã", almoço: "🍽 Almoço", tarde: "🌤 Tarde",
  jantar: "🍴 Jantar", noite: "🌙 Noite", ao_deitar: "🛏 Ao deitar", livre: "⏰ Horário livre",
};
const SEP_FAIXA_ORDER = ["jejum", "manhã", "almoço", "tarde", "jantar", "noite", "ao_deitar", "livre"];
const SEP_DIAS_LABEL = ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function sepGroupByFaixa(itens) {
  const map = {};
  for (const item of itens) {
    const k = item.faixa_horario || "livre";
    if (!map[k]) map[k] = [];
    map[k].push(item);
  }
  return SEP_FAIXA_ORDER.filter((f) => map[f]).map((f) => ({ faixa: f, itens: map[f] }));
}

function CaregiverItemRow({ item, onUpdate }) {
  const [saving, setSaving] = useState(false);
  const [editingObs, setEditingObs] = useState(false);
  const [obs, setObs] = useState(item.observacao_separacao || "");

  const patch = async (payload) => {
    setSaving(true);
    try {
      const updated = await api.patch(`/itens-separacao/${item.id}`, payload);
      onUpdate(updated);
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const statusNext = { pendente: "separado", separado: "conferido", conferido: "pendente" };
  const statusIcon = { pendente: "○", separado: "◑", conferido: "●" };
  const statusColor = { pendente: G.muted, separado: G.amber, conferido: G.green };

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px",
      borderBottom: `1px solid ${G.cardBorder}22`, flexWrap: "wrap",
      background: item.falta_compra ? G.red + "11" : "transparent",
    }}>
      <button
        disabled={saving}
        onClick={() => patch({ status: statusNext[item.status] })}
        style={{
          background: "none", border: `2px solid ${statusColor[item.status]}`,
          borderRadius: "50%", width: 30, height: 30, cursor: "pointer",
          color: statusColor[item.status], fontSize: 14, fontWeight: 700,
          flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {statusIcon[item.status]}
      </button>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{item.medicamento_nome}</div>
        <div style={{ fontSize: 12, color: G.muted, marginTop: 2 }}>
          {item.dose}
          {item.hora_exata && <span style={{ marginLeft: 8 }}>🕐 {item.hora_exata}</span>}
          <span style={{ marginLeft: 8 }}>
            {(Array.isArray(item.dias_semana) ? item.dias_semana : []).map((d) => SEP_DIAS_LABEL[d]).join(", ")}
          </span>
        </div>
        {item.observacao_prescricao && (
          <div style={{ fontSize: 11, color: G.muted, fontStyle: "italic", marginTop: 2 }}>{item.observacao_prescricao}</div>
        )}
        {editingObs ? (
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <input
              style={{ ...css.input, fontSize: 12, padding: "4px 8px", flex: 1 }}
              value={obs} onChange={(e) => setObs(e.target.value)}
              placeholder="Observação..." autoFocus
            />
            <button style={css.btnSm(G.green)} onClick={async () => { await patch({ observacao_separacao: obs }); setEditingObs(false); }} disabled={saving}>✓</button>
            <button style={css.btnSm(G.muted)} onClick={() => { setObs(item.observacao_separacao || ""); setEditingObs(false); }}>✕</button>
          </div>
        ) : item.observacao_separacao ? (
          <div style={{ fontSize: 11, color: G.amber, marginTop: 2, cursor: "pointer" }} onClick={() => setEditingObs(true)}>
            📝 {item.observacao_separacao}
          </div>
        ) : null}
        {item.falta_compra && (
          <div style={{ fontSize: 11, color: G.red, marginTop: 2 }}>
            ⚠️ Falta para compra{item.observacao_falta ? `: ${item.observacao_falta}` : ""}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {!editingObs && (
          <button style={{ ...css.btnSm(G.muted), fontSize: 11 }} onClick={() => setEditingObs(true)}>📝</button>
        )}
        <button
          style={{ ...css.btnSm(item.falta_compra ? G.red : G.cardBorder), fontSize: 11, border: `1px solid ${item.falta_compra ? G.red : G.cardBorder}` }}
          onClick={() => {
            if (item.falta_compra) { patch({ falta_compra: false, observacao_falta: null }); return; }
            const o = prompt("Observação sobre a falta (opcional):");
            if (o === null) return;
            patch({ falta_compra: true, observacao_falta: o || null });
          }}
          disabled={saving}
        >
          🛒
        </button>
      </div>
    </div>
  );
}

function CaregiverSeparacaoPanel() {
  const [separacoes, setSeparacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [semana, setSemana] = useState(() => getWeekRange(today())[0]);
  const [openSepId, setOpenSepId] = useState(null);

  const load = async (s) => {
    setLoading(true);
    try {
      const data = await api.get(`/caregiver/separacoes?semana_inicio=${s}`);
      setSeparacoes(data);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(semana); }, [semana]);

  const loadFull = async (id) => {
    try {
      const data = await api.get(`/separacoes-semanais/${id}`);
      setSeparacoes((prev) => prev.map((s) => (s.id === id ? data : s)));
    } catch (e) { setError(e.message); }
  };

  const toggleOpen = (id) => {
    if (openSepId === id) { setOpenSepId(null); return; }
    setOpenSepId(id);
    const sep = separacoes.find((s) => s.id === id);
    if (!sep?.itens) loadFull(id);
  };

  const handleItemUpdate = (updated) => {
    setSeparacoes((prev) => prev.map((s) => {
      if (!s.itens) return s;
      const idx = s.itens.findIndex((i) => i.id === updated.id);
      if (idx < 0) return s;
      const newItens = [...s.itens];
      newItens[idx] = updated;
      return { ...s, itens: newItens };
    }));
  };

  return (
    <div style={css.card}>
      <h2 style={css.h2}>💊 Separação Semanal</h2>
      <ErrorBanner msg={error} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <label style={css.label}>Semana</label>
        <input type="date" style={{ ...css.input, width: "auto" }} value={semana} onChange={(e) => setSemana(e.target.value)} />
        <button style={css.btnSm(G.accent)} onClick={() => load(semana)}>Buscar</button>
      </div>

      {loading && <div style={{ color: G.muted }}>⏳ Carregando...</div>}

      {!loading && separacoes.length === 0 && (
        <div style={{ color: G.muted, fontSize: 14 }}>Nenhuma separação disponível para esta semana.</div>
      )}

      {separacoes.map((sep) => {
        const isOpen = openSepId === sep.id;
        const totalItens = sep.itens?.length || 0;
        const conferidos = sep.itens?.filter((i) => i.status === "conferido").length || 0;
        return (
          <div key={sep.id} style={{ border: `1px solid ${G.cardBorder}`, borderRadius: 10, overflow: "hidden", marginBottom: 10 }}>
            <div
              style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", background: G.input, flexWrap: "wrap" }}
              onClick={() => toggleOpen(sep.id)}
            >
              <span style={{ fontWeight: 700 }}>👤 {sep.idoso?.name || sep.idoso_id}</span>
              <span style={{ fontSize: 12, color: G.muted }}>{fmtDate(sep.semana_inicio)} → {fmtDate(sep.semana_fim)}</span>
              {sep.itens && <span style={{ fontSize: 12, color: G.muted, marginLeft: "auto" }}>{conferidos}/{totalItens}</span>}
              <span style={{ color: G.muted }}>{isOpen ? "▲" : "▼"}</span>
            </div>
            {isOpen && sep.itens && (
              <div>
                {sepGroupByFaixa(sep.itens).map(({ faixa, itens }) => (
                  <div key={faixa}>
                    <div style={{ padding: "6px 14px", background: G.bg, fontSize: 11, fontWeight: 700, color: G.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      {SEP_FAIXA_LABEL[faixa] || faixa}
                    </div>
                    {itens.map((item) => (
                      <CaregiverItemRow key={item.id} item={item} onUpdate={handleItemUpdate} />
                    ))}
                  </div>
                ))}
              </div>
            )}
            {isOpen && !sep.itens && (
              <div style={{ padding: 16, color: G.muted }}>⏳ Carregando itens...</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CaregiverShiftForm({ onSaved }) {
  const [form, setForm] = useState({ shift_date: today(), shift_type: "Day12h", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await api.post("/caregiver/shifts", form);
      setForm({ shift_date: today(), shift_type: "Day12h", notes: "" });
      await onSaved();
    } catch (error) {
      setError(error.message || "Não foi possível lançar o plantão.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={css.card}>
      <h2 style={css.h2}>Plantão</h2>
      <ErrorBanner msg={error} />
      <Field label="Data"><input type="date" style={css.input} value={form.shift_date} onChange={(event) => setForm({ ...form, shift_date: event.target.value })} /></Field>
      <Field label="Tipo de Plantão">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.keys(shiftLabel).map((key) => <button key={key} onClick={() => setForm({ ...form, shift_type: key })} style={{ ...css.btnGhost, background: form.shift_type === key ? shiftColor[key] + "22" : "transparent", color: form.shift_type === key ? shiftColor[key] : G.muted, borderColor: form.shift_type === key ? shiftColor[key] : G.cardBorder }}>{shiftIcon[key]} {shiftLabel[key]}</button>)}
        </div>
      </Field>
      <Field label="Observação"><input style={css.input} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Opcional" /></Field>
      <button style={css.btn()} onClick={submit} disabled={saving}>{saving ? "Salvando..." : "Salvar Plantão"}</button>
    </div>
  );
}

function CaregiverServiceForm({ elders, serviceTypes, onSaved }) {
  const [form, setForm] = useState({ charge_date: today(), service_type_id: "", elder_id: "", measurement_period: "", custom_period: "", glucose_value: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const serviceType = serviceTypes.find((item) => item.id === form.service_type_id);

  const submit = async () => {
    if (!form.service_type_id) return setError("Selecione o tipo de serviço.");
    const measurementPeriod = form.measurement_period === "__custom__" ? form.custom_period : form.measurement_period;
    setSaving(true);
    setError("");
    try {
      await api.post("/caregiver/service-entries", {
        charge_date: form.charge_date,
        service_type_id: form.service_type_id,
        elder_id: form.elder_id || null,
        measurement_period: measurementPeriod || null,
        glucose_value: form.glucose_value ? Number(form.glucose_value) : null,
        description: form.description || null,
      });
      setForm({ charge_date: today(), service_type_id: "", elder_id: "", measurement_period: "", custom_period: "", glucose_value: "", description: "" });
      await onSaved();
    } catch (error) {
      setError(error.message || "Não foi possível lançar o serviço.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={css.card}>
      <h2 style={css.h2}>Medição/Aplicação</h2>
      <ErrorBanner msg={error} />
      <Field label="Data"><input type="date" style={css.input} value={form.charge_date} onChange={(event) => setForm({ ...form, charge_date: event.target.value })} /></Field>
      <Field label="Tipo de Serviço"><select style={css.select} value={form.service_type_id} onChange={(event) => setForm({ ...form, service_type_id: event.target.value })}><option value="">Selecione...</option>{serviceTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      {serviceType?.requires_elder && <Field label="Idoso"><select style={css.select} value={form.elder_id} onChange={(event) => setForm({ ...form, elder_id: event.target.value })}><option value="">Selecione...</option>{elders.map((elder) => <option key={elder.id} value={elder.id}>{elder.name}</option>)}</select></Field>}
      {serviceType?.requires_period && <Field label="Período da Medição"><select style={css.select} value={form.measurement_period} onChange={(event) => setForm({ ...form, measurement_period: event.target.value, custom_period: event.target.value === "__custom__" ? form.custom_period : "" })}><option value="">Selecione...</option>{MEASUREMENT_PERIOD_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}<option value="__custom__">Outro...</option></select></Field>}
      {serviceType?.requires_period && form.measurement_period === "__custom__" && <Field label="Outro Período"><input style={css.input} value={form.custom_period} onChange={(event) => setForm({ ...form, custom_period: event.target.value })} placeholder="Digite o período" /></Field>}
      {serviceType?.requires_glucose && <Field label="Glicose"><input type="number" style={css.input} value={form.glucose_value} onChange={(event) => setForm({ ...form, glucose_value: event.target.value })} placeholder="Ex: 112" /></Field>}
      <Field label="Observação"><input style={css.input} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Opcional" /></Field>
      <button style={css.btn(G.teal)} onClick={submit} disabled={saving}>{saving ? "Salvando..." : "Salvar Serviço"}</button>
    </div>
  );
}

function CaregiverExtraHourCard({ openExtraHour, onSaved }) {
  const [startForm, setStartForm] = useState({ charge_date: today(), start_time: currentTimeHHmm(), description: "" });
  const [endTime, setEndTime] = useState(currentTimeHHmm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setEndTime(currentTimeHHmm());
  }, [openExtraHour?.id]);

  const start = async () => {
    setSaving(true);
    setError("");
    try {
      await api.post("/caregiver/extra-hours/start", startForm);
      setStartForm({ charge_date: today(), start_time: currentTimeHHmm(), description: "" });
      await onSaved();
    } catch (error) {
      setError(error.message || "Não foi possível iniciar a hora avulsa.");
    } finally {
      setSaving(false);
    }
  };

  const stop = async () => {
    setSaving(true);
    setError("");
    try {
      await api.post("/caregiver/extra-hours/stop", { end_time: endTime });
      await onSaved();
    } catch (error) {
      setError(error.message || "Não foi possível finalizar a hora avulsa.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={css.card}>
      <h2 style={css.h2}>Hora Avulsa</h2>
      <ErrorBanner msg={error} />
      {openExtraHour ? (
        <div>
          <div style={{ marginBottom: 16, color: G.muted, fontSize: 13 }}>Em andamento desde {fmtDate(openExtraHour.charge_date)} às {openExtraHour.start_time}</div>
          <Field label="Hora Final"><input type="time" style={css.input} value={endTime} onChange={(event) => setEndTime(event.target.value)} /></Field>
          <button style={css.btn(G.green)} onClick={stop} disabled={saving}>{saving ? "Finalizando..." : "Finalizar Hora Avulsa"}</button>
        </div>
      ) : (
        <div>
          <Field label="Data"><input type="date" style={css.input} value={startForm.charge_date} onChange={(event) => setStartForm({ ...startForm, charge_date: event.target.value })} /></Field>
          <Field label="Hora Inicial"><input type="time" style={css.input} value={startForm.start_time} onChange={(event) => setStartForm({ ...startForm, start_time: event.target.value })} /></Field>
          <Field label="Observação"><input style={css.input} value={startForm.description} onChange={(event) => setStartForm({ ...startForm, description: event.target.value })} placeholder="Opcional" /></Field>
          <button style={css.btn(G.purple)} onClick={start} disabled={saving}>{saving ? "Iniciando..." : "Iniciar Hora Avulsa"}</button>
        </div>
      )}
    </div>
  );
}

export default function CaregiverPortalPage({ session, dashboard, elders, serviceTypes, loading, error, reload, onLogout }) {
  const isMobile = useMobile();
  const [panel, setPanel] = useState("dash");
  const displayName = session?.display_name || session?.username || "";
  const pendingItems = [
    ...(dashboard?.pending_shifts || []).map((item) => ({ ...item, item_type: "shift", item_date: item.shift_date })),
    ...(dashboard?.pending_extras || []).map((item) => ({ ...item, item_type: item.entry_type || "custom", item_date: item.charge_date })),
  ].sort((a, b) => (b.item_date || "").localeCompare(a.item_date || ""));
  const mainStyle = isMobile ? { ...css.mainMobile, paddingBottom: 98 } : { ...css.main, paddingBottom: 110 };

  if (loading) return <div style={{ ...css.page, alignItems: "center", justifyContent: "center", color: G.muted }}>⏳ Carregando...</div>;

  return (
    <div style={css.page}>
      <div style={css.topbar}>
        <span style={css.logo}>💊 ZQCuidadoras</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: G.muted }}>👤 {displayName}</span>
          <button onClick={onLogout} style={{ ...css.btnSm(G.red) }}>Sair</button>
        </div>
      </div>
      <main style={mainStyle}>
        {error && <ErrorBanner msg={error} />}
        {panel === "dash" && (
          <div>
            <h1 style={css.h1}>Dashboard da Cuidadora</h1>
            <div style={{ ...css.grid(isMobile ? 1 : 2), marginBottom: 16 }}>
              <StatCard label="Pendente de Pagamento" value={fmt(dashboard?.pending_total || 0)} color={G.amber} icon="⏳" />
              <StatCard label="Hora Avulsa em Andamento" value={dashboard?.open_extra_hour ? `${dashboard.open_extra_hour.start_time}` : "Nenhuma"} color={dashboard?.open_extra_hour ? G.purple : G.green} icon="🕒" />
            </div>
            <div style={css.card}>
              <h2 style={css.h2}>Itens Pendentes</h2>
              {pendingItems.length === 0 && <div style={{ color: G.muted, fontSize: 14 }}>Nada pendente no momento.</div>}
              {pendingItems.map((item) => (
                <div key={`${item.item_type}-${item.id}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: `1px solid ${G.cardBorder}22` }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{item.item_type === "shift" ? `${shiftIcon[item.shift_type]} ${shiftLabel[item.shift_type]}` : item.description}</div>
                    <div style={{ fontSize: 12, color: G.muted }}>{fmtDate(item.item_date)}</div>
                  </div>
                  <div style={{ fontWeight: 700, color: item.item_type === "shift" ? G.text : G.teal }}>{fmt(item.value)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {panel === "shift" && <CaregiverShiftForm onSaved={reload} />}
        {panel === "service" && <CaregiverServiceForm elders={elders} serviceTypes={serviceTypes} onSaved={reload} />}
        {panel === "hour" && <CaregiverExtraHourCard openExtraHour={dashboard?.open_extra_hour} onSaved={reload} />}
        {panel === "sep" && <CaregiverSeparacaoPanel />}
      </main>
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: G.card, borderTop: `1px solid ${G.cardBorder}`, padding: isMobile ? "6px 8px calc(6px + env(safe-area-inset-bottom))" : "8px 16px", zIndex: 90 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8, width: "100%", maxWidth: isMobile ? "100%" : 900, margin: "0 auto" }}>
          {CAREGIVER_PORTAL_NAV.map((item) => {
            const active = panel === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setPanel(item.id)}
                style={{
                  border: active ? `1px solid ${item.color}` : `1px solid ${G.cardBorder}`,
                  borderRadius: 12,
                  padding: isMobile ? "10px 6px" : "12px 8px",
                  background: active ? item.color : G.input,
                  color: active ? "#fff" : G.text,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  minHeight: isMobile ? 60 : 66,
                  cursor: "pointer",
                  boxShadow: active ? `0 0 0 2px ${item.color}33, 0 12px 24px ${item.color}22` : "none",
                  transition: "background 120ms ease, box-shadow 120ms ease, border-color 120ms ease",
                }}
              >
                <span style={{ fontSize: isMobile ? 17 : 20, lineHeight: 1 }}>{item.icon}</span>
                <span style={{ fontSize: isMobile ? 9 : 12, fontWeight: 700, lineHeight: 1.15, textAlign: "center", letterSpacing: isMobile ? "0" : "0.1px" }}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
