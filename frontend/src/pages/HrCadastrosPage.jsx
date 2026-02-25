import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import AppShell from "../components/AppShell";
import api from "../api";
import { formatCpfInput, onlyDigits } from "../utils";

const TITLES = {
  usuarios: "Cadastro de usuários",
  setores: "Cadastro de setores",
  cargos: "Cadastro de cargos",
  empresas: "Cadastro de empresas"
};

const defaultEditUser = {
  id: null,
  name: "",
  sectorId: "",
  positionId: "",
  companyId: "",
  active: true
};

const defaultEditSector = {
  id: null,
  name: "",
  entryTime: "",
  exitTime: "",
  latitude: "",
  longitude: ""
};

const defaultEditPosition = {
  id: null,
  name: ""
};

const defaultEditCompany = {
  id: null,
  name: ""
};

const HrCadastrosPage = () => {
  const { tipo } = useParams();
  const tipoValido = Object.keys(TITLES).includes(tipo || "");

  const [error, setError] = useState("");
  const [lookups, setLookups] = useState({ sectors: [], positions: [], companies: [] });
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({
    name: "",
    cpf: "",
    sectorId: "",
    positionId: "",
    companyId: ""
  });
  const [newSector, setNewSector] = useState({
    name: "",
    entryTime: "",
    exitTime: "",
    latitude: "",
    longitude: ""
  });
  const [newPosition, setNewPosition] = useState({ name: "" });
  const [newCompany, setNewCompany] = useState({ name: "" });
  const [modalType, setModalType] = useState("");
  const [modalSaving, setModalSaving] = useState(false);
  const [editUser, setEditUser] = useState(defaultEditUser);
  const [editSector, setEditSector] = useState(defaultEditSector);
  const [editPosition, setEditPosition] = useState(defaultEditPosition);
  const [editCompany, setEditCompany] = useState(defaultEditCompany);

  const loadLookups = async () => {
    const { data } = await api.get("/hr/lookups");
    setLookups(data);
  };

  const loadUsers = async () => {
    const { data } = await api.get("/hr/users");
    setUsers(data.items || []);
  };

  const loadPageData = async () => {
    setError("");
    try {
      if (tipo === "usuarios") {
        await Promise.all([loadLookups(), loadUsers()]);
      } else {
        await loadLookups();
      }
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao carregar cadastros.");
    }
  };

  useEffect(() => {
    if (!tipoValido) return;
    loadPageData();
  }, [tipo, tipoValido]);

  const setorById = useMemo(
    () => new Map(lookups.sectors.map((item) => [String(item.id), item])),
    [lookups.sectors]
  );
  const cargoById = useMemo(
    () => new Map(lookups.positions.map((item) => [String(item.id), item])),
    [lookups.positions]
  );
  const empresaById = useMemo(
    () => new Map(lookups.companies.map((item) => [String(item.id), item])),
    [lookups.companies]
  );

  const closeModal = () => {
    setModalType("");
    setEditUser(defaultEditUser);
    setEditSector(defaultEditSector);
    setEditPosition(defaultEditPosition);
    setEditCompany(defaultEditCompany);
  };

  const submitNewUser = async (event) => {
    event.preventDefault();
    try {
      await api.post("/hr/users", {
        ...newUser,
        cpf: onlyDigits(newUser.cpf).slice(0, 11)
      });
      setNewUser({ name: "", cpf: "", sectorId: "", positionId: "", companyId: "" });
      await loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao criar usuário.");
    }
  };

  const openEditUser = (user) => {
    setEditUser({
      id: user.id,
      name: user.name,
      sectorId: String(user.sector_id || ""),
      positionId: String(user.position_id || ""),
      companyId: String(user.company_id || ""),
      active: Boolean(user.active)
    });
    setModalType("user");
  };

  const submitEditUser = async (event) => {
    event.preventDefault();
    try {
      setModalSaving(true);
      await api.put(`/hr/users/${editUser.id}`, {
        name: editUser.name,
        sectorId: Number(editUser.sectorId),
        positionId: Number(editUser.positionId),
        companyId: Number(editUser.companyId),
        active: Boolean(editUser.active)
      });
      await loadUsers();
      closeModal();
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao editar usuário.");
    } finally {
      setModalSaving(false);
    }
  };

  const toggleUserActive = async (user) => {
    const action = user.active ? "inativar" : "ativar";
    if (!window.confirm(`Deseja ${action} este usuário?`)) return;
    try {
      await api.put(`/hr/users/${user.id}`, {
        name: user.name,
        sectorId: Number(user.sector_id),
        positionId: Number(user.position_id),
        companyId: Number(user.company_id),
        active: !user.active
      });
      await loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || `Erro ao ${action} usuário.`);
    }
  };

  const submitSector = async (event) => {
    event.preventDefault();
    try {
      await api.post("/hr/sectors", newSector);
      setNewSector({ name: "", entryTime: "", exitTime: "", latitude: "", longitude: "" });
      await loadLookups();
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao criar setor.");
    }
  };

  const openEditSector = (sector) => {
    setEditSector({
      id: sector.id,
      name: sector.name,
      entryTime: sector.entry_time?.slice(0, 5) || "",
      exitTime: sector.exit_time?.slice(0, 5) || "",
      latitude: sector.latitude === null || sector.latitude === undefined ? "" : String(sector.latitude),
      longitude: sector.longitude === null || sector.longitude === undefined ? "" : String(sector.longitude)
    });
    setModalType("sector");
  };

  const submitEditSector = async (event) => {
    event.preventDefault();
    try {
      setModalSaving(true);
      await api.put(`/hr/sectors/${editSector.id}`, {
        name: editSector.name,
        entryTime: editSector.entryTime,
        exitTime: editSector.exitTime,
        latitude: editSector.latitude,
        longitude: editSector.longitude
      });
      await loadLookups();
      closeModal();
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao editar setor.");
    } finally {
      setModalSaving(false);
    }
  };

  const deleteSector = async (sectorId) => {
    if (!window.confirm("Remover setor?")) return;
    try {
      await api.delete(`/hr/sectors/${sectorId}`);
      await loadLookups();
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao remover setor.");
    }
  };

  const submitPosition = async (event) => {
    event.preventDefault();
    try {
      await api.post("/hr/positions", newPosition);
      setNewPosition({ name: "" });
      await loadLookups();
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao criar cargo.");
    }
  };

  const openEditPosition = (item) => {
    setEditPosition({
      id: item.id,
      name: item.name
    });
    setModalType("position");
  };

  const submitEditPosition = async (event) => {
    event.preventDefault();
    try {
      setModalSaving(true);
      await api.put(`/hr/positions/${editPosition.id}`, { name: editPosition.name });
      await loadLookups();
      closeModal();
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao editar cargo.");
    } finally {
      setModalSaving(false);
    }
  };

  const deletePosition = async (id) => {
    if (!window.confirm("Remover cargo?")) return;
    try {
      await api.delete(`/hr/positions/${id}`);
      await loadLookups();
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao remover cargo.");
    }
  };

  const submitCompany = async (event) => {
    event.preventDefault();
    try {
      await api.post("/hr/companies", newCompany);
      setNewCompany({ name: "" });
      await loadLookups();
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao criar empresa.");
    }
  };

  const openEditCompany = (item) => {
    setEditCompany({
      id: item.id,
      name: item.name
    });
    setModalType("company");
  };

  const submitEditCompany = async (event) => {
    event.preventDefault();
    try {
      setModalSaving(true);
      await api.put(`/hr/companies/${editCompany.id}`, { name: editCompany.name });
      await loadLookups();
      closeModal();
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao editar empresa.");
    } finally {
      setModalSaving(false);
    }
  };

  const deleteCompany = async (id) => {
    if (!window.confirm("Remover empresa?")) return;
    try {
      await api.delete(`/hr/companies/${id}`);
      await loadLookups();
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao remover empresa.");
    }
  };

  if (!tipoValido) return <Navigate to="/app/rh" replace />;

  return (
    <AppShell title={TITLES[tipo]}>
      {error ? <p className="feedback status-denied">{error}</p> : null}

      {tipo === "usuarios" ? (
        <section className="panel">
          <form onSubmit={submitNewUser} className="stack-form">
            <label>
              Nome
              <input
                type="text"
                value={newUser.name}
                onChange={(e) => setNewUser((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </label>
            <label>
              CPF
              <input
                type="text"
                inputMode="numeric"
                value={newUser.cpf}
                maxLength={14}
                onChange={(e) => setNewUser((prev) => ({ ...prev, cpf: formatCpfInput(e.target.value) }))}
                required
              />
            </label>
            <label>
              Setor
              <select
                value={newUser.sectorId}
                onChange={(e) => setNewUser((prev) => ({ ...prev, sectorId: e.target.value }))}
                required
              >
                <option value="">Selecione</option>
                {lookups.sectors.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cargo
              <select
                value={newUser.positionId}
                onChange={(e) => setNewUser((prev) => ({ ...prev, positionId: e.target.value }))}
                required
              >
                <option value="">Selecione</option>
                {lookups.positions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Empresa
              <select
                value={newUser.companyId}
                onChange={(e) => setNewUser((prev) => ({ ...prev, companyId: e.target.value }))}
                required
              >
                <option value="">Selecione</option>
                {lookups.companies.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Criar usuário</button>
            <p className="muted small">Senha inicial: 3 primeiros dígitos do CPF.</p>
          </form>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>CPF</th>
                  <th>Setor</th>
                  <th>Cargo</th>
                  <th>Empresa</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.cpf}</td>
                    <td>{setorById.get(String(user.sector_id))?.name || user.sector_name || "-"}</td>
                    <td>{cargoById.get(String(user.position_id))?.name || user.position_name || "-"}</td>
                    <td>{empresaById.get(String(user.company_id))?.name || user.company_name || "-"}</td>
                    <td>
                      <span className={`status-pill ${user.active ? "active-pill" : "inactive-pill"}`}>
                        {user.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" onClick={() => openEditUser(user)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className={user.active ? "danger-btn" : "ghost-btn"}
                          onClick={() => toggleUserActive(user)}
                        >
                          {user.active ? "Inativar" : "Ativar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tipo === "setores" ? (
        <section className="panel">
          <form onSubmit={submitSector} className="stack-form">
            <label>
              Nome
              <input
                type="text"
                value={newSector.name}
                onChange={(e) => setNewSector((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </label>
            <label>
              Entrada (HH:MM)
              <input
                type="time"
                value={newSector.entryTime}
                onChange={(e) => setNewSector((prev) => ({ ...prev, entryTime: e.target.value }))}
                required
              />
            </label>
            <label>
              Saída (HH:MM)
              <input
                type="time"
                value={newSector.exitTime}
                onChange={(e) => setNewSector((prev) => ({ ...prev, exitTime: e.target.value }))}
                required
              />
            </label>
            <label>
              Latitude
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={newSector.latitude}
                onChange={(e) => setNewSector((prev) => ({ ...prev, latitude: e.target.value }))}
                required
              />
            </label>
            <label>
              Longitude
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={newSector.longitude}
                onChange={(e) => setNewSector((prev) => ({ ...prev, longitude: e.target.value }))}
                required
              />
            </label>
            <button type="submit">Criar setor</button>
          </form>

          <div className="list-wrap">
            {lookups.sectors.map((item) => (
              <div key={item.id} className="list-row">
                <span>
                  {item.name} ({item.entry_time?.slice(0, 5)}-{item.exit_time?.slice(0, 5)}) | lat:{" "}
                  {item.latitude ?? "-"} | lon: {item.longitude ?? "-"}
                </span>
                <div className="row-actions">
                  <button type="button" onClick={() => openEditSector(item)}>
                    Editar
                  </button>
                  <button className="danger-btn" type="button" onClick={() => deleteSector(item.id)}>
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tipo === "cargos" ? (
        <section className="panel">
          <form onSubmit={submitPosition} className="row-form compact">
            <input
              type="text"
              placeholder="Novo cargo"
              value={newPosition.name}
              onChange={(e) => setNewPosition({ name: e.target.value })}
              required
            />
            <button type="submit">Adicionar</button>
          </form>
          <div className="list-wrap">
            {lookups.positions.map((item) => (
              <div key={item.id} className="list-row">
                <span>{item.name}</span>
                <div className="row-actions">
                  <button type="button" onClick={() => openEditPosition(item)}>
                    Editar
                  </button>
                  <button className="danger-btn" type="button" onClick={() => deletePosition(item.id)}>
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tipo === "empresas" ? (
        <section className="panel">
          <form onSubmit={submitCompany} className="row-form compact">
            <input
              type="text"
              placeholder="Nova empresa"
              value={newCompany.name}
              onChange={(e) => setNewCompany({ name: e.target.value })}
              required
            />
            <button type="submit">Adicionar</button>
          </form>
          <div className="list-wrap">
            {lookups.companies.map((item) => (
              <div key={item.id} className="list-row">
                <span>{item.name}</span>
                <div className="row-actions">
                  <button type="button" onClick={() => openEditCompany(item)}>
                    Editar
                  </button>
                  <button className="danger-btn" type="button" onClick={() => deleteCompany(item.id)}>
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {modalType ? (
        <div className="modal-backdrop" onClick={closeModal}>
          <section className="panel modal-card" onClick={(event) => event.stopPropagation()}>
            {modalType === "user" ? (
              <form onSubmit={submitEditUser} className="stack-form">
                <h2>Editar usuário</h2>
                <label>
                  Nome
                  <input
                    type="text"
                    value={editUser.name}
                    onChange={(e) => setEditUser((prev) => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Setor
                  <select
                    value={editUser.sectorId}
                    onChange={(e) => setEditUser((prev) => ({ ...prev, sectorId: e.target.value }))}
                    required
                  >
                    <option value="">Selecione</option>
                    {lookups.sectors.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Cargo
                  <select
                    value={editUser.positionId}
                    onChange={(e) => setEditUser((prev) => ({ ...prev, positionId: e.target.value }))}
                    required
                  >
                    <option value="">Selecione</option>
                    {lookups.positions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Empresa
                  <select
                    value={editUser.companyId}
                    onChange={(e) => setEditUser((prev) => ({ ...prev, companyId: e.target.value }))}
                    required
                  >
                    <option value="">Selecione</option>
                    {lookups.companies.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="modal-actions">
                  <button type="button" className="ghost-btn" onClick={closeModal}>
                    Cancelar
                  </button>
                  <button type="submit" disabled={modalSaving}>
                    {modalSaving ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </form>
            ) : null}

            {modalType === "sector" ? (
              <form onSubmit={submitEditSector} className="stack-form">
                <h2>Editar setor</h2>
                <label>
                  Nome
                  <input
                    type="text"
                    value={editSector.name}
                    onChange={(e) => setEditSector((prev) => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Entrada (HH:MM)
                  <input
                    type="time"
                    value={editSector.entryTime}
                    onChange={(e) => setEditSector((prev) => ({ ...prev, entryTime: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Saida (HH:MM)
                  <input
                    type="time"
                    value={editSector.exitTime}
                    onChange={(e) => setEditSector((prev) => ({ ...prev, exitTime: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Latitude
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={editSector.latitude}
                    onChange={(e) => setEditSector((prev) => ({ ...prev, latitude: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Longitude
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={editSector.longitude}
                    onChange={(e) => setEditSector((prev) => ({ ...prev, longitude: e.target.value }))}
                    required
                  />
                </label>
                <div className="modal-actions">
                  <button type="button" className="ghost-btn" onClick={closeModal}>
                    Cancelar
                  </button>
                  <button type="submit" disabled={modalSaving}>
                    {modalSaving ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </form>
            ) : null}

            {modalType === "position" ? (
              <form onSubmit={submitEditPosition} className="stack-form">
                <h2>Editar cargo</h2>
                <label>
                  Nome
                  <input
                    type="text"
                    value={editPosition.name}
                    onChange={(e) => setEditPosition((prev) => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </label>
                <div className="modal-actions">
                  <button type="button" className="ghost-btn" onClick={closeModal}>
                    Cancelar
                  </button>
                  <button type="submit" disabled={modalSaving}>
                    {modalSaving ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </form>
            ) : null}

            {modalType === "company" ? (
              <form onSubmit={submitEditCompany} className="stack-form">
                <h2>Editar empresa</h2>
                <label>
                  Nome
                  <input
                    type="text"
                    value={editCompany.name}
                    onChange={(e) => setEditCompany((prev) => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </label>
                <div className="modal-actions">
                  <button type="button" className="ghost-btn" onClick={closeModal}>
                    Cancelar
                  </button>
                  <button type="submit" disabled={modalSaving}>
                    {modalSaving ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </form>
            ) : null}
          </section>
        </div>
      ) : null}
    </AppShell>
  );
};

export default HrCadastrosPage;
