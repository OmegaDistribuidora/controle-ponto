const ExcelJS = require("exceljs");
const { DateTime } = require("luxon");
const { ZONE, averageMinutesLabel, minutesToTimeLabel, timeStringToMinutes } = require("../time");

const isWeekday = (isoDate) => {
  const dt = DateTime.fromISO(isoDate);
  return dt.weekday >= 1 && dt.weekday <= 5;
};

const listWorkdays = (dateFrom, dateTo) => {
  const start = DateTime.fromISO(dateFrom);
  const end = DateTime.fromISO(dateTo);
  const dates = [];
  for (let cursor = start; cursor <= end; cursor = cursor.plus({ days: 1 })) {
    const iso = cursor.toISODate();
    if (isWeekday(iso)) dates.push(iso);
  }
  return dates;
};

const toFortalezaDateTime = (value) => DateTime.fromJSDate(value).setZone(ZONE);

const addHeader = (worksheet, values) => {
  worksheet.addRow(values);
  worksheet.getRow(1).font = { bold: true };
};

const createGeneralWorkbook = ({ filters, users, records }) => {
  const workbook = new ExcelJS.Workbook();
  const resumeSheet = workbook.addWorksheet("Resumo");
  const rankingsSheet = workbook.addWorksheet("Rankings");
  const recordsSheet = workbook.addWorksheet("Registros");

  addHeader(resumeSheet, [
    "Nome",
    "CPF",
    "Setor",
    "Cargo",
    "Empresa",
    "Faltas (dias uteis)",
    "Solicitacoes RH",
    "Atraso total (min)",
    "Adiantado total (min)"
  ]);

  const dateFrom = filters.dateFrom;
  const dateTo = filters.dateTo;
  const workdays = listWorkdays(dateFrom, dateTo);

  const recordsByUser = new Map();
  for (const record of records) {
    if (!recordsByUser.has(record.user_id)) recordsByUser.set(record.user_id, []);
    recordsByUser.get(record.user_id).push(record);
  }

  const rankingRows = [];
  for (const user of users) {
    const userRecords = recordsByUser.get(user.id) || [];
    const daysWithAnyRecord = new Set(userRecords.map((item) => item.record_date));
    const absences = Math.max(workdays.length - daysWithAnyRecord.size, 0);
    const requests = userRecords.filter((item) => item.outside_tolerance).length;
    const delay = userRecords
      .filter((item) => item.schedule_diff_minutes > 0)
      .reduce((acc, item) => acc + item.schedule_diff_minutes, 0);
    const advance = userRecords
      .filter((item) => item.schedule_diff_minutes < 0)
      .reduce((acc, item) => acc + Math.abs(item.schedule_diff_minutes), 0);

    resumeSheet.addRow([
      user.name,
      user.cpf,
      user.sector_name || "-",
      user.position_name || "-",
      user.company_name || "-",
      absences,
      requests,
      delay,
      advance
    ]);

    rankingRows.push({
      name: user.name,
      cpf: user.cpf,
      absences,
      delay,
      advance,
      requests
    });
  }

  addHeader(rankingsSheet, ["Ranking", "Nome", "CPF", "Valor"]);
  rankingRows
    .sort((a, b) => b.absences - a.absences)
    .slice(0, 10)
    .forEach((item, idx) => rankingsSheet.addRow([`Faltas #${idx + 1}`, item.name, item.cpf, item.absences]));
  rankingRows
    .sort((a, b) => b.delay - a.delay)
    .slice(0, 10)
    .forEach((item, idx) => rankingsSheet.addRow([`Atraso #${idx + 1}`, item.name, item.cpf, item.delay]));
  rankingRows
    .sort((a, b) => b.advance - a.advance)
    .slice(0, 10)
    .forEach((item, idx) => rankingsSheet.addRow([`Adiantado #${idx + 1}`, item.name, item.cpf, item.advance]));

  addHeader(recordsSheet, [
    "Nome",
    "CPF",
    "Setor",
    "Cargo",
    "Empresa",
    "Tipo",
    "Data",
    "Hora",
    "Status",
    "Fora tolerancia",
    "Diferenca (min)",
    "Obs sistema",
    "Obs RH"
  ]);

  for (const item of records) {
    const dt = toFortalezaDateTime(item.recorded_at);
    recordsSheet.addRow([
      item.user_name,
      item.user_cpf,
      item.sector_name || "-",
      item.position_name || "-",
      item.company_name || "-",
      item.record_type,
      item.record_date,
      dt.toFormat("HH:mm:ss"),
      item.status,
      item.outside_tolerance ? "SIM" : "NAO",
      item.schedule_diff_minutes,
      item.system_observation || "",
      item.decision_observation || ""
    ]);
  }

  [resumeSheet, rankingsSheet, recordsSheet].forEach((sheet) => {
    sheet.columns.forEach((column) => {
      let maxLength = 10;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const value = cell.value ? String(cell.value) : "";
        if (value.length > maxLength) maxLength = value.length;
      });
      column.width = Math.min(maxLength + 2, 45);
    });
  });

  return workbook;
};

const createUserWorkbook = ({ filters, user, records }) => {
  const workbook = new ExcelJS.Workbook();
  const summarySheet = workbook.addWorksheet("Resumo Usuario");
  const recordsSheet = workbook.addWorksheet("Registros");
  const obsSheet = workbook.addWorksheet("Observacoes RH");

  const entries = records.filter((item) => item.record_type === "ENTRADA");
  const exits = records.filter((item) => item.record_type === "SAIDA");
  const entryMinutes = entries.map((item) => {
    const dt = toFortalezaDateTime(item.recorded_at);
    return dt.hour * 60 + dt.minute;
  });
  const exitMinutes = exits.map((item) => {
    const dt = toFortalezaDateTime(item.recorded_at);
    return dt.hour * 60 + dt.minute;
  });

  const delay = records
    .filter((item) => item.schedule_diff_minutes > 0)
    .reduce((acc, item) => acc + item.schedule_diff_minutes, 0);
  const advance = records
    .filter((item) => item.schedule_diff_minutes < 0)
    .reduce((acc, item) => acc + Math.abs(item.schedule_diff_minutes), 0);

  const requests = records.filter((item) => item.outside_tolerance).length;
  const totalWorkdays = listWorkdays(filters.dateFrom, filters.dateTo).length;
  const daysWithAnyRecord = new Set(records.map((item) => item.record_date)).size;
  const absences = Math.max(totalWorkdays - daysWithAnyRecord, 0);

  summarySheet.addRows([
    ["Nome", user.name],
    ["CPF", user.cpf],
    ["Setor", user.sector_name || "-"],
    ["Cargo", user.position_name || "-"],
    ["Empresa", user.company_name || "-"],
    ["Periodo", `${filters.dateFrom} ate ${filters.dateTo}`],
    ["Horario medio entrada", averageMinutesLabel(entryMinutes)],
    ["Horario medio saida", averageMinutesLabel(exitMinutes)],
    ["Atraso total (min)", delay],
    ["Adiantado total (min)", advance],
    ["Solicitacoes RH", requests],
    ["Faltas (dias uteis)", absences],
    [
      "Horario do setor",
      user.entry_time && user.exit_time
        ? `${minutesToTimeLabel(timeStringToMinutes(user.entry_time))} - ${minutesToTimeLabel(
            timeStringToMinutes(user.exit_time)
          )}`
        : "-"
    ]
  ]);
  summarySheet.getColumn(1).width = 26;
  summarySheet.getColumn(2).width = 36;

  addHeader(recordsSheet, [
    "Tipo",
    "Data",
    "Hora",
    "Status",
    "Fora tolerancia",
    "Diferenca (min)",
    "Obs sistema",
    "Obs RH"
  ]);
  for (const item of records) {
    const dt = toFortalezaDateTime(item.recorded_at);
    recordsSheet.addRow([
      item.record_type,
      item.record_date,
      dt.toFormat("HH:mm:ss"),
      item.status,
      item.outside_tolerance ? "SIM" : "NAO",
      item.schedule_diff_minutes,
      item.system_observation || "",
      item.decision_observation || ""
    ]);
  }

  addHeader(obsSheet, ["Data", "Tipo", "Decisao RH", "Observacao RH"]);
  for (const item of records.filter((row) => row.decision_observation)) {
    const dt = toFortalezaDateTime(item.recorded_at);
    obsSheet.addRow([item.record_date, item.record_type, item.status, item.decision_observation || ""]);
    if (!item.record_date) obsSheet.getCell(`A${obsSheet.rowCount}`).value = dt.toISODate();
  }

  [recordsSheet, obsSheet].forEach((sheet) => {
    sheet.columns.forEach((column) => {
      let maxLength = 10;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const value = cell.value ? String(cell.value) : "";
        if (value.length > maxLength) maxLength = value.length;
      });
      column.width = Math.min(maxLength + 2, 45);
    });
  });

  return workbook;
};

module.exports = {
  createGeneralWorkbook,
  createUserWorkbook
};
