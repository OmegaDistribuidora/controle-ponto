import { useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import api from "../api";
import { formatDateBr, formatDateTimeBr } from "../utils";

const PERIOD_OPTIONS = [
  { key: "today", label: "Hoje" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" }
];

const VIEW_OPTIONS = [
  { key: "general", label: "Geral" },
  { key: "user", label: "Por usuario" },
  { key: "sector", label: "Por setor" }
];

const FORTALEZA_TZ = "America/Fortaleza";

const dateToIso = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const toFortalezaNow = () => new Date(new Date().toLocaleString("en-US", { timeZone: FORTALEZA_TZ }));

const normalizeRecordDate = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  const firstTen = text.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(firstTen)) return firstTen;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return dateToIso(new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
};

const getPeriodRange = (period) => {
  const now = toFortalezaNow();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === "today") {
    const iso = dateToIso(today);
    return { from: iso, to: iso };
  }

  if (period === "week") {
    const weekdayMonFirst = (today.getDay() + 6) % 7;
    const weekStart = addDays(today, -weekdayMonFirst);
    const weekEnd = addDays(weekStart, 6);
    return { from: dateToIso(weekStart), to: dateToIso(weekEnd) };
  }

  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { from: dateToIso(firstDay), to: dateToIso(lastDay) };
};

const enumerateDays = (fromIso, toIso) => {
  const list = [];
  const from = new Date(`${fromIso}T00:00:00`);
  const to = new Date(`${toIso}T00:00:00`);
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) {
    list.push(dateToIso(cursor));
  }
  return list;
};

const groupDaysIntoWeeks = (fromIso, toIso) => {
  const from = new Date(`${fromIso}T00:00:00`);
  const to = new Date(`${toIso}T00:00:00`);
  const weekdayMonFirst = (from.getDay() + 6) % 7;
  let cursor = addDays(from, -weekdayMonFirst);
  const weeks = [];
  let count = 1;

  while (cursor <= to) {
    const weekStart = new Date(cursor);
    const weekEnd = addDays(weekStart, 6);
    const fromEffective = weekStart < from ? from : weekStart;
    const toEffective = weekEnd > to ? to : weekEnd;

    weeks.push({
      index: count,
      fromIso: dateToIso(fromEffective),
      toIso: dateToIso(toEffective),
      label: `Semana ${count} (${formatDateBr(dateToIso(fromEffective))} - ${formatDateBr(
        dateToIso(toEffective)
      )})`
    });
    count += 1;
    cursor = addDays(weekEnd, 1);
  }
  return weeks;
};

const getRecordTime = (value) => {
  const text = formatDateTimeBr(value);
  if (text === "Data inválida") return "-";
  return text.split(" ")[1] || "-";
};

const timeLabel = (timeValue) => {
  if (!timeValue) return "-";
  return String(timeValue).slice(0, 5);
};

const mkCell = (value, tone = "") => ({ value, tone });

const recordTone = (record) => {
  if (!record) return "";
  return record.outside_tolerance ? "bad" : "ok";
};

const metricFromRecords = (slice) => ({
  total: slice.length,
  entryOnTime: slice.filter((r) => r.record_type === "ENTRADA" && !r.outside_tolerance).length,
  entryOut: slice.filter((r) => r.record_type === "ENTRADA" && r.outside_tolerance).length,
  exitOnTime: slice.filter((r) => r.record_type === "SAIDA" && !r.outside_tolerance).length,
  exitOut: slice.filter((r) => r.record_type === "SAIDA" && r.outside_tolerance).length,
  pending: slice.filter((r) => r.status === "PENDENTE").length
});

const HrAnalyticsPage = () => {
  const [viewMode, setViewMode] = useState("general");
  const [period, setPeriod] = useState("week");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedSectorId, setSelectedSectorId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [records, setRecords] = useState([]);
  const [users, setUsers] = useState([]);
  const [lookups, setLookups] = useState({ sectors: [], positions: [], companies: [] });

  const range = useMemo(() => getPeriodRange(period), [period]);
  const sectorsById = useMemo(() => new Map(lookups.sectors.map((item) => [item.id, item])), [lookups.sectors]);

  const normalizedRecords = useMemo(
    () => records.map((item) => ({ ...item, record_date_iso: normalizeRecordDate(item.record_date) })),
    [records]
  );

  const selectedUser = useMemo(
    () => users.find((item) => String(item.id) === String(selectedUserId)) || null,
    [users, selectedUserId]
  );

  const selectedSector = useMemo(
    () => lookups.sectors.find((item) => String(item.id) === String(selectedSectorId)) || null,
    [lookups.sectors, selectedSectorId]
  );

  const fetchBaseData = async () => {
    const [usersRes, lookupsRes] = await Promise.all([api.get("/hr/users"), api.get("/hr/lookups")]);
    setUsers((usersRes.data.items || []).filter((item) => item.active !== false));
    setLookups(lookupsRes.data);
  };

  const fetchRecords = async () => {
    const params = new URLSearchParams();
    params.set("dateFrom", range.from);
    params.set("dateTo", range.to);
    params.set("limit", "10000");
    if (viewMode === "user" && selectedUserId) params.set("userId", String(selectedUserId));
    const { data } = await api.get(`/hr/records?${params.toString()}`);
    setRecords(data.items || []);
  };

  useEffect(() => {
    setError("");
    setLoading(true);
    fetchBaseData()
      .catch((err) => setError(err.response?.data?.error || "Erro ao carregar painel de analise."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (viewMode === "user" && !selectedUserId) {
      setRecords([]);
      return;
    }
    setError("");
    setLoading(true);
    fetchRecords()
      .catch((err) => setError(err.response?.data?.error || "Erro ao carregar dados de analise."))
      .finally(() => setLoading(false));
  }, [viewMode, period, selectedUserId]);

  useEffect(() => {
    if (viewMode !== "sector") return;
    if (!lookups.sectors.length) {
      setSelectedSectorId("");
      return;
    }

    const hasSelectedSector = lookups.sectors.some((item) => String(item.id) === String(selectedSectorId));
    if (!hasSelectedSector) {
      setSelectedSectorId(String(lookups.sectors[0].id));
    }
  }, [lookups.sectors, selectedSectorId, viewMode]);

  const generalTable = useMemo(() => {
    if (period === "today") {
      const rows = users.map((user) => {
        const userRecords = normalizedRecords.filter((item) => item.user_id === user.id);
        const sector = user ? sectorsById.get(user.sector_id) : null;
        const entry = userRecords.find((item) => item.record_type === "ENTRADA");
        const exit = userRecords.find((item) => item.record_type === "SAIDA");
        return {
          rowLabel: `${user.name} (${user.cpf})`,
          columns: [
            mkCell(timeLabel(sector?.entry_time)),
            mkCell(entry ? getRecordTime(entry.recorded_at) : "-", recordTone(entry)),
            mkCell(timeLabel(sector?.exit_time)),
            mkCell(exit ? getRecordTime(exit.recorded_at) : "-", recordTone(exit))
          ]
        };
      });

      return {
        headers: ["Entrada prevista", "Entrada registrada", "Saida prevista", "Saida registrada"],
        rows
      };
    }

    const headers = [
      "Pontos batidos",
      "Entradas em ponto",
      "Entradas fora de horario",
      "Saidas em ponto",
      "Saidas fora de horario",
      "Pendentes"
    ];

    if (period === "week") {
      const rows = enumerateDays(range.from, range.to).map((isoDate) => {
        const dayRecords = normalizedRecords.filter((item) => item.record_date_iso === isoDate);
        const m = metricFromRecords(dayRecords);
        return {
          rowLabel: formatDateBr(isoDate),
          columns: [
            mkCell(m.total),
            mkCell(m.entryOnTime, m.entryOnTime > 0 ? "ok" : ""),
            mkCell(m.entryOut, m.entryOut > 0 ? "bad" : ""),
            mkCell(m.exitOnTime, m.exitOnTime > 0 ? "ok" : ""),
            mkCell(m.exitOut, m.exitOut > 0 ? "bad" : ""),
            mkCell(m.pending)
          ]
        };
      });
      return { headers, rows };
    }

    const weekRanges = groupDaysIntoWeeks(range.from, range.to);
    const rows = weekRanges.map((week) => {
      const slice = normalizedRecords.filter(
        (item) => item.record_date_iso >= week.fromIso && item.record_date_iso <= week.toIso
      );
      const m = metricFromRecords(slice);
      return {
        rowLabel: week.label,
        columns: [
          mkCell(m.total),
          mkCell(m.entryOnTime, m.entryOnTime > 0 ? "ok" : ""),
          mkCell(m.entryOut, m.entryOut > 0 ? "bad" : ""),
          mkCell(m.exitOnTime, m.exitOnTime > 0 ? "ok" : ""),
          mkCell(m.exitOut, m.exitOut > 0 ? "bad" : ""),
          mkCell(m.pending)
        ]
      };
    });
    return { headers, rows };
  }, [period, range.from, range.to, normalizedRecords, users, sectorsById]);

  const userTable = useMemo(() => {
    if (!selectedUser) {
      return {
        headers: ["Entrada prevista", "Entrada realizada", "Saida prevista", "Saida realizada", "Status"],
        rows: []
      };
    }

    const sector = sectorsById.get(selectedUser.sector_id);
    const expectedEntry = timeLabel(sector?.entry_time);
    const expectedExit = timeLabel(sector?.exit_time);

    const rows = enumerateDays(range.from, range.to).map((isoDate) => {
      const dayRecords = normalizedRecords.filter((item) => item.record_date_iso === isoDate);
      const entry = dayRecords.find((item) => item.record_type === "ENTRADA");
      const exit = dayRecords.find((item) => item.record_type === "SAIDA");
      const status = dayRecords.length ? dayRecords.map((item) => item.status).join(" / ") : "-";

      return {
        rowLabel: formatDateBr(isoDate),
        columns: [
          mkCell(expectedEntry),
          mkCell(entry ? getRecordTime(entry.recorded_at) : "-", recordTone(entry)),
          mkCell(expectedExit),
          mkCell(exit ? getRecordTime(exit.recorded_at) : "-", recordTone(exit)),
          mkCell(status)
        ]
      };
    });

    return {
      headers: ["Entrada prevista", "Entrada realizada", "Saida prevista", "Saida realizada", "Status"],
      rows
    };
  }, [selectedUser, sectorsById, range.from, range.to, normalizedRecords]);

  const sectorTable = useMemo(() => {
    const sectorUsers = users.filter((user) => String(user.sector_id) === String(selectedSectorId));

    if (period === "today") {
      return {
        headers: ["Entrada prevista", "Entrada registrada", "Saida prevista", "Saida registrada"],
        rows: sectorUsers.map((user) => {
          const userRecords = normalizedRecords.filter((item) => item.user_id === user.id);
          const sector = sectorsById.get(user.sector_id);
          const entry = userRecords.find((item) => item.record_type === "ENTRADA");
          const exit = userRecords.find((item) => item.record_type === "SAIDA");

          return {
            rowLabel: `${user.name} (${user.cpf})`,
            columns: [
              mkCell(timeLabel(sector?.entry_time)),
              mkCell(entry ? getRecordTime(entry.recorded_at) : "-", recordTone(entry)),
              mkCell(timeLabel(sector?.exit_time)),
              mkCell(exit ? getRecordTime(exit.recorded_at) : "-", recordTone(exit))
            ]
          };
        })
      };
    }

    return {
      headers: [
        "Pontos batidos",
        "Entradas em ponto",
        "Entradas fora de horario",
        "Saidas em ponto",
        "Saidas fora de horario",
        "Pendentes"
      ],
      rows: sectorUsers.map((user) => {
        const userRecords = normalizedRecords.filter((record) => record.user_id === user.id);
        const metrics = metricFromRecords(userRecords);

        return {
          rowLabel: `${user.name} (${user.cpf})`,
          columns: [
            mkCell(metrics.total),
            mkCell(metrics.entryOnTime, metrics.entryOnTime > 0 ? "ok" : ""),
            mkCell(metrics.entryOut, metrics.entryOut > 0 ? "bad" : ""),
            mkCell(metrics.exitOnTime, metrics.exitOnTime > 0 ? "ok" : ""),
            mkCell(metrics.exitOut, metrics.exitOut > 0 ? "bad" : ""),
            mkCell(metrics.pending, metrics.pending > 0 ? "bad" : "")
          ]
        };
      })
    };
  }, [normalizedRecords, period, sectorsById, selectedSectorId, users]);

  const activeTable =
    viewMode === "general" ? generalTable : viewMode === "user" ? userTable : sectorTable;
  const firstColumnLabel =
    viewMode === "general" && period === "today"
      ? "Usuario"
      : viewMode === "sector"
        ? "Usuario"
        : "Periodo";

  return (
    <AppShell title="Paineis de Analise">
      {error ? <p className="feedback status-denied">{error}</p> : null}

      <div className="analysis-layout">
        <aside className="analysis-sidebar panel">
          <h2>Periodo</h2>
          <div className="analysis-period-list">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.key}
                className={period === option.key ? "analysis-period-btn active" : "analysis-period-btn"}
                onClick={() => setPeriod(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="muted small">
            Intervalo selecionado: {formatDateBr(range.from)} ate {formatDateBr(range.to)}
          </p>
        </aside>

        <section className="panel analysis-main">
          <div className="analysis-topbar">
            <div className="analysis-tabs">
              {VIEW_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  className={viewMode === option.key ? "analysis-tab active" : "analysis-tab"}
                  onClick={() => setViewMode(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {viewMode === "user" ? (
              <select
                className="analysis-user-select"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                <option value="">Selecione um usuario</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.cpf})
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          {viewMode === "sector" ? (
            <div className="analysis-sector-list">
              {lookups.sectors.map((sector) => (
                <button
                  key={sector.id}
                  type="button"
                  className={
                    String(sector.id) === String(selectedSectorId)
                      ? "analysis-sector-btn active"
                      : "analysis-sector-btn"
                  }
                  onClick={() => setSelectedSectorId(String(sector.id))}
                >
                  {sector.name}
                </button>
              ))}
            </div>
          ) : null}

          <div className="analysis-table-wrap">
            <table className="analysis-table">
              <thead>
                <tr>
                  <th>{firstColumnLabel}</th>
                  {activeTable.headers.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeTable.rows.map((row, idx) => (
                  <tr key={`${row.rowLabel}-${idx}`}>
                    <td>{row.rowLabel}</td>
                    {row.columns.map((cell, colIdx) => (
                      <td
                        key={`${idx}-${colIdx}`}
                        className={
                          cell.tone === "ok"
                            ? "analysis-cell-ok"
                            : cell.tone === "bad"
                              ? "analysis-cell-bad"
                              : ""
                        }
                      >
                        {String(cell.value)}
                      </td>
                    ))}
                  </tr>
                ))}
                {!loading && activeTable.rows.length === 0 ? (
                  <tr>
                    <td colSpan={activeTable.headers.length + 1}>
                      {viewMode === "user"
                        ? "Selecione um usuario para visualizar a analise detalhada."
                        : viewMode === "sector" && selectedSector
                          ? `Nenhum usuario ativo encontrado para o setor ${selectedSector.name}.`
                          : "Sem dados para o periodo selecionado."}
                    </td>
                  </tr>
                ) : null}
                {loading ? (
                  <tr>
                    <td colSpan={activeTable.headers.length + 1}>Carregando dados de analise...</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
};

export default HrAnalyticsPage;
