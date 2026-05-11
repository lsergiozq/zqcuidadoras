import { clearSession, getToken } from "./auth";

const API = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:8000" : "/api");
const API_TIMEOUT_MS = 15000;

const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` });

const readErrorMessage = async (response, fallback) => {
  try {
    const data = await response.json();
    if (typeof data?.detail === "string" && data.detail.trim()) return data.detail;
    if (typeof data?.message === "string" && data.message.trim()) return data.message;
  } catch {}
  try {
    const text = await response.text();
    if (text.trim()) return text;
  } catch {}
  return fallback;
};

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Tempo limite ao carregar dados da API. Verifique a conexao com o banco na Vercel.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const ensureApiSuccess = async (response, fallback) => {
  if (response.status === 401) {
    clearSession();
    throw new Error(await readErrorMessage(response, "Sessão expirada. Entre novamente."));
  }
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, fallback));
  }
  return response;
};

export const api = {
  login: async (username, password) => {
    const form = new URLSearchParams({ username, password });
    const response = await fetchWithTimeout(`${API}/auth/login`, { method: "POST", body: form });
    await ensureApiSuccess(response, "Usuário ou senha incorretos");
    return response.json();
  },
  get: async (path) => {
    const response = await fetchWithTimeout(`${API}${path}`, { headers: authHeaders() });
    await ensureApiSuccess(response, "Não foi possível carregar os dados.");
    return response.json();
  },
  post: async (path, body) => {
    const response = await fetchWithTimeout(`${API}${path}`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
    await ensureApiSuccess(response, "Não foi possível salvar os dados.");
    return response.json();
  },
  put: async (path, body) => {
    const response = await fetchWithTimeout(`${API}${path}`, { method: "PUT", headers: authHeaders(), body: JSON.stringify(body) });
    await ensureApiSuccess(response, "Não foi possível atualizar os dados.");
    return response.json();
  },
  patch: async (path, body) => {
    const response = await fetchWithTimeout(`${API}${path}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify(body) });
    await ensureApiSuccess(response, "Não foi possível atualizar os dados.");
    return response.json();
  },
  delete: async (path) => {
    const response = await fetchWithTimeout(`${API}${path}`, { method: "DELETE", headers: authHeaders() });
    await ensureApiSuccess(response, "Não foi possível remover os dados.");
  },
};
