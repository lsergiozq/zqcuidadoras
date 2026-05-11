import { useState } from "react";
import { api } from "../app/api";
import { G, css, fmt, fmtDate, MEASUREMENT_PERIOD_OPTIONS, shiftColor, shiftIcon, shiftLabel, today, useMobile } from "../app/shared";
import { ErrorBanner, Field, Modal } from "../components/ui";

function ExtraChargeModal({ caregivers, elders, serviceTypes, onClose, onSaved, initial }) {
  const isMobile = useMobile();
  const blank = {
    caregiver_id: "",
    charge_date: today(),
    entry_type: "custom",
    description: "",
    value: "",
    service_type_id: "",
    elder_id: "",
    measurement_period: "",
    custom_period: "",
    glucose_value: "",
    start_time: "",
    end_time: "",
    duration_hours: "",
    duration_minutes: "",
    payment_status: "Pending",
  };
  const initialForm = initial ? {
    ...blank,
    ...initial,
    value: initial.value ?? "",
    glucose_value: initial.glucose_value ?? "",
    duration_hours: initial.duration_minutes ? String(Math.floor(initial.duration_minutes / 60)) : "",
    duration_minutes: initial.duration_minutes ? String(initial.duration_minutes % 60) : "",
    custom_period: initial.measurement_period && !MEASUREMENT_PERIOD_OPTIONS.includes(initial.measurement_period) ? initial.measurement_period : "",
    measurement_period: initial.measurement_period && !MEASUREMENT_PERIOD_OPTIONS.includes(initial.measurement_period) ? "__custom__" : (initial.measurement_period || ""),
  } : blank;
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedServiceType = serviceTypes.find((serviceType) => serviceType.id === form.service_type_id);

  const save = async () => {
    if (!form.caregiver_id) return setError("Selecione a cuidadora");
    if (form.entry_type === "custom" && !form.description.trim()) return setError("Informe a descrição");
    if (form.entry_type === "custom" && !form.value) return setError("Informe o valor");
    if (form.entry_type === "service" && !form.service_type_id) return setError("Selecione o tipo de serviço");
    setSaving(true);
    try {
      const measurementPeriod = form.measurement_period === "__custom__" ? form.custom_period : form.measurement_period;
      const durationFromParts = (Number(form.duration_hours || 0) * 60) + Number(form.duration_minutes || 0);
      const body = {
        caregiver_id: form.caregiver_id,
        charge_date: form.charge_date,
        entry_type: form.entry_type,
        description: form.description || null,
        value: form.entry_type === "custom" ? Number(form.value) : undefined,
        service_type_id: form.entry_type === "service" ? form.service_type_id : null,
        elder_id: form.entry_type === "service" ? (form.elder_id || null) : null,
        measurement_period: form.entry_type === "service" ? (measurementPeriod || null) : null,
        glucose_value: form.entry_type === "service" && form.glucose_value !== "" ? Number(form.glucose_value) : null,
        start_time: form.entry_type === "extra_hour" ? (form.start_time || null) : null,
        end_time: form.entry_type === "extra_hour" ? (form.end_time || null) : null,
        duration_minutes: form.entry_type === "extra_hour" && !form.start_time && !form.end_time && durationFromParts > 0 ? durationFromParts : null,
        payment_status: form.payment_status,
      };
      const result = initial?.id ? await api.put(`/extra-charges/${initial.id}`, body) : await api.post("/extra-charges", body);
      onSaved(result);
    } catch (error) {
      setError(error.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={initial?.id ? "Editar Avulso" : "Nova Cobrança Avulsa"} onClose={onClose}>
      <ErrorBanner msg={error} />
      <div style={{ background: G.teal + "11", border: `1px solid ${G.teal}33`, borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: G.teal }}>💊 Agora o lançamento avulso pode ser customizado, por tipo de serviço ou por hora avulsa.</div>
      <div style={css.grid(isMobile ? 1 : 2)}>
        <Field label="Data"><input type="date" style={css.input} value={form.charge_date} onChange={(event) => setForm({ ...form, charge_date: event.target.value })} /></Field>
        <Field label="Cuidadora *"><select style={css.select} value={form.caregiver_id} onChange={(event) => setForm({ ...form, caregiver_id: event.target.value })}><option value="">Selecione...</option>{caregivers.filter((caregiver) => caregiver.active).map((caregiver) => <option key={caregiver.id} value={caregiver.id}>{caregiver.name}</option>)}</select></Field>
      </div>
      <Field label="Modalidade">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[ ["custom", "Customizado", G.teal], ["service", "Tipo de serviço", G.accent], ["extra_hour", "Hora avulsa", G.purple] ].map(([value, label, color]) => <button key={value} onClick={() => setForm({ ...form, entry_type: value })} style={{ ...css.btnGhost, background: form.entry_type === value ? color + "22" : "transparent", color: form.entry_type === value ? color : G.muted, borderColor: form.entry_type === value ? color : G.cardBorder }}>{label}</button>)}
        </div>
      </Field>
      {form.entry_type === "custom" && <><Field label="Descrição *"><input style={css.input} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Ex: Aplicação extra, Curativo, Transporte..." /></Field><Field label="Valor (R$) *"><input type="number" style={css.input} value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} /></Field></>}
      {form.entry_type === "service" && <><Field label="Tipo de Serviço"><select style={css.select} value={form.service_type_id} onChange={(event) => setForm({ ...form, service_type_id: event.target.value })}><option value="">Selecione...</option>{serviceTypes.map((serviceType) => <option key={serviceType.id} value={serviceType.id}>{serviceType.name}</option>)}</select></Field>{selectedServiceType?.requires_elder && <Field label="Idoso"><select style={css.select} value={form.elder_id} onChange={(event) => setForm({ ...form, elder_id: event.target.value })}><option value="">Selecione...</option>{elders.filter((elder) => elder.active).map((elder) => <option key={elder.id} value={elder.id}>{elder.name}</option>)}</select></Field>}{selectedServiceType?.requires_period && <Field label="Período da Medição"><select style={css.select} value={form.measurement_period} onChange={(event) => setForm({ ...form, measurement_period: event.target.value, custom_period: event.target.value === "__custom__" ? form.custom_period : "" })}><option value="">Selecione...</option>{MEASUREMENT_PERIOD_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}<option value="__custom__">Outro...</option></select></Field>}{selectedServiceType?.requires_period && form.measurement_period === "__custom__" && <Field label="Outro Período"><input style={css.input} value={form.custom_period} onChange={(event) => setForm({ ...form, custom_period: event.target.value })} /></Field>}{selectedServiceType?.requires_glucose && <Field label="Glicose"><input type="number" style={css.input} value={form.glucose_value} onChange={(event) => setForm({ ...form, glucose_value: event.target.value })} /></Field>}<Field label="Observação"><input style={css.input} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Opcional" /></Field></>}
      {form.entry_type === "extra_hour" && <><div style={css.grid(isMobile ? 1 : 2)}><Field label="Hora Inicial"><input type="time" style={css.input} value={form.start_time} onChange={(event) => setForm({ ...form, start_time: event.target.value })} /></Field><Field label="Hora Final"><input type="time" style={css.input} value={form.end_time} onChange={(event) => setForm({ ...form, end_time: event.target.value })} /></Field></div><div style={{ marginBottom: 12, color: G.muted, fontSize: 12 }}>Ou informe apenas a duração, em vez do horário inicial/final.</div><div style={css.grid(isMobile ? 1 : 2)}><Field label="Horas"><input type="number" style={css.input} value={form.duration_hours} onChange={(event) => setForm({ ...form, duration_hours: event.target.value })} /></Field><Field label="Minutos"><input type="number" style={css.input} value={form.duration_minutes} onChange={(event) => setForm({ ...form, duration_minutes: event.target.value })} /></Field></div><Field label="Descrição"><input style={css.input} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Opcional" /></Field></>}
      <Field label="Status"><select style={css.select} value={form.payment_status} onChange={(event) => setForm({ ...form, payment_status: event.target.value })}><option value="Pending">Pendente</option><option value="Paid">Pago</option></select></Field>
      <div style={{ display: "flex", gap: 10 }}><button style={css.btn(G.teal)} onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar Avulso"}</button><button style={css.btnGhost} onClick={onClose}>Cancelar</button></div>
    </Modal>
  );
}

export default function ShiftsPage({ caregivers, shifts, setShifts, extras, setExtras, elders, serviceTypes }) {
  const isMobile = useMobile();
  const [activeTab, setActiveTab] = useState("shifts");
  const [filter, setFilter] = useState({ month: today().slice(0, 7), caregiverId: "" });
  const blankShift = { caregiver_id: "", shift_date: today(), shift_type: "Day12h", value: "", notes: "", payment_status: "Pending" };
  const [formShift, setFormShift] = useState(blankShift);
  const [editingShift, setEditingShift] = useState(null);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editingExtra, setEditingExtra] = useState(null);
  const [showExtraModal, setShowExtraModal] = useState(false);

  const getValue = (caregiverId, shiftType) => {
    const caregiver = caregivers.find((item) => item.id === caregiverId);
    if (!caregiver) return "";
    return shiftType === "Day12h" ? caregiver.day_shift_value : shiftType === "Night12h" ? caregiver.night_shift_value : caregiver.full_day_shift_value;
  };

  const openShift = (shift = null) => {
    setEditingShift(shift?.id || null);
    setFormShift(shift ? { ...shift } : blankShift);
    setShowShiftModal(true);
  };

  const closeShift = () => {
    setShowShiftModal(false);
    setEditingShift(null);
    setFormShift(blankShift);
  };

  const saveShift = async () => {
    if (!formShift.caregiver_id) return alert("Selecione uma cuidadora");
    if (!formShift.value) return alert("Informe o valor");
    const body = { ...formShift, value: Number(formShift.value) };
    if (editingShift) {
      const updated = await api.put(`/shifts/${editingShift}`, body);
      setShifts(shifts.map((shift) => shift.id === editingShift ? updated : shift));
    } else {
      const created = await api.post("/shifts", body);
      setShifts([...shifts, created]);
    }
    closeShift();
  };

  const deleteShift = async (id) => {
    if (!confirm("Remover?")) return;
    await api.delete(`/shifts/${id}`);
    setShifts(shifts.filter((shift) => shift.id !== id));
  };

  const toggleShiftPay = async (shift) => {
    const paymentStatus = shift.payment_status === "Paid" ? "Pending" : "Paid";
    const updated = await api.patch(`/shifts/${shift.id}/payment`, { payment_status: paymentStatus, payment_date: paymentStatus === "Paid" ? today() : null });
    setShifts(shifts.map((item) => item.id === shift.id ? updated : item));
  };

  const deleteExtra = async (id) => {
    if (!confirm("Remover?")) return;
    await api.delete(`/extra-charges/${id}`);
    setExtras(extras.filter((extra) => extra.id !== id));
  };

  const toggleExtraPay = async (extra) => {
    const paymentStatus = extra.payment_status === "Paid" ? "Pending" : "Paid";
    const updated = await api.patch(`/extra-charges/${extra.id}/payment`, { payment_status: paymentStatus, payment_date: paymentStatus === "Paid" ? today() : null });
    setExtras(extras.map((item) => item.id === extra.id ? updated : item));
  };

  const filteredShifts = shifts.filter((shift) => shift.shift_date.startsWith(filter.month) && (!filter.caregiverId || shift.caregiver_id === filter.caregiverId)).sort((a, b) => b.shift_date.localeCompare(a.shift_date));
  const filteredExtras = extras.filter((extra) => extra.charge_date.startsWith(filter.month) && (!filter.caregiverId || extra.caregiver_id === filter.caregiverId)).sort((a, b) => b.charge_date.localeCompare(a.charge_date));
  const sum = (items) => items.reduce((total, item) => total + Number(item.value), 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
        <h1 style={{ ...css.h1, margin: 0 }}>📋 Lançamentos</h1>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button style={{ ...css.btn(), fontSize: isMobile ? 13 : 14, padding: isMobile ? "8px 12px" : "10px 20px" }} onClick={() => openShift()}>+ Plantão</button>
          <button style={{ ...css.btn(G.teal), fontSize: isMobile ? 13 : 14, padding: isMobile ? "8px 12px" : "10px 20px" }} onClick={() => { setEditingExtra(null); setShowExtraModal(true); }}>+ Avulso 💊</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input type="month" style={{ ...css.input, width: isMobile ? "100%" : 160 }} value={filter.month} onChange={(event) => setFilter({ ...filter, month: event.target.value })} />
        <select style={{ ...css.select, width: isMobile ? "100%" : 200 }} value={filter.caregiverId} onChange={(event) => setFilter({ ...filter, caregiverId: event.target.value })}><option value="">Todas as cuidadoras</option>{caregivers.map((caregiver) => <option key={caregiver.id} value={caregiver.id}>{caregiver.name}</option>)}</select>
      </div>

      <div style={{ display: "flex", gap: 0, marginBottom: 12, background: G.card, borderRadius: 10, border: `1px solid ${G.cardBorder}`, overflow: "hidden", width: "100%" }}>
        {[["shifts", `🌿 Plantões (${filteredShifts.length})`], ["extras", `💊 Avulsos (${filteredExtras.length})`]].map(([id, label]) => <button key={id} onClick={() => setActiveTab(id)} style={{ flex: 1, padding: "9px 12px", border: "none", background: activeTab === id ? G.accent : "transparent", color: activeTab === id ? "#fff" : G.muted, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{label}</button>)}
      </div>

      <div style={{ ...css.card, marginBottom: 12, padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: isMobile ? 12 : 24, flexWrap: "wrap" }}>
          <span style={{ color: G.muted, fontSize: 13 }}>Plantões: <strong style={{ color: G.text }}>{fmt(sum(filteredShifts))}</strong></span>
          <span style={{ color: G.muted, fontSize: 13 }}>Avulsos: <strong style={{ color: G.teal }}>{fmt(sum(filteredExtras))}</strong></span>
          <span style={{ color: G.muted, fontSize: 13 }}>Total: <strong style={{ color: G.green }}>{fmt(sum(filteredShifts) + sum(filteredExtras))}</strong></span>
          <span style={{ color: G.muted, fontSize: 13 }}>Pend.: <strong style={{ color: G.amber }}>{fmt(sum([...filteredShifts, ...filteredExtras].filter((item) => item.payment_status === "Pending")))}</strong></span>
        </div>
      </div>

      {activeTab === "shifts" && (isMobile ? <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{filteredShifts.length === 0 && <div style={{ ...css.card, color: G.muted, textAlign: "center", padding: 32 }}>Nenhum plantão</div>}{filteredShifts.map((shift) => { const caregiver = caregivers.find((item) => item.id === shift.caregiver_id); return <div key={shift.id} style={{ ...css.cardMobile, opacity: shift.payment_status === "Paid" ? 0.6 : 1 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}><div><div style={{ fontWeight: 700, fontSize: 15 }}>{caregiver?.name || "—"}</div><div style={{ fontSize: 12, color: G.muted, marginTop: 2 }}>{fmtDate(shift.shift_date)}{shift.created_by ? ` · 👤 ${shift.created_by}` : ""}{shift.updated_by && shift.updated_by !== shift.created_by ? ` · ✏️ ${shift.updated_by}` : ""}</div></div><span style={{ fontWeight: 800, fontSize: 16, color: G.text }}>{fmt(shift.value)}</span></div><div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}><span style={css.badge(shiftColor[shift.shift_type])}>{shiftIcon[shift.shift_type]} {shiftLabel[shift.shift_type]}</span><span style={css.badge(shift.payment_status === "Paid" ? G.green : G.amber)}>{shift.payment_status === "Paid" ? "✓ Pago" : "Pendente"}</span>{shift.notes && <span style={{ fontSize: 12, color: G.muted }}>{shift.notes}</span>}</div><div style={{ display: "flex", gap: 8 }}><button style={{ ...css.btnSm(shift.payment_status === "Paid" ? G.muted : G.green), flex: 1 }} onClick={() => toggleShiftPay(shift)}>{shift.payment_status === "Paid" ? "Desfazer" : "✓ Pagar"}</button><button style={{ ...css.btnSm(G.accent) }} onClick={() => openShift(shift)}>✏️</button><button style={{ ...css.btnSm(G.red) }} onClick={() => deleteShift(shift.id)}>🗑️</button></div></div>; })}</div> : <div style={css.card}><table style={css.table}><thead><tr>{["Data", "Cuidadora", "Tipo", "Valor", "Status", "Obs", "Ações"].map((label) => <th key={label} style={css.th}>{label}</th>)}</tr></thead><tbody>{filteredShifts.length === 0 && <tr><td colSpan={7} style={{ ...css.td, color: G.muted, textAlign: "center", padding: 40 }}>Nenhum plantão</td></tr>}{filteredShifts.map((shift) => { const caregiver = caregivers.find((item) => item.id === shift.caregiver_id); return <tr key={shift.id} style={{ opacity: shift.payment_status === "Paid" ? 0.6 : 1 }}><td style={css.td}>{fmtDate(shift.shift_date)}{shift.created_by && <div style={{ fontSize: 11, color: G.muted, marginTop: 2 }}>👤 {shift.created_by}{shift.updated_by && shift.updated_by !== shift.created_by ? <span> · ✏️ {shift.updated_by}</span> : null}</div>}</td><td style={css.td}>{caregiver?.name || "—"}</td><td style={css.td}><span style={css.badge(shiftColor[shift.shift_type])}>{shiftIcon[shift.shift_type]} {shiftLabel[shift.shift_type]}</span></td><td style={{ ...css.td, fontWeight: 700 }}>{fmt(shift.value)}</td><td style={css.td}><span style={css.badge(shift.payment_status === "Paid" ? G.green : G.amber)}>{shift.payment_status === "Paid" ? "✓ Pago" : "Pendente"}</span></td><td style={{ ...css.td, fontSize: 12, color: G.muted }}>{shift.notes || "—"}</td><td style={css.td}><button style={{ ...css.btnSm(shift.payment_status === "Paid" ? G.muted : G.green), marginRight: 4 }} onClick={() => toggleShiftPay(shift)}>{shift.payment_status === "Paid" ? "Desfazer" : "Pagar"}</button><button style={{ ...css.btnSm(G.accent), marginRight: 4 }} onClick={() => openShift(shift)}>✏️</button><button style={css.btnSm(G.red)} onClick={() => deleteShift(shift.id)}>🗑️</button></td></tr>; })}</tbody></table></div>)}

      {activeTab === "extras" && (isMobile ? <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{filteredExtras.length === 0 && <div style={{ ...css.card, color: G.muted, textAlign: "center", padding: 32 }}>Nenhum avulso</div>}{filteredExtras.map((extra) => { const caregiver = caregivers.find((item) => item.id === extra.caregiver_id); return <div key={extra.id} style={{ ...css.cardMobile, opacity: extra.payment_status === "Paid" ? 0.6 : 1 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}><div><div style={{ fontWeight: 700, fontSize: 15 }}>{caregiver?.name || "—"}</div><div style={{ fontSize: 12, color: G.muted, marginTop: 2 }}>{fmtDate(extra.charge_date)}{extra.created_by ? ` · 👤 ${extra.created_by}` : ""}{extra.updated_by && extra.updated_by !== extra.created_by ? ` · ✏️ ${extra.updated_by}` : ""}</div></div><span style={{ fontWeight: 800, fontSize: 16, color: G.teal }}>{fmt(extra.value)}</span></div><div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}><span style={css.badge(G.teal)}>💊 {extra.description}</span><span style={css.badge(extra.payment_status === "Paid" ? G.green : G.amber)}>{extra.payment_status === "Paid" ? "✓ Pago" : "Pendente"}</span></div><div style={{ display: "flex", gap: 8 }}><button style={{ ...css.btnSm(extra.payment_status === "Paid" ? G.muted : G.green), flex: 1 }} onClick={() => toggleExtraPay(extra)}>{extra.payment_status === "Paid" ? "Desfazer" : "✓ Pagar"}</button><button style={{ ...css.btnSm(G.accent) }} onClick={() => { setEditingExtra(extra); setShowExtraModal(true); }}>✏️</button><button style={{ ...css.btnSm(G.red) }} onClick={() => deleteExtra(extra.id)}>🗑️</button></div></div>; })}</div> : <div style={css.card}><table style={css.table}><thead><tr>{["Data", "Cuidadora", "Descrição", "Valor", "Status", "Ações"].map((label) => <th key={label} style={css.th}>{label}</th>)}</tr></thead><tbody>{filteredExtras.length === 0 && <tr><td colSpan={6} style={{ ...css.td, color: G.muted, textAlign: "center", padding: 40 }}>Nenhum avulso</td></tr>}{filteredExtras.map((extra) => { const caregiver = caregivers.find((item) => item.id === extra.caregiver_id); return <tr key={extra.id} style={{ opacity: extra.payment_status === "Paid" ? 0.6 : 1 }}><td style={css.td}>{fmtDate(extra.charge_date)}{extra.created_by && <div style={{ fontSize: 11, color: G.muted, marginTop: 2 }}>👤 {extra.created_by}{extra.updated_by && extra.updated_by !== extra.created_by ? <span> · ✏️ {extra.updated_by}</span> : null}</div>}</td><td style={css.td}>{caregiver?.name || "—"}</td><td style={css.td}><span style={css.badge(G.teal)}>💊 {extra.description}</span></td><td style={{ ...css.td, fontWeight: 700 }}>{fmt(extra.value)}</td><td style={css.td}><span style={css.badge(extra.payment_status === "Paid" ? G.green : G.amber)}>{extra.payment_status === "Paid" ? "✓ Pago" : "Pendente"}</span></td><td style={css.td}><button style={{ ...css.btnSm(extra.payment_status === "Paid" ? G.muted : G.green), marginRight: 4 }} onClick={() => toggleExtraPay(extra)}>{extra.payment_status === "Paid" ? "Desfazer" : "Pagar"}</button><button style={{ ...css.btnSm(G.accent), marginRight: 4 }} onClick={() => { setEditingExtra(extra); setShowExtraModal(true); }}>✏️</button><button style={css.btnSm(G.red)} onClick={() => deleteExtra(extra.id)}>🗑️</button></td></tr>; })}</tbody></table></div>)}

      {showShiftModal && <Modal title={editingShift ? "Editar Plantão" : "Novo Plantão"} onClose={closeShift}><div style={css.grid(isMobile ? 1 : 2)}><Field label="Data"><input type="date" style={css.input} value={formShift.shift_date} onChange={(event) => setFormShift({ ...formShift, shift_date: event.target.value })} /></Field><Field label="Cuidadora"><select style={css.select} value={formShift.caregiver_id} onChange={(event) => { const value = getValue(event.target.value, formShift.shift_type); setFormShift({ ...formShift, caregiver_id: event.target.value, value }); }}><option value="">Selecione...</option>{caregivers.filter((caregiver) => caregiver.active).map((caregiver) => <option key={caregiver.id} value={caregiver.id}>{caregiver.name}</option>)}</select></Field></div><Field label="Tipo de Plantão"><div style={{ display: "flex", gap: 8 }}>{[["Day12h", "☀️ Diurno"], ["Night12h", "🌙 Noturno"], ["Full24h", "🌗 24h"]].map(([value, label]) => <button key={value} onClick={() => { const nextValue = getValue(formShift.caregiver_id, value); setFormShift({ ...formShift, shift_type: value, value: nextValue }); }} style={{ flex: 1, padding: "10px 6px", borderRadius: 8, border: `2px solid ${formShift.shift_type === value ? shiftColor[value] : G.inputBorder}`, background: formShift.shift_type === value ? shiftColor[value] + "22" : G.input, color: formShift.shift_type === value ? shiftColor[value] : G.muted, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{label}</button>)}</div></Field><div style={css.grid(isMobile ? 1 : 2)}><Field label="Valor (R$)"><input type="number" style={css.input} value={formShift.value} onChange={(event) => setFormShift({ ...formShift, value: event.target.value })} /></Field><Field label="Status"><select style={css.select} value={formShift.payment_status} onChange={(event) => setFormShift({ ...formShift, payment_status: event.target.value })}><option value="Pending">Pendente</option><option value="Paid">Pago</option></select></Field></div><Field label="Observação"><input style={css.input} value={formShift.notes || ""} onChange={(event) => setFormShift({ ...formShift, notes: event.target.value })} placeholder="Opcional..." /></Field><div style={{ display: "flex", gap: 10 }}><button style={css.btn()} onClick={saveShift}>Salvar</button><button style={css.btnGhost} onClick={closeShift}>Cancelar</button></div></Modal>}
      {showExtraModal && <ExtraChargeModal caregivers={caregivers} elders={elders} serviceTypes={serviceTypes} initial={editingExtra} onClose={() => { setShowExtraModal(false); setEditingExtra(null); }} onSaved={(result) => { if (editingExtra?.id) setExtras(extras.map((extra) => extra.id === result.id ? result : extra)); else setExtras([...extras, result]); setShowExtraModal(false); setEditingExtra(null); }} />}
    </div>
  );
}
