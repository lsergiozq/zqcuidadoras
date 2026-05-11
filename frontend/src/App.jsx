import { useEffect, useState } from "react";
import { MobileCtx, G, css, useIsMobile } from "./app/shared";
import { AUTH_CHANGED_EVENT, clearSession, getSession, getToken } from "./app/auth";
import { useCaregiverData, useData } from "./app/hooks";
import { BottomNav, ErrorBanner, TABS } from "./components/ui";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import CalendarPage from "./pages/CalendarPage";
import WeeklyClosePage from "./pages/WeeklyClosePage";
import MonthlyClosePage from "./pages/MonthlyClosePage";
import ReportsPage from "./pages/ReportsPage";
import CatalogsPage from "./pages/CatalogsPage";
import ShiftsPage from "./pages/ShiftsPage";
import CaregiverPortalPage from "./pages/CaregiverPortalPage";
import MedicationPage from "./pages/MedicationPage";
import SeparacaoPage from "./pages/SeparacaoPage";

export default function App() {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState("dash");
  const [session, setSessionState] = useState(getSession);
  const isAuthenticated = Boolean(session && getToken());
  const isAdmin = session?.role !== "caregiver";
  const displayName = session?.display_name || session?.username || "";
  const {
    caregivers,
    setCaregivers,
    shifts,
    setShifts,
    extras,
    setExtras,
    elders,
    setElders,
    serviceTypes,
    setServiceTypes,
    loading,
    error,
  } = useData(isAuthenticated && isAdmin);
  const caregiverData = useCaregiverData(isAuthenticated && !isAdmin);

  useEffect(() => {
    const syncAuth = () => setSessionState(getSession());
    window.addEventListener(AUTH_CHANGED_EVENT, syncAuth);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, syncAuth);
  }, []);

  const logout = () => {
    clearSession();
    setSessionState(null);
  };

  if (!isAuthenticated) {
    return (
      <MobileCtx.Provider value={isMobile}>
        <LoginPage onLogin={(nextSession) => setSessionState(nextSession)} />
      </MobileCtx.Provider>
    );
  }

  if (!isAdmin) {
    return (
      <MobileCtx.Provider value={isMobile}>
        <CaregiverPortalPage
          session={session}
          dashboard={caregiverData.dashboard}
          elders={caregiverData.elders}
          serviceTypes={caregiverData.serviceTypes}
          loading={caregiverData.loading}
          error={caregiverData.error}
          reload={caregiverData.reload}
          onLogout={logout}
        />
      </MobileCtx.Provider>
    );
  }

  if (loading) {
    return <div style={{ ...css.page, alignItems: "center", justifyContent: "center", color: G.muted }}>⏳ Carregando...</div>;
  }

  return (
    <MobileCtx.Provider value={isMobile}>
      <div style={css.page}>
        <div style={css.topbar}>
          <span style={css.logo}>💊 ZQCuidadoras</span>
          {isMobile ? (
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: G.muted }}>👤 {displayName}</span>
              <button onClick={logout} style={{ ...css.btnSm(G.red) }}>Sair</button>
            </div>
          ) : (
            <nav style={{ display: "flex", gap: 4, marginLeft: "auto", flexWrap: "wrap" }}>
              {TABS.map(([id, , label]) => (
                <button
                  key={id}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 8,
                    border: "none",
                    background: tab === id ? G.accent : "transparent",
                    color: tab === id ? "#fff" : G.muted,
                    fontWeight: 500,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8, paddingLeft: 8, borderLeft: `1px solid ${G.cardBorder}` }}>
                <span style={{ fontSize: 12, color: G.muted }}>👤 {displayName}</span>
                <button onClick={logout} style={{ ...css.btnSm(G.red) }}>Sair</button>
              </div>
            </nav>
          )}
        </div>

        <main style={isMobile ? css.mainMobile : css.main}>
          <ErrorBanner msg={error} />
          {tab === "dash" && <DashboardPage caregivers={caregivers} shifts={shifts} extras={extras} />}
          {tab === "shifts" && <ShiftsPage caregivers={caregivers} shifts={shifts} setShifts={setShifts} extras={extras} setExtras={setExtras} elders={elders} serviceTypes={serviceTypes} />}
          {tab === "cal" && <CalendarPage caregivers={caregivers} shifts={shifts} extras={extras} />}
          {tab === "weekly" && <WeeklyClosePage caregivers={caregivers} shifts={shifts} setShifts={setShifts} extras={extras} setExtras={setExtras} />}
          {tab === "monthly" && <MonthlyClosePage caregivers={caregivers} shifts={shifts} setShifts={setShifts} extras={extras} setExtras={setExtras} />}
          {tab === "reports" && <ReportsPage caregivers={caregivers} elders={elders} />}
          {tab === "cgs" && <CatalogsPage caregivers={caregivers} setCaregivers={setCaregivers} elders={elders} setElders={setElders} serviceTypes={serviceTypes} setServiceTypes={setServiceTypes} />}
          {tab === "meds" && <MedicationPage elders={elders} />}
          {tab === "sep" && <SeparacaoPage elders={elders} />}
        </main>

        {isMobile && <BottomNav tab={tab} setTab={setTab} />}
      </div>
    </MobileCtx.Provider>
  );
}