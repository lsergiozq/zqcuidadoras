import { G, css, useMobile } from "../app/shared";

export function Field({ label, children }) {
  return <div style={{ marginBottom: 16 }}><label style={css.label}>{label}</label>{children}</div>;
}

export function Modal({ title, onClose, children, wide }) {
  const isMobile = useMobile();
  const overlay = { position: "fixed", inset: 0, background: "#000a", zIndex: 200, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 20 };
  const box = isMobile
    ? { ...css.card, width: "100%", maxHeight: "92vh", overflowY: "auto", borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderTopLeftRadius: 18, borderTopRightRadius: 18 }
    : { ...css.card, width: "100%", maxWidth: wide ? 700 : 520, maxHeight: "90vh", overflowY: "auto" };

  return (
    <div style={overlay} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div style={box}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{title}</span>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", color: G.muted, fontSize: 24, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function StatCard({ label, value, color = G.accent, icon }) {
  return (
    <div style={{ ...css.card, display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, color: G.muted, fontWeight: 600 }}>{icon} {label}</span>
      <span style={{ fontSize: 20, fontWeight: 800, color, letterSpacing: "-0.5px" }}>{value}</span>
    </div>
  );
}

export function ErrorBanner({ msg }) {
  return msg ? <div style={{ background: G.red + "22", border: `1px solid ${G.red}44`, borderRadius: 8, padding: "10px 14px", color: G.red, marginBottom: 16, fontSize: 13 }}>⚠️ {msg}</div> : null;
}

export const TABS = [
  ["dash", "🏠", "Início"],
  ["shifts", "📋", "Lançamentos"],
  ["cal", "📅", "Calendário"],
  ["weekly", "📆", "Semanal"],
  ["monthly", "🗓️", "Mensal"],
  ["reports", "📑", "Relatórios"],
  ["cgs", "🗂️", "Cadastros"],
  ["meds", "💊", "Medicamentos"],
  ["sep", "📦", "Separação"],
];

export function BottomNav({ tab, setTab }) {
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: G.card, borderTop: `1px solid ${G.cardBorder}`, display: "flex", zIndex: 100 }}>
      {TABS.map(([id, icon, label]) => (
        <button key={id} onClick={() => setTab(id)} style={{ flex: 1, padding: "8px 2px 10px", border: "none", background: "none", color: tab === id ? G.accent : G.muted, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, cursor: "pointer", fontSize: 10, fontWeight: tab === id ? 700 : 500 }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
          <span style={{ fontSize: 9 }}>{label}</span>
        </button>
      ))}
    </div>
  );
}
