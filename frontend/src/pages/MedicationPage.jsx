import { useEffect, useState } from "react";
import { api } from "../app/api";
import { G, css, useMobile } from "../app/shared";
import { ErrorBanner, Field, Modal } from "../components/ui";

const FAIXAS = ["jejum", "manhã", "almoço", "tarde", "jantar", "noite", "ao_deitar", "livre"];
const FAIXA_LABEL = {
  jejum: "Jejum", manhã: "Manhã", almoço: "Almoço", tarde: "Tarde",
  jantar: "Jantar", noite: "Noite", ao_deitar: "Ao deitar", livre: "Horário livre",
};
const DIAS_LABEL = ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const emptyMed = () => ({
  nome: "", principio_ativo: "", concentracao: "", apresentacao: "comprimido",
  observacoes_gerais: "", ativo: true,
});

const emptyPrescricao = (idoso_id = "") => ({
  idoso_id, medicamento_id: "", vigencia_inicio: "", vigencia_fim: "",
  observacao_geral: "", ativo: true,
});

const emptyHorario = () => ({
  faixa_horario: "manhã", hora_exata: "", dias_semana: [1, 2, 3, 4, 5, 6, 7],
  dose: "", observacao: "", ordem: 0,
});

function DiasCheckbox({ value, onChange, disabled }) {
  const toggle = (d) => {
    if (disabled) return;
    onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort((a, b) => a - b));
  };
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {[1, 2, 3, 4, 5, 6, 7].map((d) => (
        <button
          key={d}
          type="button"
          disabled={disabled}
          onClick={() => toggle(d)}
          style={{
            padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
            border: `1px solid ${value.includes(d) ? G.accent : G.cardBorder}`,
            background: value.includes(d) ? G.accent + "33" : "transparent",
            color: value.includes(d) ? G.accent : G.muted,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          {DIAS_LABEL[d]}
        </button>
      ))}
    </div>
  );
}

function MedModal({ med, onClose, onSave }) {
  const [form, setForm] = useState(med ? { ...med } : emptyMed());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.nome.trim()) return setError("Informe o nome do medicamento.");
    if (!form.apresentacao.trim()) return setError("Informe a apresentação.");
    setSaving(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        principio_ativo: form.principio_ativo?.trim() || null,
        concentracao: form.concentracao?.trim() || null,
        apresentacao: form.apresentacao.trim(),
        observacoes_gerais: form.observacoes_gerais?.trim() || null,
        ativo: form.ativo,
      };
      const result = med?.id
        ? await api.put(`/medications/${med.id}`, payload)
        : await api.post("/medications", payload);
      onSave(result);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal title={med?.id ? "Editar Medicamento" : "Novo Medicamento"} onClose={onClose}>
      <ErrorBanner msg={error} />
      <Field label="Nome *"><input style={css.input} value={form.nome} onChange={(e) => set("nome", e.target.value)} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Princípio ativo"><input style={css.input} value={form.principio_ativo || ""} onChange={(e) => set("principio_ativo", e.target.value)} /></Field>
        <Field label="Concentração"><input style={css.input} value={form.concentracao || ""} onChange={(e) => set("concentracao", e.target.value)} /></Field>
      </div>
      <Field label="Apresentação *"><input style={css.input} value={form.apresentacao} onChange={(e) => set("apresentacao", e.target.value)} /></Field>
      <Field label="Observações gerais"><textarea style={{ ...css.input, minHeight: 60, resize: "vertical" }} value={form.observacoes_gerais || ""} onChange={(e) => set("observacoes_gerais", e.target.value)} /></Field>
      <Field label="Status">
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={form.ativo} onChange={(e) => set("ativo", e.target.checked)} />
          <span style={{ fontSize: 14 }}>Ativo</span>
        </label>
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
        <button style={css.btnGhost} onClick={onClose}>Cancelar</button>
        <button style={css.btn()} onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</button>
      </div>
    </Modal>
  );
}

function HorarioModal({ horario, prescricaoId, onClose, onSave }) {
  const [form, setForm] = useState(horario ? { ...horario, hora_exata: horario.hora_exata || "", observacao: horario.observacao || "" } : emptyHorario());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.dose.trim()) return setError("Informe a dose.");
    if (!form.dias_semana.length) return setError("Selecione ao menos um dia.");
    setSaving(true);
    try {
      const payload = {
        faixa_horario: form.faixa_horario, hora_exata: form.hora_exata?.trim() || null,
        dias_semana: form.dias_semana, dose: form.dose.trim(),
        observacao: form.observacao?.trim() || null, ordem: Number(form.ordem) || 0,
      };
      const result = horario?.id
        ? await api.put(`/horarios-prescricao/${horario.id}`, payload)
        : await api.post(`/prescricoes/${prescricaoId}/horarios`, payload);
      onSave(result);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal title={horario?.id ? "Editar Horário" : "Novo Horário"} onClose={onClose}>
      <ErrorBanner msg={error} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Faixa de horário">
          <select style={css.select} value={form.faixa_horario} onChange={(e) => set("faixa_horario", e.target.value)}>
            {FAIXAS.map((f) => <option key={f} value={f}>{FAIXA_LABEL[f]}</option>)}
          </select>
        </Field>
        <Field label="Hora exata (opcional)"><input style={css.input} placeholder="ex: 08:00" value={form.hora_exata} onChange={(e) => set("hora_exata", e.target.value)} /></Field>
      </div>
      <Field label="Dose *"><input style={css.input} placeholder="ex: 1 comprimido" value={form.dose} onChange={(e) => set("dose", e.target.value)} /></Field>
      <Field label="Dias da semana">
        <DiasCheckbox value={form.dias_semana} onChange={(v) => set("dias_semana", v)} />
      </Field>
      <Field label="Observação"><input style={css.input} value={form.observacao} onChange={(e) => set("observacao", e.target.value)} /></Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
        <button style={css.btnGhost} onClick={onClose}>Cancelar</button>
        <button style={css.btn()} onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</button>
      </div>
    </Modal>
  );
}

function PrescricaoModal({ prescricao, elders, medications, defaultIdoso, onClose, onSave }) {
  const [form, setForm] = useState(
    prescricao
      ? { ...prescricao, medicamento_id: prescricao.medicamento?.id || prescricao.medicamento_id || "", vigencia_fim: prescricao.vigencia_fim || "", observacao_geral: prescricao.observacao_geral || "" }
      : emptyPrescricao(defaultIdoso || "")
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.idoso_id) return setError("Selecione o idoso.");
    if (!form.medicamento_id) return setError("Selecione o medicamento.");
    if (!form.vigencia_inicio) return setError("Informe a vigência inicial.");
    setSaving(true);
    try {
      const payload = {
        idoso_id: form.idoso_id, medicamento_id: form.medicamento_id,
        vigencia_inicio: form.vigencia_inicio, vigencia_fim: form.vigencia_fim || null,
        observacao_geral: form.observacao_geral?.trim() || null, ativo: form.ativo,
      };
      const result = prescricao?.id
        ? await api.put(`/prescricoes/${prescricao.id}`, payload)
        : await api.post("/prescricoes", payload);
      onSave(result);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const activeMeds = medications.filter((m) => m.ativo);

  return (
    <Modal title={prescricao?.id ? "Editar Prescrição" : "Nova Prescrição"} onClose={onClose}>
      <ErrorBanner msg={error} />
      <Field label="Idoso *">
        <select style={css.select} value={form.idoso_id} onChange={(e) => set("idoso_id", e.target.value)}>
          <option value="">Selecione...</option>
          {elders.filter((e) => e.active).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </Field>
      <Field label="Medicamento *">
        <select style={css.select} value={form.medicamento_id} onChange={(e) => set("medicamento_id", e.target.value)}>
          <option value="">Selecione...</option>
          {activeMeds.map((m) => <option key={m.id} value={m.id}>{m.nome}{m.concentracao ? ` ${m.concentracao}` : ""}</option>)}
        </select>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Vigência início *"><input type="date" style={css.input} value={form.vigencia_inicio} onChange={(e) => set("vigencia_inicio", e.target.value)} /></Field>
        <Field label="Vigência fim (opcional)"><input type="date" style={css.input} value={form.vigencia_fim} onChange={(e) => set("vigencia_fim", e.target.value)} /></Field>
      </div>
      <Field label="Observação geral"><textarea style={{ ...css.input, minHeight: 56, resize: "vertical" }} value={form.observacao_geral} onChange={(e) => set("observacao_geral", e.target.value)} /></Field>
      <Field label="Status">
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={form.ativo} onChange={(e) => set("ativo", e.target.checked)} />
          <span style={{ fontSize: 14 }}>Ativa</span>
        </label>
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
        <button style={css.btnGhost} onClick={onClose}>Cancelar</button>
        <button style={css.btn()} onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</button>
      </div>
    </Modal>
  );
}

export default function MedicationPage({ elders }) {
  const isMobile = useMobile();
  const [section, setSection] = useState("medicamentos");
  const [medications, setMedications] = useState([]);
  const [prescricoes, setPrescricoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterElder, setFilterElder] = useState("");
  const [expandedPrescricao, setExpandedPrescricao] = useState(null);

  // Modals
  const [medModal, setMedModal] = useState(null); // null | {} | medObj
  const [prescricaoModal, setPrescricaoModal] = useState(null);
  const [horarioModal, setHorarioModal] = useState(null); // { prescricaoId, horario? }

  const loadAll = async () => {
    setLoading(true);
    try {
      const [meds, prescs] = await Promise.all([
        api.get("/medications"),
        api.get("/prescricoes"),
      ]);
      setMedications(meds);
      setPrescricoes(prescs);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadAll(); }, []);

  const filteredPrescricoes = filterElder
    ? prescricoes.filter((p) => p.idoso_id === filterElder)
    : prescricoes;

  const activeElders = (elders || []).filter((e) => e.active);

  const sectionBtnStyle = (s) => ({
    padding: "6px 16px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600,
    cursor: "pointer", background: section === s ? G.accent : "transparent",
    color: section === s ? "#fff" : G.muted,
  });

  if (loading) return <div style={{ color: G.muted, padding: 32 }}>⏳ Carregando...</div>;

  return (
    <div>
      <ErrorBanner msg={error} />

      {/* Section tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        <button style={sectionBtnStyle("medicamentos")} onClick={() => setSection("medicamentos")}>💊 Medicamentos</button>
        <button style={sectionBtnStyle("prescricoes")} onClick={() => setSection("prescricoes")}>📋 Prescrições</button>
      </div>

      {/* ── Medicamentos ───────────────────────────────────────── */}
      {section === "medicamentos" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ ...css.h1, margin: 0 }}>Catálogo de Medicamentos</h2>
            <button style={{ ...css.btn(), marginLeft: "auto" }} onClick={() => setMedModal({})}>+ Novo</button>
          </div>
          <div style={{ ...css.card, padding: 0, overflow: "hidden" }}>
            <table style={css.table}>
              <thead>
                <tr>
                  <th style={css.th}>Nome</th>
                  <th style={css.th}>Concentração</th>
                  <th style={css.th}>Apresentação</th>
                  {!isMobile && <th style={css.th}>Princípio ativo</th>}
                  <th style={css.th}>Status</th>
                  <th style={css.th}></th>
                </tr>
              </thead>
              <tbody>
                {medications.length === 0 && (
                  <tr><td colSpan={6} style={{ ...css.td, color: G.muted, textAlign: "center", padding: 24 }}>Nenhum medicamento cadastrado.</td></tr>
                )}
                {medications.map((m) => (
                  <tr key={m.id}>
                    <td style={css.td}><strong>{m.nome}</strong></td>
                    <td style={css.td}>{m.concentracao || <span style={{ color: G.muted }}>—</span>}</td>
                    <td style={css.td}>{m.apresentacao}</td>
                    {!isMobile && <td style={css.td}>{m.principio_ativo || <span style={{ color: G.muted }}>—</span>}</td>}
                    <td style={css.td}>
                      <span style={css.badge(m.ativo ? G.green : G.muted)}>{m.ativo ? "Ativo" : "Inativo"}</span>
                    </td>
                    <td style={css.td}>
                      <button style={css.btnSm(G.accent)} onClick={() => setMedModal(m)}>Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Prescrições ────────────────────────────────────────── */}
      {section === "prescricoes" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            <h2 style={{ ...css.h1, margin: 0 }}>Prescrições</h2>
            <select
              style={{ ...css.select, width: "auto", minWidth: 180, marginLeft: isMobile ? 0 : "auto" }}
              value={filterElder}
              onChange={(e) => setFilterElder(e.target.value)}
            >
              <option value="">Todos os idosos</option>
              {activeElders.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <button
              style={css.btn()}
              onClick={() => setPrescricaoModal({ defaultIdoso: filterElder })}
            >
              + Nova
            </button>
          </div>

          {filteredPrescricoes.length === 0 && (
            <div style={{ ...css.card, color: G.muted, textAlign: "center", padding: 32 }}>
              Nenhuma prescrição encontrada.
            </div>
          )}

          {filteredPrescricoes.map((p) => {
            const isExpanded = expandedPrescricao === p.id;
            const med = p.medicamento;
            return (
              <div key={p.id} style={{ ...css.card, marginBottom: 12, padding: 0, overflow: "hidden" }}>
                {/* Header */}
                <div
                  style={{ display: "flex", alignItems: "center", padding: "12px 16px", cursor: "pointer", gap: 10 }}
                  onClick={() => setExpandedPrescricao(isExpanded ? null : p.id)}
                >
                  <span style={{ fontSize: 14, fontWeight: 700 }}>
                    {med?.nome || "—"}{med?.concentracao ? ` ${med.concentracao}` : ""}
                  </span>
                  <span style={{ fontSize: 12, color: G.muted }}>
                    {(elders || []).find((e) => e.id === p.idoso_id)?.name || p.idoso_id}
                  </span>
                  <span style={{ ...css.badge(p.ativo ? G.green : G.muted), marginLeft: "auto" }}>
                    {p.ativo ? "Ativa" : "Inativa"}
                  </span>
                  <span style={{ color: G.muted, fontSize: 12 }}>
                    {p.vigencia_inicio} {p.vigencia_fim ? `→ ${p.vigencia_fim}` : "→ ..."}
                  </span>
                  <button
                    style={{ ...css.btnSm(G.accent), marginLeft: 4 }}
                    onClick={(e) => { e.stopPropagation(); setPrescricaoModal({ prescricao: p }); }}
                  >
                    Editar
                  </button>
                  <span style={{ color: G.muted, fontSize: 16, marginLeft: 4 }}>{isExpanded ? "▲" : "▼"}</span>
                </div>

                {/* Expanded: horários */}
                {isExpanded && (
                  <div style={{ borderTop: `1px solid ${G.cardBorder}`, padding: "12px 16px" }}>
                    {p.observacao_geral && (
                      <div style={{ fontSize: 12, color: G.muted, marginBottom: 10 }}>📝 {p.observacao_geral}</div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: G.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>Horários</span>
                      <button
                        style={{ ...css.btnSm(G.green), marginLeft: "auto" }}
                        onClick={() => setHorarioModal({ prescricaoId: p.id })}
                      >
                        + Horário
                      </button>
                    </div>
                    {(!p.horarios || p.horarios.length === 0) && (
                      <div style={{ color: G.muted, fontSize: 13, marginBottom: 8 }}>Nenhum horário cadastrado.</div>
                    )}
                    {(p.horarios || []).map((h) => (
                      <div
                        key={h.id}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${G.cardBorder}22`, flexWrap: "wrap" }}
                      >
                        <span style={{ ...css.badge(G.purple), flexShrink: 0 }}>{FAIXA_LABEL[h.faixa_horario] || h.faixa_horario}</span>
                        {h.hora_exata && <span style={{ fontSize: 12, color: G.muted }}>🕐 {h.hora_exata}</span>}
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{h.dose}</span>
                        <span style={{ fontSize: 11, color: G.muted }}>
                          {(h.dias_semana || []).map((d) => DIAS_LABEL[d]).join(", ")}
                        </span>
                        {h.observacao && <span style={{ fontSize: 11, color: G.muted, fontStyle: "italic" }}>{h.observacao}</span>}
                        <button
                          style={{ ...css.btnSm(G.amber), marginLeft: "auto" }}
                          onClick={() => setHorarioModal({ prescricaoId: p.id, horario: h })}
                        >
                          Editar
                        </button>
                        <button
                          style={css.btnSm(G.red)}
                          onClick={async () => {
                            if (!confirm("Remover este horário?")) return;
                            try {
                              await api.delete(`/horarios-prescricao/${h.id}`);
                              setPrescricoes((prev) => prev.map((pp) =>
                                pp.id === p.id ? { ...pp, horarios: pp.horarios.filter((hh) => hh.id !== h.id) } : pp
                              ));
                            } catch (e) { setError(e.message); }
                          }}
                        >
                          Remover
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────── */}
      {medModal !== null && (
        <MedModal
          med={medModal?.id ? medModal : null}
          onClose={() => setMedModal(null)}
          onSave={(result) => {
            setMedications((prev) => {
              const idx = prev.findIndex((m) => m.id === result.id);
              return idx >= 0 ? prev.map((m) => (m.id === result.id ? result : m)) : [result, ...prev];
            });
            setMedModal(null);
          }}
        />
      )}

      {prescricaoModal !== null && (
        <PrescricaoModal
          prescricao={prescricaoModal?.prescricao || null}
          defaultIdoso={prescricaoModal?.defaultIdoso || ""}
          elders={elders || []}
          medications={medications}
          onClose={() => setPrescricaoModal(null)}
          onSave={(result) => {
            setPrescricoes((prev) => {
              const idx = prev.findIndex((p) => p.id === result.id);
              return idx >= 0 ? prev.map((p) => (p.id === result.id ? result : p)) : [result, ...prev];
            });
            setPrescricaoModal(null);
          }}
        />
      )}

      {horarioModal !== null && (
        <HorarioModal
          horario={horarioModal?.horario || null}
          prescricaoId={horarioModal.prescricaoId}
          onClose={() => setHorarioModal(null)}
          onSave={(result) => {
            setPrescricoes((prev) => prev.map((p) => {
              if (p.id !== horarioModal.prescricaoId) return p;
              const horarios = p.horarios || [];
              const idx = horarios.findIndex((h) => h.id === result.id);
              return {
                ...p,
                horarios: idx >= 0
                  ? horarios.map((h) => (h.id === result.id ? result : h))
                  : [...horarios, result],
              };
            }));
            setHorarioModal(null);
          }}
        />
      )}
    </div>
  );
}
