import { G, css, fmt, getWeekRange, shiftColor, shiftIcon, shiftLabel, today, useMobile } from "../app/shared";
import { StatCard } from "../components/ui";

export default function DashboardPage({ caregivers, shifts, extras }) {
  const isMobile = useMobile();
  const currentDate = today();
  const [weekStart, weekEnd] = getWeekRange(currentDate);
  const monthPrefix = currentDate.slice(0, 7);
  const allEntries = [...shifts.map((shift) => ({ ...shift, date: shift.shift_date })), ...extras.map((extra) => ({ ...extra, date: extra.charge_date }))];
  const sum = (items) => items.reduce((total, item) => total + Number(item.value), 0);
  const pendingByCaregiver = caregivers
    .map((caregiver) => ({ caregiver, value: sum(allEntries.filter((item) => item.caregiver_id === caregiver.id && item.payment_status === "Pending")) }))
    .filter((item) => item.value > 0);

  return (
    <div>
      <h1 style={css.h1}>📊 Dashboard</h1>
      <div style={{ ...css.grid(isMobile ? 2 : 2), marginBottom: 16 }}>
        <StatCard label="Gasto Hoje" value={fmt(sum(allEntries.filter((item) => item.date === currentDate)))} color={G.green} icon="📅" />
        <StatCard label="Gasto na Semana" value={fmt(sum(allEntries.filter((item) => item.date >= weekStart && item.date <= weekEnd)))} color={G.accent} icon="📆" />
        <StatCard label="Gasto no Mês" value={fmt(sum(allEntries.filter((item) => item.date.startsWith(monthPrefix))))} color={G.purple} icon="🗓️" />
        <StatCard label="Pendente de Pagamento" value={fmt(sum(allEntries.filter((item) => item.payment_status === "Pending")))} color={G.amber} icon="⏳" />
      </div>
      {pendingByCaregiver.length > 0 && (
        <div style={{ ...css.card, marginBottom: 16 }}>
          <h2 style={css.h2}>⚠️ Cuidadoras com pagamento pendente</h2>
          {pendingByCaregiver.map(({ caregiver, value }) => (
            <div key={caregiver.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${G.cardBorder}22` }}>
              <span>{caregiver.name}</span>
              <span style={{ color: G.amber, fontWeight: 700 }}>{fmt(value)}</span>
            </div>
          ))}
        </div>
      )}
      {(() => {
        const todayShifts = shifts.filter((shift) => shift.shift_date === currentDate);
        const todayExtras = extras.filter((extra) => extra.charge_date === currentDate);
        if (!todayShifts.length && !todayExtras.length) return null;
        return (
          <div style={css.card}>
            <h2 style={css.h2}>📋 Lançamentos de Hoje</h2>
            {todayShifts.map((shift) => {
              const caregiver = caregivers.find((item) => item.id === shift.caregiver_id);
              return (
                <div key={shift.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${G.cardBorder}22` }}>
                  <div>
                    <span style={{ marginRight: 8 }}>{shiftIcon[shift.shift_type]}</span>
                    <span>{caregiver?.name || "—"}</span>
                    <span style={{ ...css.badge(shiftColor[shift.shift_type]), marginLeft: 8 }}>{shiftLabel[shift.shift_type]}</span>
                  </div>
                  <span style={{ fontWeight: 700 }}>{fmt(shift.value)}</span>
                </div>
              );
            })}
            {todayExtras.map((extra) => {
              const caregiver = caregivers.find((item) => item.id === extra.caregiver_id);
              return (
                <div key={extra.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${G.cardBorder}22` }}>
                  <div>
                    <span style={{ marginRight: 8 }}>💊</span>
                    <span>{caregiver?.name || "—"}</span>
                    <span style={{ ...css.badge(G.teal), marginLeft: 8 }}>{extra.description}</span>
                  </div>
                  <span style={{ fontWeight: 700 }}>{fmt(extra.value)}</span>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
