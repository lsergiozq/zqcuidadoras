import { useState } from "react";
import { api } from "../app/api";
import { G, css, fmt, monthName, today, useMobile } from "../app/shared";
import { StatCard } from "../components/ui";

export default function MonthlyClosePage({ caregivers, shifts, setShifts, extras, setExtras }) {
  const isMobile = useMobile();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const monthShifts = shifts.filter((shift) => shift.shift_date.startsWith(monthPrefix));
  const monthExtras = extras.filter((extra) => extra.charge_date.startsWith(monthPrefix));
  const sum = (items) => items.reduce((total, item) => total + Number(item.value), 0);

  const markAllPaid = async (caregiverId) => {
    const paymentDate = today();
    const updatedShifts = await Promise.all(monthShifts.filter((shift) => shift.caregiver_id === caregiverId && shift.payment_status === "Pending").map((shift) => api.patch(`/shifts/${shift.id}/payment`, { payment_status: "Paid", payment_date: paymentDate })));
    const updatedExtras = await Promise.all(monthExtras.filter((extra) => extra.caregiver_id === caregiverId && extra.payment_status === "Pending").map((extra) => api.patch(`/extra-charges/${extra.id}/payment`, { payment_status: "Paid", payment_date: paymentDate })));
    setShifts(shifts.map((shift) => updatedShifts.find((item) => item.id === shift.id) || shift));
    setExtras(extras.map((extra) => updatedExtras.find((item) => item.id === extra.id) || extra));
  };

  const changeMonth = (delta) => {
    let nextMonth = month + delta;
    let nextYear = year;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    }
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    setMonth(nextMonth);
    setYear(nextYear);
  };

  const caregiversWithItems = caregivers.filter((caregiver) => [...monthShifts, ...monthExtras].some((item) => item.caregiver_id === caregiver.id));
  const allItems = [...monthShifts, ...monthExtras];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h1 style={{ ...css.h1, margin: 0 }}>🗓️ Mensal</h1>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <button style={css.btnGhost} onClick={() => changeMonth(-1)}>‹</button>
          <span style={{ fontWeight: 700, minWidth: isMobile ? 110 : 160, textAlign: "center", fontSize: isMobile ? 13 : 15 }}>{monthName(month)} {year}</span>
          <button style={css.btnGhost} onClick={() => changeMonth(1)}>›</button>
        </div>
      </div>
      <div style={{ ...css.grid(isMobile ? 1 : 3), marginBottom: 16 }}>
        <StatCard label="Total do Mês" value={fmt(sum(allItems))} color={G.accent} icon="💰" />
        <StatCard label="Total Pago" value={fmt(sum(allItems.filter((item) => item.payment_status === "Paid")))} color={G.green} icon="✅" />
        <StatCard label="Pendente" value={fmt(sum(allItems.filter((item) => item.payment_status === "Pending")))} color={G.amber} icon="⏳" />
      </div>
      {caregiversWithItems.length === 0 && <div style={{ ...css.card, color: G.muted, textAlign: "center", padding: 40 }}>Nenhum lançamento neste mês</div>}
      {caregiversWithItems.map((caregiver) => {
        const caregiverShifts = monthShifts.filter((shift) => shift.caregiver_id === caregiver.id);
        const caregiverExtras = monthExtras.filter((extra) => extra.caregiver_id === caregiver.id);
        const total = sum(caregiverShifts) + sum(caregiverExtras);
        const pending = sum([...caregiverShifts, ...caregiverExtras].filter((item) => item.payment_status === "Pending"));
        const allPaid = [...caregiverShifts, ...caregiverExtras].every((item) => item.payment_status === "Paid");
        return (
          <div key={caregiver.id} style={{ ...css.card, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{caregiver.name}</span>
              <span style={css.badge(caregiver.payment_type === "Weekly" ? G.purple : G.accent)}>{caregiver.payment_type === "Weekly" ? "Semanal" : "Mensal"}</span>
              {allPaid && <span style={css.badge(G.green)}>✓ Pago</span>}
              {!allPaid && pending > 0 && <button style={{ ...css.btn(G.green), marginLeft: "auto", padding: "8px 14px", fontSize: 13 }} onClick={() => markAllPaid(caregiver.id)}>Marcar Pago</button>}
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 10 }}>
              {sum(caregiverShifts.filter((shift) => shift.shift_type === "Day12h")) > 0 && <div><div style={{ fontSize: 11, color: G.amber, fontWeight: 600 }}>☀️ Diurno</div><div style={{ fontWeight: 700 }}>{fmt(sum(caregiverShifts.filter((shift) => shift.shift_type === "Day12h")))}</div></div>}
              {sum(caregiverShifts.filter((shift) => shift.shift_type === "Night12h")) > 0 && <div><div style={{ fontSize: 11, color: G.purple, fontWeight: 600 }}>🌙 Noturno</div><div style={{ fontWeight: 700 }}>{fmt(sum(caregiverShifts.filter((shift) => shift.shift_type === "Night12h")))}</div></div>}
              {sum(caregiverShifts.filter((shift) => shift.shift_type === "Full24h")) > 0 && <div><div style={{ fontSize: 11, color: G.green, fontWeight: 600 }}>🌗 24h</div><div style={{ fontWeight: 700 }}>{fmt(sum(caregiverShifts.filter((shift) => shift.shift_type === "Full24h")))}</div></div>}
              {sum(caregiverExtras) > 0 && <div><div style={{ fontSize: 11, color: G.teal, fontWeight: 600 }}>💊 Avulsos</div><div style={{ fontWeight: 700, color: G.teal }}>{fmt(sum(caregiverExtras))}</div><div style={{ fontSize: 11, color: G.muted }}>{caregiverExtras.length} item(ns)</div></div>}
              <div style={{ marginLeft: "auto" }}><div style={{ fontSize: 11, color: G.muted, fontWeight: 600 }}>TOTAL</div><div style={{ fontWeight: 800, fontSize: 20, color: G.accent }}>{fmt(total)}</div></div>
            </div>
            <div style={{ fontSize: 12, color: G.muted }}>{caregiverShifts.length} plantão(ões) · {caregiverExtras.length} avulso(s) · {[...caregiverShifts, ...caregiverExtras].filter((item) => item.payment_status === "Paid").length} pago(s)</div>
          </div>
        );
      })}
    </div>
  );
}
