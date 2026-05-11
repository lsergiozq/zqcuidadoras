import { useEffect, useState } from "react";
import { api } from "../app/api";
import { G, css, fmtDate, getWeekRange, today, useMobile } from "../app/shared";
import { ErrorBanner } from "../components/ui";

const FAIXA_LABEL = {
  jejum: "🌅 Jejum", manhã: "☀️ Manhã", almoço: "🍽 Almoço", tarde: "🌤 Tarde",
  jantar: "🍴 Jantar", noite: "🌙 Noite", ao_deitar: "🛏 Ao deitar", livre: "⏰ Horário livre",
};
const FAIXA_ORDER = ["jejum", "manhã", "almoço", "tarde", "jantar", "noite", "ao_deitar", "livre"];
const DIAS_LABEL = ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const STATUS_LABEL = { rascunho: "Rascunho", em_separacao: "Em separação", fechado: "Fechado" };
const STATUS_COLOR = { rascunho: G.muted, em_separacao: G.amber, fechado: G.green };
const ITEM_STATUS_COLOR = { pendente: G.muted, separado: G.amber, conferido: G.green };

function groupByFaixa(itens) {
  const map = {};
  for (const item of itens) {
    const k = item.faixa_horario || "livre";
    if (!map[k]) map[k] = [];
    map[k].push(item);
  }
  return FAIXA_ORDER.filter((f) => map[f]).map((f) => ({ faixa: f, itens: map[f] }));
}

function ItemRow({ item, sep, onUpdate, isMobile }) {
  const [obs, setObs] = useState(item.observacao_separacao || "");
  const [editingObs, setEditingObs] = useState(false);
  const [saving, setSaving] = useState(false);
  const closed = sep.status === "fechado";

  const patch = async (payload) => {
    setSaving(true);
    try {
      const updated = await api.patch(`/itens-separacao/${item.id}`, payload);
      onUpdate(updated);
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const saveObs = async () => {
    await patch({ observacao_separacao: obs });
    setEditingObs(false);
  };

  const statusNext = { pendente: "separado", separado: "conferido", conferido: "pendente" };
  const statusIcon = { pendente: "○", separado: "◑", conferido: "●" };

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px",
      borderBottom: `1px solid ${G.cardBorder}22`, flexWrap: "wrap",
      opacity: item.status === "conferido" ? 0.7 : 1,
      background: item.falta_compra ? G.red + "11" : "transparent",
    }}>
      {/* Status toggle */}
      <button
        disabled={closed || saving}
        onClick={() => patch({ status: statusNext[item.status] })}
        style={{
          background: "none", border: `2px solid ${ITEM_STATUS_COLOR[item.status]}`,
          borderRadius: "50%", width: 28, height: 28, cursor: closed ? "not-allowed" : "pointer",
          color: ITEM_STATUS_COLOR[item.status], fontSize: 14, fontWeight: 700,
          flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        }}
        title={`Marcar como ${statusNext[item.status]}`}
      >
        {statusIcon[item.status]}
      </button>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{item.medicamento_nome}</div>
        <div style={{ fontSize: 12, color: G.muted, marginTop: 2 }}>
          {item.dose}
          {item.hora_exata && <span style={{ marginLeft: 8 }}>🕐 {item.hora_exata}</span>}
          <span style={{ marginLeft: 8 }}>
            {(Array.isArray(item.dias_semana) ? item.dias_semana : []).map((d) => DIAS_LABEL[d]).join(", ")}
          </span>
        </div>
        {item.observacao_prescricao && (
          <div style={{ fontSize: 11, color: G.muted, fontStyle: "italic", marginTop: 2 }}>{item.observacao_prescricao}</div>
        )}
        {/* Obs separação */}
        {editingObs ? (
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <input
              style={{ ...css.input, fontSize: 12, padding: "4px 8px", flex: 1 }}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Observação da separação..."
              autoFocus
            />
            <button style={css.btnSm(G.green)} onClick={saveObs} disabled={saving}>✓</button>
            <button style={css.btnSm(G.muted)} onClick={() => { setObs(item.observacao_separacao || ""); setEditingObs(false); }}>✕</button>
          </div>
        ) : (
          item.observacao_separacao && (
            <div
              style={{ fontSize: 11, color: G.amber, marginTop: 2, cursor: closed ? "default" : "pointer" }}
              onClick={() => !closed && setEditingObs(true)}
            >
              📝 {item.observacao_separacao}
            </div>
          )
        )}
      </div>

      {/* Actions */}
      {!closed && (
        <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
          {!editingObs && (
            <button
              style={{ ...css.btnSm(G.muted), fontSize: 11 }}
              onClick={() => setEditingObs(true)}
              title="Observação"
            >
              📝
            </button>
          )}
          <button
            style={{
              ...css.btnSm(item.falta_compra ? G.red : G.cardBorder),
              fontSize: 11,
              border: `1px solid ${item.falta_compra ? G.red : G.cardBorder}`,
            }}
            onClick={() => {
              if (item.falta_compra) {
                patch({ falta_compra: false, observacao_falta: null });
              } else {
                const obs = prompt("Observação sobre a falta (opcional):");
                if (obs === null) return;
                patch({ falta_compra: true, observacao_falta: obs || null });
              }
            }}
            disabled={saving}
            title={item.falta_compra ? "Cancelar falta" : "Marcar falta para compra"}
          >
            {item.falta_compra ? "🛒 Falta" : "🛒"}
          </button>
        </div>
      )}

      {/* Falta badge */}
      {item.falta_compra && (
        <div style={{ width: "100%", fontSize: 11, color: G.red, paddingLeft: 38 }}>
          ⚠️ Falta para compra{item.observacao_falta ? `: ${item.observacao_falta}` : ""}
        </div>
      )}
    </div>
  );
}

function SeparacaoView({ sep, onStatusChange, onItemUpdate }) {
  const grupos = groupByFaixa(sep.itens || []);
  const isClosed = sep.status === "fechado";
  const totalItens = sep.itens?.length || 0;
  const conferidos = sep.itens?.filter((i) => i.status === "conferido").length || 0;
  const faltas = sep.itens?.filter((i) => i.falta_compra).length || 0;

  return (
    <div style={{ ...css.card, padding: 0, overflow: "hidden", marginBottom: 16 }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${G.cardBorder}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>👤 {sep.idoso?.name || sep.idoso_id}</span>
        <span style={{ fontSize: 12, color: G.muted }}>
          {fmtDate(sep.semana_inicio)} → {fmtDate(sep.semana_fim)}
        </span>
        <span style={css.badge(STATUS_COLOR[sep.status])}>{STATUS_LABEL[sep.status]}</span>
        <span style={{ fontSize: 12, color: G.muted, marginLeft: "auto" }}>
          {conferidos}/{totalItens} conferidos
          {faltas > 0 && <span style={{ color: G.red, marginLeft: 8 }}>🛒 {faltas} falta(s)</span>}
        </span>

        {/* Status actions */}
        {sep.status === "rascunho" && (
          <button style={css.btnSm(G.amber)} onClick={() => onStatusChange(sep.id, "em_separacao")}>Liberar</button>
        )}
        {sep.status === "em_separacao" && (
          <>
            <button style={css.btnSm(G.muted)} onClick={() => onStatusChange(sep.id, "rascunho")}>Voltar rascunho</button>
            <button style={css.btnSm(G.green)} onClick={() => {
              if (confirm("Fechar esta semana? A cuidadora não poderá mais alterar.")) onStatusChange(sep.id, "fechado");
            }}>Fechar semana</button>
          </>
        )}
        {sep.status === "fechado" && (
          <button style={css.btnSm(G.amber)} onClick={() => onStatusChange(sep.id, "em_separacao")}>Reabrir</button>
        )}
      </div>

      {/* Itens por faixa */}
      {grupos.length === 0 && (
        <div style={{ padding: 24, color: G.muted, textAlign: "center" }}>Nenhum item nesta separação.</div>
      )}
      {grupos.map(({ faixa, itens }) => (
        <div key={faixa}>
          <div style={{ padding: "8px 16px", background: G.bg, fontSize: 12, fontWeight: 700, color: G.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {FAIXA_LABEL[faixa] || faixa}
          </div>
          {itens.map((item) => (
            <ItemRow key={item.id} item={item} sep={sep} isMobile={false} onUpdate={onItemUpdate} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function SeparacaoPage({ elders }) {
  const isMobile = useMobile();
  const [section, setSection] = useState("separacoes");
  const [separacoes, setSeparacoes] = useState([]);
  const [listaCompra, setListaCompra] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Geração
  const [genElder, setGenElder] = useState("");
  const [genSemana, setGenSemana] = useState(() => getWeekRange(today())[0]);
  const [generating, setGenerating] = useState(false);

  // Filtros
  const [filterElder, setFilterElder] = useState("");
  const [filterSemana, setFilterSemana] = useState("");
  const [openSepId, setOpenSepId] = useState(null);

  const activeElders = (elders || []).filter((e) => e.active);

  const loadSeparacoes = async () => {
    setLoading(true);
    try {
      const rows = await api.get("/separacoes-semanais");
      setSeparacoes(rows);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const loadListaCompra = async () => {
    try {
      const params = filterSemana ? `?semana_inicio=${filterSemana}` : "";
      const data = await api.get(`/separacoes-semanais/lista-compra/consolidado${params}`);
      setListaCompra(data.items || []);
    } catch (e) { setError(e.message); }
  };

  useEffect(() => { loadSeparacoes(); }, []);
  useEffect(() => { if (section === "compra") loadListaCompra(); }, [section, filterSemana]);

  const gerar = async () => {
    if (!genElder) return setError("Selecione o idoso.");
    if (!genSemana) return setError("Informe a semana.");
    setGenerating(true);
    try {
      const result = await api.post("/separacoes-semanais/gerar", {
        idoso_id: genElder, semana_inicio: genSemana,
      });
      setSeparacoes((prev) => [result, ...prev]);
      setOpenSepId(result.id);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setGenerating(false); }
  };

  const handleStatusChange = async (sepId, status) => {
    try {
      const updated = await api.patch(`/separacoes-semanais/${sepId}/status`, { status });
      setSeparacoes((prev) => prev.map((s) => (s.id === sepId ? updated : s)));
    } catch (e) { setError(e.message); }
  };

  const handleItemUpdate = (updatedItem) => {
    setSeparacoes((prev) => prev.map((s) => {
      if (!s.itens) return s;
      const idx = s.itens.findIndex((i) => i.id === updatedItem.id);
      if (idx < 0) return s;
      const newItens = [...s.itens];
      newItens[idx] = updatedItem;
      return { ...s, itens: newItens };
    }));
  };

  const filteredSeparacoes = separacoes.filter((s) => {
    if (filterElder && s.idoso_id !== filterElder) return false;
    if (filterSemana && s.semana_inicio !== filterSemana) return false;
    return true;
  });

  // Separações with full item data (only the open one)
  const [fullSep, setFullSep] = useState(null);
  const loadFull = async (id) => {
    try {
      const data = await api.get(`/separacoes-semanais/${id}`);
      setSeparacoes((prev) => prev.map((s) => (s.id === id ? data : s)));
    } catch (e) { setError(e.message); }
  };

  const toggleOpen = (id) => {
    if (openSepId === id) { setOpenSepId(null); return; }
    setOpenSepId(id);
    const s = separacoes.find((s) => s.id === id);
    if (!s?.itens) loadFull(id);
  };

  const sectionBtnStyle = (s) => ({
    padding: "6px 16px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600,
    cursor: "pointer", background: section === s ? G.accent : "transparent",
    color: section === s ? "#fff" : G.muted,
  });

  // Group lista compra by medicamento_nome
  const compraGrouped = listaCompra.reduce((acc, item) => {
    const k = item.medicamento_nome;
    if (!acc[k]) acc[k] = { nome: k, dose: item.dose, idosos: [] };
    acc[k].idosos.push({ nome: item.idoso_nome, faixa: item.faixa_horario, obs: item.observacao_falta });
    return acc;
  }, {});

  return (
    <div>
      <ErrorBanner msg={error} />

      {/* Section tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        <button style={sectionBtnStyle("separacoes")} onClick={() => setSection("separacoes")}>📦 Separações</button>
        <button style={sectionBtnStyle("compra")} onClick={() => setSection("compra")}>🛒 Lista de compra</button>
      </div>

      {/* ── Separações ─────────────────────────────────────────── */}
      {section === "separacoes" && (
        <div>
          {/* Geração */}
          <div style={{ ...css.card, marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: G.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>Gerar separação semanal</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={css.label}>Idoso</label>
                <select style={css.select} value={genElder} onChange={(e) => setGenElder(e.target.value)}>
                  <option value="">Selecione...</option>
                  {activeElders.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={css.label}>Semana (segunda-feira)</label>
                <input type="date" style={css.input} value={genSemana} onChange={(e) => setGenSemana(e.target.value)} />
              </div>
              <button style={css.btn(G.green)} onClick={gerar} disabled={generating}>
                {generating ? "Gerando..." : "⚡ Gerar"}
              </button>
            </div>
          </div>

          {/* Filtros */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <select style={{ ...css.select, width: "auto", minWidth: 160 }} value={filterElder} onChange={(e) => setFilterElder(e.target.value)}>
              <option value="">Todos os idosos</option>
              {activeElders.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <input
              type="date" style={{ ...css.input, width: "auto" }}
              value={filterSemana} onChange={(e) => setFilterSemana(e.target.value)}
              placeholder="Filtrar por semana"
            />
            {(filterElder || filterSemana) && (
              <button style={css.btnGhost} onClick={() => { setFilterElder(""); setFilterSemana(""); }}>Limpar filtros</button>
            )}
          </div>

          {loading && <div style={{ color: G.muted, padding: 24 }}>⏳ Carregando...</div>}

          {!loading && filteredSeparacoes.length === 0 && (
            <div style={{ ...css.card, color: G.muted, textAlign: "center", padding: 32 }}>
              Nenhuma separação encontrada.
            </div>
          )}

          {filteredSeparacoes.map((sep) => {
            const isOpen = openSepId === sep.id;
            return (
              <div key={sep.id}>
                {/* Summary row (collapsed) */}
                {!isOpen && (
                  <div
                    style={{ ...css.card, marginBottom: 8, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flexWrap: "wrap" }}
                    onClick={() => toggleOpen(sep.id)}
                  >
                    <span style={{ fontWeight: 700, fontSize: 14 }}>
                      👤 {(elders || []).find((e) => e.id === sep.idoso_id)?.name || sep.idoso_id}
                    </span>
                    <span style={{ fontSize: 12, color: G.muted }}>
                      {fmtDate(sep.semana_inicio)} → {fmtDate(sep.semana_fim)}
                    </span>
                    <span style={css.badge(STATUS_COLOR[sep.status])}>{STATUS_LABEL[sep.status]}</span>
                    <span style={{ color: G.muted, marginLeft: "auto", fontSize: 18 }}>▼</span>
                  </div>
                )}

                {/* Expanded */}
                {isOpen && (
                  <div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}
                      onClick={() => setOpenSepId(null)}
                    >
                      <span style={{ color: G.muted, fontSize: 12 }}>▲ Fechar</span>
                    </div>
                    <SeparacaoView
                      sep={sep}
                      onStatusChange={handleStatusChange}
                      onItemUpdate={handleItemUpdate}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Lista de compra ────────────────────────────────────── */}
      {section === "compra" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <h2 style={{ ...css.h1, margin: 0 }}>Lista de Compra</h2>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <input
                type="date" style={{ ...css.input, width: "auto" }}
                value={filterSemana} onChange={(e) => setFilterSemana(e.target.value)}
                placeholder="Filtrar por semana"
              />
              {filterSemana && <button style={css.btnGhost} onClick={() => setFilterSemana("")}>Limpar</button>}
            </div>
          </div>

          {listaCompra.length === 0 && (
            <div style={{ ...css.card, color: G.muted, textAlign: "center", padding: 32 }}>
              Nenhum item marcado como falta para compra.
            </div>
          )}

          {Object.values(compraGrouped).map((group) => (
            <div key={group.nome} style={{ ...css.card, marginBottom: 10, padding: "12px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>💊 {group.nome}</span>
                <span style={{ fontSize: 12, color: G.muted }}>{group.dose}</span>
                <span style={{ ...css.badge(G.red), marginLeft: "auto" }}>{group.idosos.length} idoso(s)</span>
              </div>
              {group.idosos.map((i, idx) => (
                <div key={idx} style={{ fontSize: 12, color: G.muted, padding: "2px 0" }}>
                  👤 {i.nome} — {FAIXA_LABEL[i.faixa] || i.faixa}
                  {i.obs && <span style={{ color: G.amber }}> — {i.obs}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
