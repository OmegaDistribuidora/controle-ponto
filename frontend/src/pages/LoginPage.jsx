import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      setLoading(true);
      const user = await login({ login: loginValue.trim(), password });
      if (user.role === "USER") navigate("/app/user", { replace: true });
      else navigate("/app/rh", { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || "Falha no login.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="panel auth-panel">
        <h1>Entrar</h1>
        <form onSubmit={submit} className="stack-form">
          <label>
            Usuario ou CPF
            <input
              type="text"
              value={loginValue}
              onChange={(e) => setLoginValue(e.target.value)}
              required
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
        {error ? <p className="feedback status-denied">{error}</p> : null}
        <div className="nav-links">
          <Link to="/">Voltar para batida de ponto</Link>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
