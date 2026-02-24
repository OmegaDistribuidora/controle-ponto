import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import api from "../api";
import { formatDateBr, formatDateTimeBr, resolveMediaUrl, statusClass, statusLabel } from "../utils";

const UserDashboard = () => {
  const [profile, setProfile] = useState(null);
  const [records, setRecords] = useState([]);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const loadData = async () => {
    const [meRes, recordsRes] = await Promise.all([api.get("/auth/me"), api.get("/user/records?limit=50")]);
    setProfile(meRes.data);
    setRecords(recordsRes.data.items || []);
  };

  useEffect(() => {
    loadData();
  }, []);

  const submitPassword = async (event) => {
    event.preventDefault();
    setPasswordMessage("");
    setPasswordError("");
    try {
      const { data } = await api.post("/auth/change-password", { currentPassword, newPassword });
      setPasswordMessage(data.message || "Senha alterada.");
      setPasswordError("");
      setCurrentPassword("");
      setNewPassword("");
      setShowPasswordForm(false);
    } catch (error) {
      setPasswordError(error.response?.data?.error || "Erro ao trocar senha.");
    }
  };

  return (
    <AppShell>
      <section className="panel">
        <div className="section-title-row">
          <h2>Últimos 50 registros</h2>
          <button className="ghost-btn small-btn" onClick={() => setShowPasswordForm((prev) => !prev)}>
            {showPasswordForm ? "Cancelar troca de senha" : "Trocar senha"}
          </button>
        </div>

        {showPasswordForm ? (
          <form onSubmit={submitPassword} className="password-inline">
            <input
              type="password"
              placeholder="Senha atual"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Nova senha"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <button type="submit">Salvar</button>
          </form>
        ) : null}

        {passwordMessage ? <p className="feedback status-confirmed">{passwordMessage}</p> : null}
        {passwordError ? <p className="feedback status-denied">{passwordError}</p> : null}

        <div className="records-grid">
          {records.map((record) => (
            <article key={record.id} className={`record-card ${statusClass(record.status)}`}>
              <p>
                <strong>{record.record_type}</strong> - {statusLabel(record.status)}
              </p>
              <p>
                Data: {formatDateBr(record.record_date)} {formatDateTimeBr(record.recorded_at).split(" ")[1]}
              </p>
              <p>Obs. sistema: {record.system_observation || "-"}</p>
              <p>Obs. RH: {record.decision_observation || "-"}</p>
              {record.photo_url ? (
                <a href={resolveMediaUrl(record.photo_url)} target="_blank" rel="noreferrer">
                  Ver foto
                </a>
              ) : null}
            </article>
          ))}
          {records.length === 0 ? <p>Nenhum registro encontrado.</p> : null}
        </div>
      </section>

      <section className="panel">
        <h2>Dados do usuário</h2>
        {profile ? (
          <div className="info-list">
            <p>
              <strong>Nome:</strong> {profile.name}
            </p>
            <p>
              <strong>CPF:</strong> {profile.cpf}
            </p>
            <p>
              <strong>Setor:</strong> {profile.sector_name || "-"}
            </p>
            <p>
              <strong>Cargo:</strong> {profile.position_name || "-"}
            </p>
            <p>
              <strong>Empresa:</strong> {profile.company_name || "-"}
            </p>
          </div>
        ) : (
          <p>Carregando...</p>
        )}
      </section>
    </AppShell>
  );
};

export default UserDashboard;
