import { useEffect, useState } from "react";
import { api } from "../app/api";
import { G, css, currentTimeHHmm, fmt, fmtDate, MEASUREMENT_PERIOD_OPTIONS, shiftColor, shiftIcon, shiftLabel, today, useMobile } from "../app/shared";
import { ErrorBanner, Field, StatCard } from "../components/ui";

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
      <h2 style={css.h2}>1. Lançar Plantão</h2>
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
      <h2 style={css.h2}>2. Lançar Serviços Avulsos</h2>
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
      <h2 style={css.h2}>3. Lançar Hora Avulsa</h2>
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
      <main style={isMobile ? css.mainMobile : css.main}>
        {error && <ErrorBanner msg={error} />}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <button style={{ ...css.btn(panel === "dash" ? G.accent : G.inputBorder), padding: "8px 14px" }} onClick={() => setPanel("dash")}>Dashboard</button>
          <button style={{ ...css.btn(panel === "shift" ? G.accent : G.inputBorder), padding: "8px 14px" }} onClick={() => setPanel("shift")}>1. Plantão</button>
          <button style={{ ...css.btn(panel === "service" ? G.teal : G.inputBorder), padding: "8px 14px" }} onClick={() => setPanel("service")}>2. Serviço Avulso</button>
          <button style={{ ...css.btn(panel === "hour" ? G.purple : G.inputBorder), padding: "8px 14px" }} onClick={() => setPanel("hour")}>3. Hora Avulsa</button>
        </div>

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
      </main>
    </div>
  );
}
