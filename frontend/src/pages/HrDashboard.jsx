import { useEffect, useRef, useState } from "react";
import AppShell from "../components/AppShell";
import api from "../api";
import { formatDateBr, formatDateTimeBr, resolveMediaUrl, statusClass, statusLabel } from "../utils";

const toQuery = (filters) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      params.set(key, value);
    }
  });
  return params.toString();
};

const HrDashboard = () => {
  const [lookups, setLookups] = useState({ sectors: [], positions: [], companies: [] });
  const [pending, setPending] = useState([]);
  const [records, setRecords] = useState([]);
  const [error, setError] = useState("");
  const [decisionMap, setDecisionMap] = useState({});
  const knownPendingIdsRef = useRef(new Set());
  const initializedPendingRef = useRef(false);
  const [filters, setFilters] = useState({
    search: "",
    sectorId: "",
    positionId: "",
    companyId: "",
    status: "",
    dateFrom: "",
    dateTo: ""
  });

  const loadLookups = async () => {
    const { data } = await api.get("/hr/lookups");
    setLookups(data);
  };

  const showNewPendingNotification = (newItems) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted" || newItems.length === 0) return;

    const title =
      newItems.length === 1
        ? "Nova solicitação de liberação"
        : `${newItems.length} novas solicitações de liberação`;
    const body =
      newItems.length === 1
        ? `${newItems[0].user_name} - ${newItems[0].record_type} em ${formatDateBr(newItems[0].record_date)}`
        : "Acesse o painel para analisar as solicitações pendentes.";

    // eslint-disable-next-line no-new
    new Notification(title, { body });
  };

  const loadPending = async ({ notify = false } = {}) => {
    const { data } = await api.get("/hr/pending");
    const items = data.items || [];
    setPending(items);

    const previousIds = knownPendingIdsRef.current;
    if (notify && initializedPendingRef.current) {
      const newItems = items.filter((item) => !previousIds.has(item.id));
      showNewPendingNotification(newItems);
    }

    knownPendingIdsRef.current = new Set(items.map((item) => item.id));
    initializedPendingRef.current = true;
  };

  const loadRecords = async (customFilters = filters) => {
    const query = toQuery(customFilters);
    const { data } = await api.get(`/hr/records${query ? `?${query}` : ""}`);
    setRecords(data.items || []);
  };

  const loadAll = async () => {
    setError("");
    try {
      await Promise.all([loadLookups(), loadPending({ notify: false }), loadRecords()]);
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao carregar painel RH.");
    }
  };

  useEffect(() => {
    loadAll();

    const intervalId = window.setInterval(() => {
      loadPending({ notify: true }).catch(() => null);
    }, 60 * 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => null);
    }
  }, []);

  const approveOrDeny = async (recordId, status) => {
    try {
      await api.patch(`/hr/records/${recordId}/decision`, {
        status,
        decisionObservation: decisionMap[recordId] || ""
      });
      await Promise.all([loadPending({ notify: false }), loadRecords()]);
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao decidir solicitação.");
    }
  };

  const submitFilters = async (event) => {
    event.preventDefault();
    await loadRecords(filters);
  };

  return (
    <AppShell>
      {error ? <p className="feedback status-denied">{error}</p> : null}

      <section className="panel">
        <div className="section-title-row">
          <h2>Solicitações de liberação</h2>
          <button className="ghost-btn" onClick={() => loadPending({ notify: false })}>
            Atualizar
          </button>
        </div>
        <div className="records-grid">
          {pending.map((item) => (
            <article key={item.id} className="record-card status-pending">
              <p>
                <strong>{item.user_name}</strong> ({item.user_cpf})
              </p>
              <p>
                {item.position_name || "-"} | {item.sector_name || "-"} | {item.company_name || "-"}
              </p>
              <p>
                {item.record_type} em {formatDateBr(item.record_date)} -{" "}
                {formatDateTimeBr(item.recorded_at).split(" ")[1]}
              </p>
              <p>Obs. sistema: {item.system_observation || "-"}</p>
              {item.photo_url ? (
                <a href={resolveMediaUrl(item.photo_url)} target="_blank" rel="noreferrer">
                  Ver foto
                </a>
              ) : null}
              <textarea
                placeholder="Observação do RH (opcional)"
                value={decisionMap[item.id] || ""}
                onChange={(e) =>
                  setDecisionMap((prev) => ({
                    ...prev,
                    [item.id]: e.target.value
                  }))
                }
              />
              <div className="row-actions">
                <button onClick={() => approveOrDeny(item.id, "CONFIRMADO")}>Liberar</button>
                <button className="danger-btn" onClick={() => approveOrDeny(item.id, "NEGADO")}>
                  Recusar
                </button>
              </div>
            </article>
          ))}
          {pending.length === 0 ? <p>Sem solicitações no momento.</p> : null}
        </div>
      </section>

      <section className="panel">
        <h2>Histórico de registros</h2>
        <form onSubmit={submitFilters} className="filter-grid">
          <input
            type="text"
            placeholder="Buscar por nome ou CPF"
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          />
          <select
            value={filters.sectorId}
            onChange={(e) => setFilters((prev) => ({ ...prev, sectorId: e.target.value }))}
          >
            <option value="">Todos setores</option>
            {lookups.sectors.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            value={filters.positionId}
            onChange={(e) => setFilters((prev) => ({ ...prev, positionId: e.target.value }))}
          >
            <option value="">Todos cargos</option>
            {lookups.positions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            value={filters.companyId}
            onChange={(e) => setFilters((prev) => ({ ...prev, companyId: e.target.value }))}
          >
            <option value="">Todas empresas</option>
            {lookups.companies.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
          >
            <option value="">Todos status</option>
            <option value="CONFIRMADO">Confirmado</option>
            <option value="PENDENTE">Pendente</option>
            <option value="NEGADO">Negado</option>
          </select>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
          />
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
          />
          <button type="submit">Filtrar</button>
        </form>

        <div className="records-grid">
          {records.map((item) => (
            <article key={item.id} className={`record-card ${statusClass(item.status)}`}>
              <p>
                <strong>{item.user_name}</strong> ({item.user_cpf})
              </p>
              <p>
                {item.record_type} - {statusLabel(item.status)}
              </p>
              <p>
                {item.position_name || "-"} | {item.sector_name || "-"} | {item.company_name || "-"}
              </p>
              <p>
                {formatDateBr(item.record_date)} - {formatDateTimeBr(item.recorded_at).split(" ")[1]}
              </p>
              <p>Obs. sistema: {item.system_observation || "-"}</p>
              <p>Obs. RH: {item.decision_observation || "-"}</p>
              {item.photo_url ? (
                <a href={resolveMediaUrl(item.photo_url)} target="_blank" rel="noreferrer">
                  Ver foto
                </a>
              ) : null}
            </article>
          ))}
          {records.length === 0 ? <p>Nenhum registro encontrado.</p> : null}
        </div>
      </section>
    </AppShell>
  );
};

export default HrDashboard;
