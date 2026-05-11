import { useState } from "react";
import { api } from "../app/api";
import { G, css, fmt, useMobile } from "../app/shared";
import { ErrorBanner, Field, Modal } from "../components/ui";

export default function CatalogsPage({ caregivers, setCaregivers, elders, setElders, serviceTypes, setServiceTypes }) {
  const isMobile = useMobile();
  const [section, setSection] = useState("caregivers");
  const [error, setError] = useState("");

  const createCaregiverForm = (caregiver = null) => {
    const serviceRates = {};
    serviceTypes.forEach((serviceType) => {
      const existingRate = caregiver?.service_rates?.find((rate) => rate.service_type_id === serviceType.id);
      serviceRates[serviceType.id] = existingRate ? String(existingRate.value) : "";
    });
    return {
      name: caregiver?.name || "",
      phone: caregiver?.phone || "",
      pix_key: caregiver?.pix_key || "",
      extra_hour_value: caregiver?.extra_hour_value ?? "",
      day_shift_value: caregiver?.day_shift_value ?? "",
      night_shift_value: caregiver?.night_shift_value ?? "",
      full_day_shift_value: caregiver?.full_day_shift_value ?? "",
      payment_type: caregiver?.payment_type || "Weekly",
      active: caregiver?.active ?? true,
      login_username: caregiver?.login?.username || "",
      login_display_name: caregiver?.login?.display_name || caregiver?.name || "",
      login_password: "",
      login_active: caregiver?.login?.active ?? true,
      service_rates: serviceRates,
    };
  };

  const [showCaregiverModal, setShowCaregiverModal] = useState(false);
  const [editingCaregiver, setEditingCaregiver] = useState(null);
  const [caregiverForm, setCaregiverForm] = useState(createCaregiverForm());
  const [showElderModal, setShowElderModal] = useState(false);
  const [editingElder, setEditingElder] = useState(null);
  const [elderForm, setElderForm] = useState({ name: "", active: true });
  const [showServiceTypeModal, setShowServiceTypeModal] = useState(false);
  const [editingServiceType, setEditingServiceType] = useState(null);
  const [serviceTypeForm, setServiceTypeForm] = useState({ name: "", code: "", requires_elder: false, requires_glucose: false, requires_period: false, active: true });

  const openCaregiver = (caregiver = null) => {
    setEditingCaregiver(caregiver?.id || null);
    setCaregiverForm(createCaregiverForm(caregiver));
    setShowCaregiverModal(true);
    setError("");
  };

  const closeCaregiver = () => {
    setShowCaregiverModal(false);
    setEditingCaregiver(null);
    setCaregiverForm(createCaregiverForm());
    setError("");
  };

  const openElder = (elder = null) => {
    setEditingElder(elder?.id || null);
    setElderForm(elder ? { name: elder.name, active: elder.active } : { name: "", active: true });
    setShowElderModal(true);
    setError("");
  };

  const closeElder = () => {
    setShowElderModal(false);
    setEditingElder(null);
    setElderForm({ name: "", active: true });
    setError("");
  };

  const openServiceType = (serviceType = null) => {
    setEditingServiceType(serviceType?.id || null);
    setServiceTypeForm(serviceType ? { ...serviceType, code: serviceType.code || "" } : { name: "", code: "", requires_elder: false, requires_glucose: false, requires_period: false, active: true });
    setShowServiceTypeModal(true);
    setError("");
  };

  const closeServiceType = () => {
    setShowServiceTypeModal(false);
    setEditingServiceType(null);
    setServiceTypeForm({ name: "", code: "", requires_elder: false, requires_glucose: false, requires_period: false, active: true });
    setError("");
  };

  const saveCaregiver = async () => {
    if (!caregiverForm.name.trim()) return setError("Nome é obrigatório");
    if (caregiverForm.login_username.trim() && !editingCaregiver && !caregiverForm.login_password) {
      return setError("Informe uma senha para criar o acesso da cuidadora");
    }
    try {
      let saved = editingCaregiver
        ? await api.put(`/caregivers/${editingCaregiver}`, {
            name: caregiverForm.name,
            phone: caregiverForm.phone || null,
            pix_key: caregiverForm.pix_key || null,
            extra_hour_value: Number(caregiverForm.extra_hour_value || 0),
            day_shift_value: Number(caregiverForm.day_shift_value || 0),
            night_shift_value: Number(caregiverForm.night_shift_value || 0),
            full_day_shift_value: Number(caregiverForm.full_day_shift_value || 0),
            payment_type: caregiverForm.payment_type,
            active: caregiverForm.active,
          })
        : await api.post("/caregivers", {
            name: caregiverForm.name,
            phone: caregiverForm.phone || null,
            pix_key: caregiverForm.pix_key || null,
            extra_hour_value: Number(caregiverForm.extra_hour_value || 0),
            day_shift_value: Number(caregiverForm.day_shift_value || 0),
            night_shift_value: Number(caregiverForm.night_shift_value || 0),
            full_day_shift_value: Number(caregiverForm.full_day_shift_value || 0),
            payment_type: caregiverForm.payment_type,
            active: caregiverForm.active,
          });

      saved = await api.put(`/caregivers/${saved.id}/service-rates`, {
        service_rates: Object.entries(caregiverForm.service_rates)
          .filter(([, value]) => value !== "")
          .map(([service_type_id, value]) => ({ service_type_id, value: Number(value) })),
      });

      if (caregiverForm.login_username.trim()) {
        saved = await api.put(`/caregivers/${saved.id}/login`, {
          username: caregiverForm.login_username,
          display_name: caregiverForm.login_display_name || caregiverForm.name,
          password: caregiverForm.login_password || null,
          active: caregiverForm.login_active,
        });
      }

      setCaregivers(editingCaregiver ? caregivers.map((caregiver) => caregiver.id === saved.id ? saved : caregiver) : [...caregivers, saved]);
      closeCaregiver();
    } catch (error) {
      setError(error.message || "Erro ao salvar cuidadora.");
    }
  };

  const toggleCaregiver = async (caregiver) => {
    const updated = await api.put(`/caregivers/${caregiver.id}`, {
      name: caregiver.name,
      phone: caregiver.phone || null,
      pix_key: caregiver.pix_key || null,
      extra_hour_value: Number(caregiver.extra_hour_value || 0),
      day_shift_value: Number(caregiver.day_shift_value || 0),
      night_shift_value: Number(caregiver.night_shift_value || 0),
      full_day_shift_value: Number(caregiver.full_day_shift_value || 0),
      payment_type: caregiver.payment_type,
      active: !caregiver.active,
    });
    setCaregivers(caregivers.map((item) => item.id === caregiver.id ? updated : item));
  };

  const saveElder = async () => {
    if (!elderForm.name.trim()) return setError("Nome do idoso é obrigatório");
    try {
      const saved = editingElder ? await api.put(`/elders/${editingElder}`, elderForm) : await api.post("/elders", elderForm);
      setElders(editingElder ? elders.map((elder) => elder.id === saved.id ? saved : elder) : [...elders, saved]);
      closeElder();
    } catch (error) {
      setError(error.message || "Erro ao salvar idoso.");
    }
  };

  const saveServiceType = async () => {
    if (!serviceTypeForm.name.trim()) return setError("Nome do tipo de serviço é obrigatório");
    try {
      const payload = {
        name: serviceTypeForm.name,
        code: serviceTypeForm.code || null,
        requires_elder: serviceTypeForm.requires_elder,
        requires_glucose: serviceTypeForm.requires_glucose,
        requires_period: serviceTypeForm.requires_period,
        active: serviceTypeForm.active,
      };
      const saved = editingServiceType ? await api.put(`/service-types/${editingServiceType}`, payload) : await api.post("/service-types", payload);
      setServiceTypes(editingServiceType ? serviceTypes.map((item) => item.id === saved.id ? saved : item) : [...serviceTypes, saved]);
      closeServiceType();
    } catch (error) {
      setError(error.message || "Erro ao salvar tipo de serviço.");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button style={{ ...css.btn(section === "caregivers" ? G.accent : G.inputBorder), padding: "8px 14px" }} onClick={() => setSection("caregivers")}>Cuidadoras</button>
        <button style={{ ...css.btn(section === "elders" ? G.teal : G.inputBorder), padding: "8px 14px" }} onClick={() => setSection("elders")}>Idosos</button>
        <button style={{ ...css.btn(section === "serviceTypes" ? G.purple : G.inputBorder), padding: "8px 14px" }} onClick={() => setSection("serviceTypes")}>Tipos de Serviço</button>
      </div>

      {section === "caregivers" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
            <h1 style={{ ...css.h1, margin: 0 }}>👩‍⚕️ Cuidadoras</h1>
            <button style={{ ...css.btn(), marginLeft: "auto", fontSize: isMobile ? 13 : 14, padding: isMobile ? "8px 14px" : "10px 20px" }} onClick={() => openCaregiver()}>+ Nova</button>
          </div>
          <div style={{ ...css.card, overflowX: "auto" }}>
            <table style={css.table}>
              <thead><tr>{["Nome", "PIX", "Hora Avulsa", "Login", "Serviços", "Status", "Ações"].map((label) => <th key={label} style={css.th}>{label}</th>)}</tr></thead>
              <tbody>
                {caregivers.length === 0 && <tr><td colSpan={7} style={{ ...css.td, color: G.muted, textAlign: "center", padding: 32 }}>Nenhuma cuidadora cadastrada</td></tr>}
                {caregivers.map((caregiver) => (
                  <tr key={caregiver.id}>
                    <td style={css.td}><strong>{caregiver.name}</strong>{caregiver.phone && <div style={{ fontSize: 12, color: G.muted }}>{caregiver.phone}</div>}</td>
                    <td style={css.td}>{caregiver.pix_key || "—"}</td>
                    <td style={css.td}>{fmt(caregiver.extra_hour_value)}</td>
                    <td style={css.td}>{caregiver.login ? <><div>{caregiver.login.username}</div><div style={{ fontSize: 12, color: G.muted }}>{caregiver.login.display_name}</div></> : "—"}</td>
                    <td style={css.td}>{caregiver.service_rates?.length ? caregiver.service_rates.map((rate) => <div key={rate.service_type_id}>{rate.service_type_name}: {fmt(rate.value)}</div>) : "—"}</td>
                    <td style={css.td}><span style={css.badge(caregiver.active ? G.green : G.red)}>{caregiver.active ? "Ativa" : "Inativa"}</span></td>
                    <td style={css.td}><button style={{ ...css.btnSm(G.accent), marginRight: 6 }} onClick={() => openCaregiver(caregiver)}>Editar</button><button style={css.btnSm(caregiver.active ? G.red : G.green)} onClick={() => toggleCaregiver(caregiver)}>{caregiver.active ? "Desativar" : "Ativar"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === "elders" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
            <h1 style={{ ...css.h1, margin: 0 }}>🧓 Idosos</h1>
            <button style={{ ...css.btn(G.teal), marginLeft: "auto", fontSize: isMobile ? 13 : 14, padding: isMobile ? "8px 14px" : "10px 20px" }} onClick={() => openElder()}>+ Novo</button>
          </div>
          <div style={{ ...css.card, overflowX: "auto" }}>
            <table style={css.table}>
              <thead><tr>{["Nome", "Status", "Ações"].map((label) => <th key={label} style={css.th}>{label}</th>)}</tr></thead>
              <tbody>
                {elders.length === 0 && <tr><td colSpan={3} style={{ ...css.td, color: G.muted, textAlign: "center", padding: 32 }}>Nenhum idoso cadastrado</td></tr>}
                {elders.map((elder) => <tr key={elder.id}><td style={css.td}>{elder.name}</td><td style={css.td}><span style={css.badge(elder.active ? G.green : G.red)}>{elder.active ? "Ativo" : "Inativo"}</span></td><td style={css.td}><button style={css.btnSm(G.accent)} onClick={() => openElder(elder)}>Editar</button></td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === "serviceTypes" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
            <h1 style={{ ...css.h1, margin: 0 }}>🩺 Tipos de Serviço</h1>
            <button style={{ ...css.btn(G.purple), marginLeft: "auto", fontSize: isMobile ? 13 : 14, padding: isMobile ? "8px 14px" : "10px 20px" }} onClick={() => openServiceType()}>+ Novo</button>
          </div>
          <div style={{ ...css.card, overflowX: "auto" }}>
            <table style={css.table}>
              <thead><tr>{["Serviço", "Código", "Regras", "Status", "Ações"].map((label) => <th key={label} style={css.th}>{label}</th>)}</tr></thead>
              <tbody>
                {serviceTypes.length === 0 && <tr><td colSpan={5} style={{ ...css.td, color: G.muted, textAlign: "center", padding: 32 }}>Nenhum tipo de serviço cadastrado</td></tr>}
                {serviceTypes.map((serviceType) => <tr key={serviceType.id}><td style={css.td}>{serviceType.name}</td><td style={css.td}>{serviceType.code}</td><td style={css.td}><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{serviceType.requires_elder && <span style={css.badge(G.accent)}>Idoso</span>}{serviceType.requires_glucose && <span style={css.badge(G.teal)}>Glicose</span>}{serviceType.requires_period && <span style={css.badge(G.purple)}>Período</span>}</div></td><td style={css.td}><span style={css.badge(serviceType.active ? G.green : G.red)}>{serviceType.active ? "Ativo" : "Inativo"}</span></td><td style={css.td}><button style={css.btnSm(G.accent)} onClick={() => openServiceType(serviceType)}>Editar</button></td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCaregiverModal && (
        <Modal title={editingCaregiver ? "Editar Cuidadora" : "Nova Cuidadora"} onClose={closeCaregiver} wide>
          <ErrorBanner msg={error} />
          <div style={css.grid(isMobile ? 1 : 2)}>
            <Field label="Nome *"><input style={css.input} value={caregiverForm.name} onChange={(event) => setCaregiverForm({ ...caregiverForm, name: event.target.value })} /></Field>
            <Field label="Telefone"><input style={css.input} value={caregiverForm.phone} onChange={(event) => setCaregiverForm({ ...caregiverForm, phone: event.target.value })} /></Field>
          </div>
          <div style={css.grid(isMobile ? 1 : 2)}>
            <Field label="Código PIX"><input style={css.input} value={caregiverForm.pix_key} onChange={(event) => setCaregiverForm({ ...caregiverForm, pix_key: event.target.value })} /></Field>
            <Field label="Valor Hora Avulsa"><input type="number" style={css.input} value={caregiverForm.extra_hour_value} onChange={(event) => setCaregiverForm({ ...caregiverForm, extra_hour_value: event.target.value })} /></Field>
          </div>
          <div style={css.grid(isMobile ? 1 : 3)}>
            <Field label="☀️ Diurno 12h"><input type="number" style={css.input} value={caregiverForm.day_shift_value} onChange={(event) => setCaregiverForm({ ...caregiverForm, day_shift_value: event.target.value })} /></Field>
            <Field label="🌙 Noturno 12h"><input type="number" style={css.input} value={caregiverForm.night_shift_value} onChange={(event) => setCaregiverForm({ ...caregiverForm, night_shift_value: event.target.value })} /></Field>
            <Field label="🌗 24 horas"><input type="number" style={css.input} value={caregiverForm.full_day_shift_value} onChange={(event) => setCaregiverForm({ ...caregiverForm, full_day_shift_value: event.target.value })} /></Field>
          </div>
          <Field label="Tipo de Pagamento"><select style={css.select} value={caregiverForm.payment_type} onChange={(event) => setCaregiverForm({ ...caregiverForm, payment_type: event.target.value })}><option value="Weekly">Semanal</option><option value="Monthly">Mensal</option></select></Field>
          <div style={{ ...css.card, padding: 16, marginBottom: 16 }}>
            <h2 style={{ ...css.h2, marginBottom: 10 }}>Acesso da Cuidadora</h2>
            <div style={css.grid(isMobile ? 1 : 2)}>
              <Field label="Username"><input style={css.input} value={caregiverForm.login_username} onChange={(event) => setCaregiverForm({ ...caregiverForm, login_username: event.target.value.toLowerCase() })} placeholder="nome em lowercase" /></Field>
              <Field label="Nome Exibido"><input style={css.input} value={caregiverForm.login_display_name} onChange={(event) => setCaregiverForm({ ...caregiverForm, login_display_name: event.target.value })} /></Field>
            </div>
            <div style={css.grid(isMobile ? 1 : 2)}>
              <Field label={editingCaregiver && caregiverForm.login_username ? "Nova Senha (opcional)" : "Senha"}><input type="password" style={css.input} value={caregiverForm.login_password} onChange={(event) => setCaregiverForm({ ...caregiverForm, login_password: event.target.value })} placeholder={editingCaregiver ? "Preencha só para trocar" : "Obrigatória ao criar acesso"} /></Field>
              <Field label="Login Ativo"><select style={css.select} value={caregiverForm.login_active ? "true" : "false"} onChange={(event) => setCaregiverForm({ ...caregiverForm, login_active: event.target.value === "true" })}><option value="true">Ativo</option><option value="false">Inativo</option></select></Field>
            </div>
          </div>
          <div style={{ ...css.card, padding: 16, marginBottom: 16 }}>
            <h2 style={{ ...css.h2, marginBottom: 10 }}>Valores por Tipo de Serviço</h2>
            {serviceTypes.length === 0 && <div style={{ color: G.muted, fontSize: 13 }}>Cadastre tipos de serviço antes de definir valores.</div>}
            {serviceTypes.map((serviceType) => <div key={serviceType.id} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,2fr) minmax(180px,1fr)", gap: 12, alignItems: "center", marginBottom: 12 }}><div><div style={{ fontWeight: 600 }}>{serviceType.name}</div><div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>{serviceType.requires_elder && <span style={css.badge(G.accent)}>Precisa idoso</span>}{serviceType.requires_glucose && <span style={css.badge(G.teal)}>Pede glicose</span>}{serviceType.requires_period && <span style={css.badge(G.purple)}>Pede período</span>}</div></div><input type="number" style={css.input} value={caregiverForm.service_rates[serviceType.id] ?? ""} onChange={(event) => setCaregiverForm({ ...caregiverForm, service_rates: { ...caregiverForm.service_rates, [serviceType.id]: event.target.value } })} placeholder="Valor" /></div>)}
          </div>
          <div style={{ display: "flex", gap: 10 }}><button style={css.btn()} onClick={saveCaregiver}>Salvar</button><button style={css.btnGhost} onClick={closeCaregiver}>Cancelar</button></div>
        </Modal>
      )}

      {showElderModal && (
        <Modal title={editingElder ? "Editar Idoso" : "Novo Idoso"} onClose={closeElder}>
          <ErrorBanner msg={error} />
          <Field label="Nome"><input style={css.input} value={elderForm.name} onChange={(event) => setElderForm({ ...elderForm, name: event.target.value })} /></Field>
          <Field label="Status"><select style={css.select} value={elderForm.active ? "true" : "false"} onChange={(event) => setElderForm({ ...elderForm, active: event.target.value === "true" })}><option value="true">Ativo</option><option value="false">Inativo</option></select></Field>
          <div style={{ display: "flex", gap: 10 }}><button style={css.btn(G.teal)} onClick={saveElder}>Salvar</button><button style={css.btnGhost} onClick={closeElder}>Cancelar</button></div>
        </Modal>
      )}

      {showServiceTypeModal && (
        <Modal title={editingServiceType ? "Editar Tipo de Serviço" : "Novo Tipo de Serviço"} onClose={closeServiceType}>
          <ErrorBanner msg={error} />
          <Field label="Nome"><input style={css.input} value={serviceTypeForm.name} onChange={(event) => setServiceTypeForm({ ...serviceTypeForm, name: event.target.value })} /></Field>
          <Field label="Código (opcional)"><input style={css.input} value={serviceTypeForm.code} onChange={(event) => setServiceTypeForm({ ...serviceTypeForm, code: event.target.value })} placeholder="Gerado automaticamente se vazio" /></Field>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 12, marginBottom: 16 }}>
            <label style={{ ...css.card, padding: 12, display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={serviceTypeForm.requires_elder} onChange={(event) => setServiceTypeForm({ ...serviceTypeForm, requires_elder: event.target.checked })} />Precisa de idoso</label>
            <label style={{ ...css.card, padding: 12, display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={serviceTypeForm.requires_glucose} onChange={(event) => setServiceTypeForm({ ...serviceTypeForm, requires_glucose: event.target.checked })} />Precisa de glicose</label>
            <label style={{ ...css.card, padding: 12, display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={serviceTypeForm.requires_period} onChange={(event) => setServiceTypeForm({ ...serviceTypeForm, requires_period: event.target.checked })} />Precisa de período</label>
          </div>
          <Field label="Status"><select style={css.select} value={serviceTypeForm.active ? "true" : "false"} onChange={(event) => setServiceTypeForm({ ...serviceTypeForm, active: event.target.value === "true" })}><option value="true">Ativo</option><option value="false">Inativo</option></select></Field>
          <div style={{ display: "flex", gap: 10 }}><button style={css.btn(G.purple)} onClick={saveServiceType}>Salvar</button><button style={css.btnGhost} onClick={closeServiceType}>Cancelar</button></div>
        </Modal>
      )}
    </div>
  );
}
