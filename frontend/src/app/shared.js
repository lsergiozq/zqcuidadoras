import { createContext, useContext, useEffect, useState } from "react";

export const fmt = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
export const fmtDate = (date) => {
  if (!date) return "";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
};
export const today = () => new Date().toISOString().slice(0, 10);
export const currentTimeHHmm = () => new Date().toTimeString().slice(0, 5);
export const monthName = (month) => ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"][month - 1];
export const getWeekRange = (dateStr) => {
  const date = new Date(`${dateStr}T12:00:00`);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return [monday.toISOString().slice(0, 10), sunday.toISOString().slice(0, 10)];
};
export const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();

export const shiftLabel = { Day12h: "Diurno 12h", Night12h: "Noturno 12h", Full24h: "24 horas" };
export const shiftIcon = { Day12h: "☀️", Night12h: "🌙", Full24h: "🌗" };
export const shiftColor = { Day12h: "#f59e0b", Night12h: "#6366f1", Full24h: "#10b981" };
export const MEASUREMENT_PERIOD_OPTIONS = [
  "Antes do Café da Manhã",
  "Antes do Almoço",
  "Antes do Café da Tarde",
];

export const G = {
  bg: "#0f1117",
  card: "#181d27",
  cardBorder: "#252c3b",
  text: "#e8eaf0",
  muted: "#6b7280",
  accent: "#3b82f6",
  green: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
  purple: "#8b5cf6",
  teal: "#14b8a6",
  input: "#1e2535",
  inputBorder: "#2d3748",
};

export const css = {
  page: { minHeight: "100vh", background: G.bg, color: G.text, fontFamily: "'DM Sans','Segoe UI',sans-serif", display: "flex", flexDirection: "column" },
  topbar: { background: G.card, borderBottom: `1px solid ${G.cardBorder}`, padding: "0 16px", display: "flex", alignItems: "center", gap: 12, height: 56, position: "sticky", top: 0, zIndex: 100 },
  logo: { fontSize: 18, fontWeight: 700, color: G.accent, letterSpacing: "-0.5px", flexShrink: 0 },
  main: { flex: 1, padding: "20px 16px", maxWidth: 1100, margin: "0 auto", width: "100%", boxSizing: "border-box" },
  mainMobile: { flex: 1, padding: "14px 12px 80px", width: "100%", boxSizing: "border-box" },
  card: { background: G.card, border: `1px solid ${G.cardBorder}`, borderRadius: 14, padding: 22 },
  cardMobile: { background: G.card, border: `1px solid ${G.cardBorder}`, borderRadius: 12, padding: 14 },
  h1: { fontSize: 20, fontWeight: 700, margin: "0 0 16px", letterSpacing: "-0.3px" },
  h2: { fontSize: 15, fontWeight: 600, margin: "0 0 12px", color: G.text },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: G.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" },
  input: { width: "100%", boxSizing: "border-box", background: G.input, border: `1px solid ${G.inputBorder}`, color: G.text, borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none" },
  select: { width: "100%", boxSizing: "border-box", background: G.input, border: `1px solid ${G.inputBorder}`, color: G.text, borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none", cursor: "pointer" },
  btn: (color = G.accent) => ({ background: color, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }),
  btnSm: (color = G.accent) => ({ background: color, color: "#fff", border: "none", borderRadius: 6, padding: "5px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer" }),
  btnGhost: { background: "transparent", color: G.muted, border: `1px solid ${G.cardBorder}`, borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  grid: (cols) => ({ display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gap: 16 }),
  badge: (color) => ({ display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: color + "22", color, border: `1px solid ${color}44` }),
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "10px 14px", fontSize: 12, fontWeight: 700, color: G.muted, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: `1px solid ${G.cardBorder}` },
  td: { padding: "11px 14px", fontSize: 14, borderBottom: `1px solid ${G.cardBorder}22` },
};

export const MobileCtx = createContext(false);
export const useMobile = () => useContext(MobileCtx);

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 700);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return isMobile;
}
