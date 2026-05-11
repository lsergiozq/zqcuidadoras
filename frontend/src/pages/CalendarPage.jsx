import { useMemo, useState } from "react";
import { G, css, fmt, fmtDate, getDaysInMonth, monthName, shiftColor, shiftIcon, shiftLabel, today, useMobile } from "../app/shared";

export default function CalendarPage({ caregivers, shifts, extras }) {
  const isMobile = useMobile();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selected, setSelected] = useState(null);
  const days = getDaysInMonth(year, month);
  const firstDay = new Date(year, month - 1, 1).getDay();
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const byDay = useMemo(() => {
    const map = {};
    shifts.filter((shift) => shift.shift_date.startsWith(prefix)).forEach((shift) => {
      const day = parseInt(shift.shift_date.split("-")[2]);
      if (!map[day]) map[day] = { shifts: [], extras: [] };
      map[day].shifts.push(shift);
    });
    extras.filter((extra) => extra.charge_date.startsWith(prefix)).forEach((extra) => {
      const day = parseInt(extra.charge_date.split("-")[2]);
      if (!map[day]) map[day] = { shifts: [], extras: [] };
      map[day].extras.push(extra);
    });
    return map;
  }, [shifts, extras, year, month]);

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
    setSelected(null);
  };

  const selectedDate = selected ? `${year}-${String(month).padStart(2, "0")}-${String(selected).padStart(2, "0")}` : null;
  const selectedData = selected ? byDay[selected] : null;
  const selectedTotal = selectedData ? [...selectedData.shifts, ...selectedData.extras].reduce((total, item) => total + Number(item.value), 0) : 0;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h1 style={{ ...css.h1, margin: 0 }}>📅 Calendário</h1>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <button style={css.btnGhost} onClick={() => changeMonth(-1)}>‹</button>
          <span style={{ fontWeight: 700, minWidth: isMobile ? 110 : 140, textAlign: "center", fontSize: isMobile ? 13 : 15 }}>{monthName(month)} {year}</span>
          <button style={css.btnGhost} onClick={() => changeMonth(1)}>›</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexDirection: isMobile ? "column" : "row" }}>
        <div style={{ ...css.card, flex: 1, width: "100%", padding: isMobile ? 10 : 16, boxSizing: "border-box" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
            {["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => <div key={index} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: G.muted, padding: "3px 0" }}>{day}</div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
            {Array(firstDay).fill(null).map((_, index) => <div key={`empty-${index}`} />)}
            {Array(days).fill(null).map((_, index) => {
              const day = index + 1;
              const data = byDay[day] || { shifts: [], extras: [] };
              const total = [...data.shifts, ...data.extras].reduce((sum, item) => sum + Number(item.value), 0);
              const isToday = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` === today();
              const isSelected = selected === day;
              return (
                <div key={day} onClick={() => setSelected(day === selected ? null : day)} style={{ background: isSelected ? G.accent : isToday ? G.accent + "22" : G.input, border: `1px solid ${isSelected ? G.accent : isToday ? G.accent : G.cardBorder}`, borderRadius: 6, padding: isMobile ? "3px 2px" : "5px 6px", minHeight: isMobile ? 52 : 70, cursor: "pointer" }}>
                  <div style={{ fontSize: isMobile ? 10 : 11, fontWeight: 700, color: isSelected ? "#fff" : isToday ? G.accent : G.muted, marginBottom: 1 }}>{day}</div>
                  {!isMobile && data.shifts.slice(0, 2).map((shift) => {
                    const caregiver = caregivers.find((item) => item.id === shift.caregiver_id);
                    return <div key={shift.id} style={{ fontSize: 9, padding: "1px 3px", borderRadius: 3, marginBottom: 1, background: isSelected ? "#ffffff22" : shiftColor[shift.shift_type] + "22", color: isSelected ? "#fff" : shiftColor[shift.shift_type], overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{shiftIcon[shift.shift_type]} {caregiver?.name?.split(" ")[0] || "?"}</div>;
                  })}
                  {!isMobile && data.extras.slice(0, 1).map((extra) => <div key={extra.id} style={{ fontSize: 9, padding: "1px 3px", borderRadius: 3, marginBottom: 1, background: isSelected ? "#ffffff22" : G.teal + "22", color: isSelected ? "#fff" : G.teal, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>💊</div>)}
                  {isMobile && (data.shifts.length + data.extras.length) > 0 && <div style={{ fontSize: 9, color: isSelected ? "#fff" : G.accent, fontWeight: 700 }}>●{data.shifts.length + data.extras.length}</div>}
                  {total > 0 && <div style={{ fontSize: 9, fontWeight: 700, color: isSelected ? "#fff" : G.green, marginTop: 1 }}>{isMobile ? fmt(total).replace("R$", "").trim() : fmt(total)}</div>}
                </div>
              );
            })}
          </div>
        </div>
        {selected && (
          <div style={{ ...css.card, width: isMobile ? "100%" : 300, flexShrink: 0 }}>
            <h2 style={{ ...css.h2, marginBottom: 16 }}>📅 {fmtDate(selectedDate)}</h2>
            {!selectedData && <div style={{ color: G.muted, fontSize: 13 }}>Nenhum lançamento</div>}
            {selectedData?.shifts.map((shift) => {
              const caregiver = caregivers.find((item) => item.id === shift.caregiver_id);
              return (
                <div key={shift.id} style={{ padding: "10px 0", borderBottom: `1px solid ${G.cardBorder}22` }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontWeight: 600 }}>{caregiver?.name || "—"}</span><span style={{ fontWeight: 700 }}>{fmt(shift.value)}</span></div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}><span style={css.badge(shiftColor[shift.shift_type])}>{shiftIcon[shift.shift_type]} {shiftLabel[shift.shift_type]}</span><span style={css.badge(shift.payment_status === "Paid" ? G.green : G.amber)}>{shift.payment_status === "Paid" ? "Pago" : "Pendente"}</span></div>
                </div>
              );
            })}
            {selectedData?.extras.map((extra) => {
              const caregiver = caregivers.find((item) => item.id === extra.caregiver_id);
              return (
                <div key={extra.id} style={{ padding: "10px 0", borderBottom: `1px solid ${G.cardBorder}22` }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontWeight: 600 }}>{caregiver?.name || "—"}</span><span style={{ fontWeight: 700, color: G.teal }}>{fmt(extra.value)}</span></div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}><span style={css.badge(G.teal)}>💊 {extra.description}</span><span style={css.badge(extra.payment_status === "Paid" ? G.green : G.amber)}>{extra.payment_status === "Paid" ? "Pago" : "Pendente"}</span></div>
                </div>
              );
            })}
            {selectedTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, fontWeight: 800 }}><span>Total do dia</span><span style={{ color: G.green }}>{fmt(selectedTotal)}</span></div>}
          </div>
        )}
      </div>
    </div>
  );
}
