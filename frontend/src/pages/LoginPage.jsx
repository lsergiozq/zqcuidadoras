import { useState } from "react";
import { G, css } from "../app/shared";
import { setSession, setToken } from "../app/auth";
import { api } from "../app/api";
import { ErrorBanner, Field } from "../components/ui";

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (!username || !password) return setError("Preencha usuário e senha");
    setLoading(true);
    setError("");
    try {
      const data = await api.login(username, password);
      setToken(data.access_token);
      setSession(data);
      onLogin(data);
    } catch (error) {
      setError(error.message || "Erro ao fazer login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: G.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>💊</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: G.accent, letterSpacing: "-0.5px" }}>ZQCuidadoras</div>
          <div style={{ fontSize: 13, color: G.muted, marginTop: 6 }}>Controle de despesas com cuidadoras</div>
        </div>
        <div style={css.card}>
          <ErrorBanner msg={error} />
          <form onSubmit={submit}>
            <Field label="Usuário">
              <input style={css.input} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="seu usuário" autoFocus />
            </Field>
            <Field label="Senha">
              <input type="password" style={css.input} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" />
            </Field>
            <button type="submit" style={{ ...css.btn(), width: "100%", marginTop: 8, padding: "12px 20px", fontSize: 15 }} disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
