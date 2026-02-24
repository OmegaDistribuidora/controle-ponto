import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import AppShell from "../components/AppShell";
import api from "../api";
import { formatDateBr, formatDateTimeBr } from "../utils";

const toQuery = (filters) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      params.set(key, value);
    }
  });
  return params.toString();
};

const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const getFortalezaDateAndTime = () => {
  const now = new Date();
  const date = now.toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" });
  const time = now.toLocaleTimeString("pt-BR", {
    timeZone: "America/Fortaleza",
    hour12: false
  });
  return { date, time };
};

const buildGeneratedByMessage = () => {
  const { date, time } = getFortalezaDateAndTime();
  return `Este relatório foi gerado pelo sistema de controle de ponto interno da Omega Distribuidora no dia ${date} às ${time}.`;
};

const formatRecordTime = (value) => {
  const dateTime = formatDateTimeBr(value);
  if (dateTime === "Data inválida") return "-";
  const parts = dateTime.split(" ");
  return parts[1] || "-";
};

const HrReportsPage = () => {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [lookups, setLookups] = useState({ sectors: [], positions: [], companies: [] });
  const [selectedUserId, setSelectedUserId] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    sectorId: "",
    positionId: "",
    companyId: "",
    status: "",
    dateFrom: "",
    dateTo: ""
  });

  const selectedUser = useMemo(
    () => users.find((item) => String(item.id) === String(selectedUserId)) || null,
    [users, selectedUserId]
  );

  const baseReportFilters = useMemo(
    () => ({
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      sectorId: filters.sectorId,
      positionId: filters.positionId,
      companyId: filters.companyId,
      search: filters.search,
      status: filters.status
    }),
    [filters]
  );

  const loadData = async () => {
    setError("");
    try {
      const [usersRes, lookupsRes] = await Promise.all([api.get("/hr/users"), api.get("/hr/lookups")]);
      setUsers(usersRes.data.items || []);
      setLookups(lookupsRes.data);
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao carregar dados de relatórios.");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const exportGeneralExcel = async () => {
    try {
      setLoading(true);
      const query = toQuery(baseReportFilters);
      const response = await api.get(`/hr/reports/general.xlsx${query ? `?${query}` : ""}`, {
        responseType: "blob"
      });
      downloadBlob(response.data, "relatório-geral.xlsx");
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao exportar relatório geral em Excel.");
    } finally {
      setLoading(false);
    }
  };

  const exportUserExcel = async () => {
    if (!selectedUserId) {
      setError("Selecione um usuário para gerar o relatório individual.");
      return;
    }
    try {
      setLoading(true);
      const query = toQuery(baseReportFilters);
      const response = await api.get(
        `/hr/reports/user/${selectedUserId}.xlsx${query ? `?${query}` : ""}`,
        {
          responseType: "blob"
        }
      );
      const safeCpf = selectedUser?.cpf || "usuario";
      downloadBlob(response.data, `relatório-${safeCpf}.xlsx`);
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao exportar relatório do usuário em Excel.");
    } finally {
      setLoading(false);
    }
  };

  const exportGeneralPdf = async () => {
    try {
      setLoading(true);
      const query = toQuery(baseReportFilters);
      const response = await api.get(`/hr/records${query ? `?${query}` : ""}`);
      const records = response.data.items || [];

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const { date, time } = getFortalezaDateAndTime();
      doc.setFontSize(16);
      doc.text("Relatório Geral de Ponto", 14, 14);
      doc.setFontSize(10);
      doc.text(`Gerado em ${date} às ${time} (Fortaleza/CE)`, 14, 20);

      const body = records.map((item) => [
        item.user_name || "-",
        item.user_cpf || "-",
        item.record_type || "-",
        formatDateBr(item.record_date),
        formatRecordTime(item.recorded_at),
        item.status || "-",
        item.sector_name || "-",
        item.position_name || "-",
        item.company_name || "-",
        item.decision_observation || ""
      ]);

      autoTable(doc, {
        startY: 26,
        head: [["Nome", "CPF", "Tipo", "Data", "Hora", "Status", "Setor", "Cargo", "Empresa", "Obs. RH"]],
        body: body.length ? body : [["Sem registros no período.", "", "", "", "", "", "", "", "", ""]],
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [0, 108, 103] }
      });

      const footerY = Math.min((doc.lastAutoTable?.finalY || 26) + 10, 200);
      doc.setFontSize(9);
      doc.text(buildGeneratedByMessage(), 14, footerY, { maxWidth: 270 });
      doc.save("relatório-geral.pdf");
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao exportar relatório geral em PDF.");
    } finally {
      setLoading(false);
    }
  };

  const exportUserPdf = async () => {
    if (!selectedUserId) {
      setError("Selecione um usuário para gerar o relatório individual.");
      return;
    }
    try {
      setLoading(true);
      const query = toQuery({
        ...baseReportFilters,
        userId: selectedUserId
      });
      const response = await api.get(`/hr/records${query ? `?${query}` : ""}`);
      const records = response.data.items || [];

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const { date, time } = getFortalezaDateAndTime();
      doc.setFontSize(16);
      doc.text("Relatório Individual de Ponto", 14, 14);
      doc.setFontSize(10);
      doc.text(`Usuário: ${selectedUser?.name || "-"} (${selectedUser?.cpf || "-"})`, 14, 20);
      doc.text(`Gerado em ${date} às ${time} (Fortaleza/CE)`, 14, 26);

      const body = records.map((item) => [
        formatDateBr(item.record_date),
        formatRecordTime(item.recorded_at),
        item.record_type || "-",
        item.status || "-",
        item.system_observation || "",
        item.decision_observation || ""
      ]);

      autoTable(doc, {
        startY: 32,
        head: [["Data", "Hora", "Tipo", "Status", "Obs. Sistema", "Obs. RH"]],
        body: body.length ? body : [["Sem registros no período.", "", "", "", "", ""]],
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [0, 108, 103] }
      });

      const footerY = Math.min((doc.lastAutoTable?.finalY || 32) + 10, 280);
      doc.setFontSize(9);
      doc.text(buildGeneratedByMessage(), 14, footerY, { maxWidth: 180 });
      const safeCpf = selectedUser?.cpf || "usuario";
      doc.save(`relatório-${safeCpf}.pdf`);
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao exportar relatório individual em PDF.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell title="Relatórios">
      {error ? <p className="feedback status-denied">{error}</p> : null}

      <section className="panel">
        <h2>Filtros dos relatórios</h2>
        <form className="filter-grid">
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
          <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
            <option value="">Selecione um usuário (relatório individual)</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.cpf})
              </option>
            ))}
          </select>
        </form>
      </section>

      <div className="grid-two">
        <section className="panel">
          <h2>Relatório geral</h2>
          <p className="muted">
            Exporta todos os registros conforme filtros aplicados (Excel e PDF).
          </p>
          <div className="row-actions">
            <button onClick={exportGeneralExcel} disabled={loading}>
              Exportar Excel
            </button>
            <button className="ghost-btn" onClick={exportGeneralPdf} disabled={loading}>
              Exportar PDF
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>Relatório por usuário</h2>
          <p className="muted">
            Escolha um usuário e exporte apenas os registros dele no período selecionado.
          </p>
          <div className="row-actions">
            <button onClick={exportUserExcel} disabled={loading}>
              Exportar Excel
            </button>
            <button className="ghost-btn" onClick={exportUserPdf} disabled={loading}>
              Exportar PDF
            </button>
          </div>
        </section>
      </div>

      <section className="panel">
        <p className="muted">
          O PDF incluirá automaticamente a mensagem: "Este relatório foi gerado pelo sistema de controle
          de ponto interno da Omega Distribuidora..." com data e horário de Fortaleza.
        </p>
      </section>
    </AppShell>
  );
};

export default HrReportsPage;
