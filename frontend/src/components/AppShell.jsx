import { useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BRAND } from "../brand";
import { useAuth } from "../context/AuthContext";

const AppShell = ({ title, children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const roleTitle = useMemo(() => {
    if (!user?.role) return "Painel";
    if (user.role === "RH") return "Painel de RH";
    if (user.role === "ADMIN") return "Painel administrativo";
    return "Painel do usuario";
  }, [user?.role]);

  const menuOptions = [
    { label: "Painéis de Análise", path: "/app/rh/analise" },
    { label: "Relatórios", path: "/app/rh/relatorios" },
    { label: "Cadastrar usuário", path: "/app/rh/cadastros/usuarios" },
    { label: "Cadastrar setor", path: "/app/rh/cadastros/setores" },
    { label: "Cadastrar cargo", path: "/app/rh/cadastros/cargos" },
    { label: "Cadastrar empresa", path: "/app/rh/cadastros/empresas" }
  ];

  const menuValue = menuOptions.find((item) => item.path === location.pathname)?.path || "";
  const showManagementMenu = ["RH", "ADMIN"].includes(user?.role || "");

  const onMenuChange = (event) => {
    const path = event.target.value;
    if (path) navigate(path);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="brand-name">{BRAND.appName}</p>
          <h1>{title || roleTitle}</h1>
        </div>
        <div className="topbar-actions">
          <p className="muted">
            {user?.name} ({user?.role})
          </p>
          {showManagementMenu ? (
            <select className="topbar-select" value={menuValue} onChange={onMenuChange}>
              <option value="">Menu de gestão</option>
              {menuOptions.map((item) => (
                <option key={item.path} value={item.path}>
                  {item.label}
                </option>
              ))}
            </select>
          ) : null}
          {showManagementMenu && location.pathname !== "/app/rh" ? (
            <Link to="/app/rh" className="back-panel-btn">
              Voltar ao painel
            </Link>
          ) : null}
          <button className="ghost-btn" onClick={logout}>
            Sair
          </button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
};

export default AppShell;
