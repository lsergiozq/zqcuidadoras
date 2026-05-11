export const AUTH_CHANGED_EVENT = "zq-auth-changed";

const emitAuthChanged = () => window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));

export const getToken = () => localStorage.getItem("cc_token");

export const setToken = (token) => {
  localStorage.setItem("cc_token", token);
  emitAuthChanged();
};

export const getSession = () => {
  const raw = localStorage.getItem("cc_user");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return { username: raw, display_name: raw, role: "admin", caregiver_id: null };
  }
};

export const setSession = (session) => {
  localStorage.setItem("cc_user", JSON.stringify(session));
  emitAuthChanged();
};

export const clearSession = () => {
  localStorage.removeItem("cc_token");
  localStorage.removeItem("cc_user");
  emitAuthChanged();
};
