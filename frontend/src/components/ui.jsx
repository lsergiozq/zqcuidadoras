import { useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { G, css, useMobile } from "../app/shared";

export function UpdateBanner() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div style={{
      position: "fixed", top: 56, left: 0, right: 0, zIndex: 300,
      background: G.accent, color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
      padding: "10px 16px", fontSize: 13, fontWeight: 500,
    }}>
      <span>🔄 Nova versão disponível!</span>
      <button
        onClick={() => updateServiceWorker(true)}
        style={{
          background: "#ffffff33", border: "1px solid #ffffff55",
          color: "#fff", borderRadius: 6, padding: "4px 12px",
          fontSize: 12, fontWeight: 700, cursor: "pointer",
        }}
      >
        Atualizar
      </button>
    </div>
  );
}

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

const PRIMARY_TABS = [
  ["dash", "🏠", "Início"],
  ["shifts", "📋", "Lançamentos"],
  ["sep", "📦", "Separação"],
  ["reports", "📑", "Relatórios"],
];

const MORE_TABS = [
  ["cal", "📅", "Calendário"],
  ["weekly", "📆", "Semanal"],
  ["monthly", "🗓️", "Mensal"],
  ["cgs", "🗂️", "Cadastros"],
  ["meds", "💊", "Medicamentos"],
];

export function BottomNav({ tab, setTab }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isMore = MORE_TABS.some(([id]) => id === tab);

  const handleSelect = (id) => {
    setTab(id);
    setDrawerOpen(false);
  };

  const navItemStyle = (active) => ({
    flex: 1,
    padding: "8px 4px 12px",
    border: "none",
    background: "none",
    color: active ? G.accent : G.muted,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    cursor: "pointer",
    fontWeight: active ? 700 : 500,
  });

  return (
    <>
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{ position: "fixed", inset: 0, background: "#000000aa", zIndex: 150 }}
        />
      )}

      {drawerOpen && (
        <div style={{
          position: "fixed", bottom: 64, left: 0, right: 0,
          background: G.card, borderTop: `1px solid ${G.cardBorder}`,
          borderTopLeftRadius: 18, borderTopRightRadius: 18,
          padding: "20px 16px 24px",
          zIndex: 160,
        }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: G.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>Mais</span>
            <button
              onClick={() => setDrawerOpen(false)}
              style={{ marginLeft: "auto", background: "none", border: "none", color: G.muted, fontSize: 22, cursor: "pointer", lineHeight: 1 }}
            >×</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {MORE_TABS.map(([id, icon, label]) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => handleSelect(id)}
                  style={{
                    border: `1px solid ${active ? G.accent + "66" : G.cardBorder}`,
                    borderRadius: 12,
                    background: active ? G.accent + "18" : "transparent",
                    color: active ? G.accent : G.muted,
                    padding: "14px 8px",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                    cursor: "pointer", fontWeight: active ? 700 : 500,
                  }}
                >
                  <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>
                  <span style={{ fontSize: 12 }}>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: G.card, borderTop: `1px solid ${G.cardBorder}`,
        display: "flex", zIndex: 170,
      }}>
        {PRIMARY_TABS.map(([id, icon, label]) => {
          const active = tab === id;
          return (
            <button key={id} onClick={() => handleSelect(id)} style={navItemStyle(active)}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>
              <span style={{ fontSize: 11 }}>{label}</span>
              {active && <span style={{ width: 4, height: 4, borderRadius: "50%", background: G.accent }} />}
            </button>
          );
        })}
        <button onClick={() => setDrawerOpen((v) => !v)} style={navItemStyle(isMore || drawerOpen)}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>{isMore ? MORE_TABS.find(([id]) => id === tab)?.[1] : "⋯"}</span>
          <span style={{ fontSize: 11 }}>{isMore ? MORE_TABS.find(([id]) => id === tab)?.[2] : "Mais"}</span>
          {isMore && <span style={{ width: 4, height: 4, borderRadius: "50%", background: G.accent }} />}
        </button>
      </div>
    </>
  );
}
