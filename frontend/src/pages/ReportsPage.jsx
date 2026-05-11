import { useCallback, useEffect, useState } from "react";
import { api } from "../app/api";
import { G, css, fmt, fmtDate, today, useMobile } from "../app/shared";
import { ErrorBanner, Field } from "../components/ui";

export default function ReportsPage({ caregivers, elders }) {
  const isMobile = useMobile();
  const monthStart = `${today().slice(0, 7)}-01`;
  const [measurementFilter, setMeasurementFilter] = useState({ start_date: monthStart, end_date: today(), elder_id: "" });
  const [paymentFilter, setPaymentFilter] = useState({ start_date: monthStart, end_date: today(), caregiver_id: "" });
  const [measurementReport, setMeasurementReport] = useState({ items: [] });
  const [paymentReport, setPaymentReport] = useState({ items: [], summary: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const buildQuery = (params) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    const queryString = query.toString();
    return queryString ? `?${queryString}` : "";
  };

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [measurements, payments] = await Promise.all([
        api.get(`/reports/measurements${buildQuery(measurementFilter)}`),
        api.get(`/reports/caregiver-payments${buildQuery(paymentFilter)}`),
      ]);
      setMeasurementReport(measurements);
      setPaymentReport(payments);
    } catch (error) {
      setError(error.message || "Não foi possível carregar os relatórios.");
    } finally {
      setLoading(false);
    }
  }, [measurementFilter, paymentFilter]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const toCsvValue = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const downloadCsv = (filename, headers, rows) => {
    const lines = [headers.map(toCsvValue).join(";"), ...rows.map((row) => row.map(toCsvValue).join(";"))];
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printTable = (title, headers, rows) => {
    const popup = window.open("", "_blank", "noopener,noreferrer,width=980,height=720");
    if (!popup) return;
    popup.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            h1 { margin: 0 0 16px; font-size: 22px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: left; font-size: 12px; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <table>
            <thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
            <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>
          </table>
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const measurementRows = measurementReport.items.map((item) => [fmtDate(item.charge_date), item.elder_name || "—", item.caregiver_name || "—", item.service_type_name || item.description || "—", item.measurement_period || "—", item.glucose_value ?? "—", fmt(item.value)]);
  const paymentSummaryRows = paymentReport.summary.map((item) => [item.caregiver_name, item.pix_key || "—", fmt(item.total)]);
  const paymentItemRows = paymentReport.items.map((item) => [fmtDate(item.event_date), item.caregiver_name, item.label || item.source, fmt(item.value)]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <h1 style={{ ...css.h1, margin: 0 }}>📑 Relatórios</h1>
        <button style={{ ...css.btn(), marginLeft: "auto" }} onClick={loadReports} disabled={loading}>{loading ? "Atualizando..." : "Atualizar"}</button>
      </div>
      <ErrorBanner msg={error} />
      <div style={{ ...css.grid(isMobile ? 1 : 2), marginBottom: 16 }}>
        <div style={css.card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <h2 style={{ ...css.h2, margin: 0 }}>Medições por Idoso</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={css.btnSm(G.teal)} onClick={() => downloadCsv("relatorio-medicoes.csv", ["Data", "Idoso", "Cuidadora", "Serviço", "Período", "Glicose", "Valor"], measurementRows)}>CSV</button>
              <button style={css.btnSm(G.accent)} onClick={() => printTable("Relatório de Medições", ["Data", "Idoso", "Cuidadora", "Serviço", "Período", "Glicose", "Valor"], measurementRows)}>Imprimir</button>
            </div>
          </div>
          <div style={css.grid(isMobile ? 1 : 3)}>
            <Field label="Início"><input type="date" style={css.input} value={measurementFilter.start_date} onChange={(event) => setMeasurementFilter({ ...measurementFilter, start_date: event.target.value })} /></Field>
            <Field label="Fim"><input type="date" style={css.input} value={measurementFilter.end_date} onChange={(event) => setMeasurementFilter({ ...measurementFilter, end_date: event.target.value })} /></Field>
            <Field label="Idoso"><select style={css.select} value={measurementFilter.elder_id} onChange={(event) => setMeasurementFilter({ ...measurementFilter, elder_id: event.target.value })}><option value="">Todos</option>{elders.map((elder) => <option key={elder.id} value={elder.id}>{elder.name}</option>)}</select></Field>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={css.table}>
              <thead><tr>{["Data", "Idoso", "Cuidadora", "Serviço", "Período", "Glicose", "Valor"].map((label) => <th key={label} style={css.th}>{label}</th>)}</tr></thead>
              <tbody>
                {measurementReport.items.length === 0 && <tr><td colSpan={7} style={{ ...css.td, color: G.muted, textAlign: "center", padding: 24 }}>Nenhuma medição encontrada</td></tr>}
                {measurementReport.items.map((item) => <tr key={item.id}><td style={css.td}>{fmtDate(item.charge_date)}</td><td style={css.td}>{item.elder_name || "—"}</td><td style={css.td}>{item.caregiver_name || "—"}</td><td style={css.td}>{item.service_type_name || item.description || "—"}</td><td style={css.td}>{item.measurement_period || "—"}</td><td style={css.td}>{item.glucose_value ?? "—"}</td><td style={css.td}>{fmt(item.value)}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
        <div style={css.card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <h2 style={{ ...css.h2, margin: 0 }}>Pagamento por Cuidadora</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={css.btnSm(G.teal)} onClick={() => downloadCsv("relatorio-pagamentos-resumo.csv", ["Cuidadora", "PIX", "Total"], paymentSummaryRows)}>CSV Resumo</button>
              <button style={css.btnSm(G.accent)} onClick={() => printTable("Relatório de Pagamentos", ["Cuidadora", "PIX", "Total"], paymentSummaryRows)}>Imprimir</button>
            </div>
          </div>
          <div style={css.grid(isMobile ? 1 : 3)}>
            <Field label="Início"><input type="date" style={css.input} value={paymentFilter.start_date} onChange={(event) => setPaymentFilter({ ...paymentFilter, start_date: event.target.value })} /></Field>
            <Field label="Fim"><input type="date" style={css.input} value={paymentFilter.end_date} onChange={(event) => setPaymentFilter({ ...paymentFilter, end_date: event.target.value })} /></Field>
            <Field label="Cuidadora"><select style={css.select} value={paymentFilter.caregiver_id} onChange={(event) => setPaymentFilter({ ...paymentFilter, caregiver_id: event.target.value })}><option value="">Todas</option>{caregivers.map((caregiver) => <option key={caregiver.id} value={caregiver.id}>{caregiver.name}</option>)}</select></Field>
          </div>
          <div style={{ overflowX: "auto", marginBottom: 16 }}>
            <table style={css.table}>
              <thead><tr>{["Cuidadora", "PIX", "Total"].map((label) => <th key={label} style={css.th}>{label}</th>)}</tr></thead>
              <tbody>
                {paymentReport.summary.length === 0 && <tr><td colSpan={3} style={{ ...css.td, color: G.muted, textAlign: "center", padding: 24 }}>Nenhum pagamento pendente encontrado</td></tr>}
                {paymentReport.summary.map((item) => <tr key={item.caregiver_id}><td style={css.td}>{item.caregiver_name}</td><td style={css.td}>{item.pix_key || "—"}</td><td style={css.td}>{fmt(item.total)}</td></tr>)}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Itens Pendentes</h3>
            <button style={css.btnSm(G.purple)} onClick={() => downloadCsv("relatorio-pagamentos-itens.csv", ["Data", "Cuidadora", "Lançamento", "Valor"], paymentItemRows)}>CSV Itens</button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={css.table}>
              <thead><tr>{["Data", "Cuidadora", "Lançamento", "Valor"].map((label) => <th key={label} style={css.th}>{label}</th>)}</tr></thead>
              <tbody>
                {paymentReport.items.length === 0 && <tr><td colSpan={4} style={{ ...css.td, color: G.muted, textAlign: "center", padding: 24 }}>Nenhum item pendente encontrado</td></tr>}
                {paymentReport.items.map((item) => <tr key={`${item.source}-${item.source_id}`}><td style={css.td}>{fmtDate(item.event_date)}</td><td style={css.td}>{item.caregiver_name}</td><td style={css.td}>{item.label || item.source}</td><td style={css.td}>{fmt(item.value)}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
