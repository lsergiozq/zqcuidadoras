import { useState } from "react";
import { api } from "../app/api";
import { G, css, fmt, fmtDate, getWeekRange, shiftColor, shiftIcon, shiftLabel, today, useMobile } from "../app/shared";

export default function WeeklyClosePage({ caregivers, shifts, setShifts, extras, setExtras }) {
  const isMobile = useMobile();
  const [weekDate, setWeekDate] = useState(today());
  const [weekStart, weekEnd] = getWeekRange(weekDate);
  const weekShifts = shifts.filter((shift) => shift.shift_date >= weekStart && shift.shift_date <= weekEnd);
  const weekExtras = extras.filter((extra) => extra.charge_date >= weekStart && extra.charge_date <= weekEnd);
  const weeklyCaregivers = caregivers.filter((caregiver) => caregiver.payment_type === "Weekly");
  const sum = (items) => items.reduce((total, item) => total + Number(item.value), 0);

  const markAllPaid = async (caregiverId) => {
    const paymentDate = today();
    const updatedShifts = await Promise.all(weekShifts.filter((shift) => shift.caregiver_id === caregiverId && shift.payment_status === "Pending").map((shift) => api.patch(`/shifts/${shift.id}/payment`, { payment_status: "Paid", payment_date: paymentDate })));
    const updatedExtras = await Promise.all(weekExtras.filter((extra) => extra.caregiver_id === caregiverId && extra.payment_status === "Pending").map((extra) => api.patch(`/extra-charges/${extra.id}/payment`, { payment_status: "Paid", payment_date: paymentDate })));
    setShifts(shifts.map((shift) => updatedShifts.find((item) => item.id === shift.id) || shift));
    setExtras(extras.map((extra) => updatedExtras.find((item) => item.id === extra.id) || extra));
  };

  return (
    <div>
      <h1 style={css.h1}>📆 Fechamento Semanal</h1>
      <div style={{ ...css.card, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160 }}><label style={css.label}>Semana de referência</label><input type="date" style={css.input} value={weekDate} onChange={(event) => setWeekDate(event.target.value)} /></div>
          <div style={{ padding: "10px 14px", background: G.accent + "22", borderRadius: 8, color: G.accent, fontWeight: 600, fontSize: 13 }}>{fmtDate(weekStart)} → {fmtDate(weekEnd)}</div>
        </div>
      </div>
      {weeklyCaregivers.length === 0 && <div style={{ ...css.card, color: G.muted, textAlign: "center", padding: 40 }}>Nenhuma cuidadora com pagamento semanal</div>}
      {weeklyCaregivers.map((caregiver) => {
        const caregiverShifts = weekShifts.filter((shift) => shift.caregiver_id === caregiver.id);
        const caregiverExtras = weekExtras.filter((extra) => extra.caregiver_id === caregiver.id);
        if (!caregiverShifts.length && !caregiverExtras.length) return null;
        const total = sum(caregiverShifts) + sum(caregiverExtras);
        const pending = sum([...caregiverShifts, ...caregiverExtras].filter((item) => item.payment_status === "Pending"));
        const allPaid = [...caregiverShifts, ...caregiverExtras].every((item) => item.payment_status === "Paid");
        return (
          <div key={caregiver.id} style={{ ...css.card, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{caregiver.name}</span>
              <span style={css.badge(G.purple)}>Semanal</span>
              {allPaid && <span style={css.badge(G.green)}>✓ Pago</span>}
              {!allPaid && pending > 0 && <button style={{ ...css.btn(G.green), marginLeft: "auto", padding: "8px 14px", fontSize: 13 }} onClick={() => markAllPaid(caregiver.id)}>Marcar Pago ({fmt(pending)})</button>}
            </div>
            {isMobile ? (
              <div>
                {caregiverShifts.map((shift) => (
                  <div key={shift.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${G.cardBorder}22`, opacity: shift.payment_status === "Paid" ? 0.6 : 1 }}>
                    <div><span style={css.badge(shiftColor[shift.shift_type])}>{shiftIcon[shift.shift_type]} {shiftLabel[shift.shift_type]}</span><div style={{ fontSize: 11, color: G.muted, marginTop: 2 }}>{fmtDate(shift.shift_date)}</div></div>
                    <div style={{ textAlign: "right" }}><div style={{ fontWeight: 700 }}>{fmt(shift.value)}</div><span style={css.badge(shift.payment_status === "Paid" ? G.green : G.amber)}>{shift.payment_status === "Paid" ? "Pago" : "Pend."}</span></div>
                  </div>
                ))}
                {caregiverExtras.map((extra) => (
                  <div key={extra.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${G.cardBorder}22`, opacity: extra.payment_status === "Paid" ? 0.6 : 1 }}>
                    <div><span style={css.badge(G.teal)}>💊 {extra.description}</span><div style={{ fontSize: 11, color: G.muted, marginTop: 2 }}>{fmtDate(extra.charge_date)}</div></div>
                    <div style={{ textAlign: "right" }}><div style={{ fontWeight: 700, color: G.teal }}>{fmt(extra.value)}</div><span style={css.badge(extra.payment_status === "Paid" ? G.green : G.amber)}>{extra.payment_status === "Paid" ? "Pago" : "Pend."}</span></div>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                {caregiverShifts.length > 0 && <><div style={{ fontSize: 12, fontWeight: 700, color: G.muted, marginBottom: 6, textTransform: "uppercase" }}>Plantões</div><table style={{ ...css.table, marginBottom: 12 }}><thead><tr>{["Data", "Tipo", "Valor", "Status"].map((label) => <th key={label} style={css.th}>{label}</th>)}</tr></thead><tbody>{caregiverShifts.map((shift) => <tr key={shift.id} style={{ opacity: shift.payment_status === "Paid" ? 0.6 : 1 }}><td style={css.td}>{fmtDate(shift.shift_date)}</td><td style={css.td}><span style={css.badge(shiftColor[shift.shift_type])}>{shiftIcon[shift.shift_type]} {shiftLabel[shift.shift_type]}</span></td><td style={{ ...css.td, fontWeight: 700 }}>{fmt(shift.value)}</td><td style={css.td}><span style={css.badge(shift.payment_status === "Paid" ? G.green : G.amber)}>{shift.payment_status === "Paid" ? "✓ Pago" : "Pendente"}</span></td></tr>)}</tbody></table></>}
                {caregiverExtras.length > 0 && <><div style={{ fontSize: 12, fontWeight: 700, color: G.teal, marginBottom: 6, textTransform: "uppercase" }}>💊 Avulsos</div><table style={{ ...css.table, marginBottom: 12 }}><thead><tr>{["Data", "Descrição", "Valor", "Status"].map((label) => <th key={label} style={css.th}>{label}</th>)}</tr></thead><tbody>{caregiverExtras.map((extra) => <tr key={extra.id} style={{ opacity: extra.payment_status === "Paid" ? 0.6 : 1 }}><td style={css.td}>{fmtDate(extra.charge_date)}</td><td style={css.td}>{extra.description}</td><td style={{ ...css.td, fontWeight: 700, color: G.teal }}>{fmt(extra.value)}</td><td style={css.td}><span style={css.badge(extra.payment_status === "Paid" ? G.green : G.amber)}>{extra.payment_status === "Paid" ? "✓ Pago" : "Pendente"}</span></td></tr>)}</tbody></table></>}
              </div>
            )}
            <div style={{ display: "flex", gap: 16, paddingTop: 10, borderTop: `1px solid ${G.cardBorder}`, flexWrap: "wrap" }}>
              {caregiverShifts.length > 0 && <span style={{ fontSize: 13, color: G.muted }}>Plantões: <strong style={{ color: G.text }}>{fmt(sum(caregiverShifts))}</strong></span>}
              {caregiverExtras.length > 0 && <span style={{ fontSize: 13, color: G.muted }}>Avulsos: <strong style={{ color: G.teal }}>{fmt(sum(caregiverExtras))}</strong></span>}
              <span style={{ fontSize: 14, fontWeight: 800, color: G.accent, marginLeft: "auto" }}>Total: {fmt(total)}</span>
            </div>
          </div>
        );
      })}
      {(weekShifts.length > 0 || weekExtras.length > 0) && (
        <div style={{ ...css.card, background: G.accent + "11", border: `1px solid ${G.accent}44` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div><div style={{ fontWeight: 700 }}>Total Geral da Semana</div><div style={{ fontSize: 12, color: G.muted, marginTop: 2 }}>Plantões: {fmt(sum(weekShifts))} · Avulsos: {fmt(sum(weekExtras))}</div></div>
            <span style={{ fontWeight: 800, fontSize: 20, color: G.accent }}>{fmt(sum(weekShifts) + sum(weekExtras))}</span>
          </div>
        </div>
      )}
    </div>
  );
}
