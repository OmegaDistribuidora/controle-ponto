const bcrypt = require("bcryptjs");
const express = require("express");
const { DateTime } = require("luxon");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { createGeneralWorkbook, createUserWorkbook } = require("../services/report");
const { onlyDigits } = require("../utils");
const { nowInFortaleza } = require("../time");

const router = express.Router();
router.use(requireAuth, requireRole(["RH", "ADMIN"]));

const parseDate = (value, fallback) => {
  if (!value) return fallback;
  const dt = DateTime.fromISO(String(value));
  return dt.isValid ? dt.toISODate() : fallback;
};

const getReportDateRange = (query) => {
  const now = nowInFortaleza();
  const defaultFrom = now.startOf("month").toISODate();
  const defaultTo = now.endOf("month").toISODate();
  return {
    dateFrom: parseDate(query.dateFrom, defaultFrom),
    dateTo: parseDate(query.dateTo, defaultTo)
  };
};

const buildRecordFilter = ({ query, includePendingOnly = false }) => {
  const where = [];
  const values = [];
  const add = (sql, value) => {
    values.push(value);
    where.push(sql.replace("?", `$${values.length}`));
  };

  if (includePendingOnly) {
    add("tr.status = ?", "PENDENTE");
  } else if (query.status) {
    add("tr.status = ?", String(query.status));
  }

  if (query.sectorId) add("u.sector_id = ?", Number(query.sectorId));
  if (query.positionId) add("u.position_id = ?", Number(query.positionId));
  if (query.companyId) add("u.company_id = ?", Number(query.companyId));
  if (query.userId) add("u.id = ?", Number(query.userId));
  if (query.dateFrom) add("tr.record_date >= ?", String(query.dateFrom));
  if (query.dateTo) add("tr.record_date <= ?", String(query.dateTo));
  if (query.search) {
    add("(u.name ILIKE ? OR u.cpf ILIKE ?)", `%${String(query.search).trim()}%`);
    values.push(`%${String(query.search).trim()}%`);
    where[where.length - 1] = where[where.length - 1].replace("?", `$${values.length}`);
  }

  return {
    clause: where.length ? `WHERE ${where.join(" AND ")}` : "",
    values
  };
};

const fetchLookups = async () => {
  const [sectors, positions, companies] = await Promise.all([
    pool.query("SELECT id, name, entry_time, exit_time FROM sectors ORDER BY name ASC"),
    pool.query("SELECT id, name FROM positions ORDER BY name ASC"),
    pool.query("SELECT id, name FROM companies ORDER BY name ASC")
  ]);
  return {
    sectors: sectors.rows,
    positions: positions.rows,
    companies: companies.rows
  };
};

router.get("/lookups", async (_req, res) => {
  try {
    return res.json(await fetchLookups());
  } catch (error) {
    return res.status(500).json({ error: "Erro ao buscar listas." });
  }
});

router.get("/users", async (req, res) => {
  try {
    const where = ["u.role = 'USER'"];
    const values = [];
    const add = (sql, value) => {
      values.push(value);
      where.push(sql.replace("?", `$${values.length}`));
    };
    if (req.query.sectorId) add("u.sector_id = ?", Number(req.query.sectorId));
    if (req.query.positionId) add("u.position_id = ?", Number(req.query.positionId));
    if (req.query.companyId) add("u.company_id = ?", Number(req.query.companyId));
    if (req.query.search) {
      const text = `%${String(req.query.search).trim()}%`;
      values.push(text, text);
      where.push(`(u.name ILIKE $${values.length - 1} OR u.cpf ILIKE $${values.length})`);
    }
    const result = await pool.query(
      `
        SELECT
          u.id,
          u.name,
          u.cpf,
          u.active,
          u.created_at,
          u.sector_id,
          u.position_id,
          u.company_id,
          s.name AS sector_name,
          p.name AS position_name,
          c.name AS company_name
        FROM users u
        LEFT JOIN sectors s ON s.id = u.sector_id
        LEFT JOIN positions p ON p.id = u.position_id
        LEFT JOIN companies c ON c.id = u.company_id
        WHERE ${where.join(" AND ")}
        ORDER BY u.name ASC
      `,
      values
    );
    return res.json({ items: result.rows });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao listar usuarios." });
  }
});

router.post("/users", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const cpf = onlyDigits(req.body?.cpf);
    const sectorId = Number(req.body?.sectorId);
    const positionId = Number(req.body?.positionId);
    const companyId = Number(req.body?.companyId);

    if (!name || cpf.length < 11 || !sectorId || !positionId || !companyId) {
      return res.status(400).json({ error: "Dados obrigatorios incompletos." });
    }
    const initialPassword = cpf.slice(0, 3);
    const passwordHash = await bcrypt.hash(initialPassword, 10);

    const inserted = await pool.query(
      `
        INSERT INTO users (name, cpf, password_hash, role, sector_id, position_id, company_id, active)
        VALUES ($1, $2, $3, 'USER', $4, $5, $6, TRUE)
        RETURNING id, name, cpf, role, sector_id, position_id, company_id, active, created_at
      `,
      [name, cpf, passwordHash, sectorId, positionId, companyId]
    );

    return res.status(201).json({
      message: "Usuario criado com sucesso. Senha inicial: 3 primeiros digitos do CPF.",
      user: inserted.rows[0]
    });
  } catch (error) {
    if (String(error.message || "").includes("duplicate key")) {
      return res.status(409).json({ error: "CPF ja cadastrado." });
    }
    return res.status(500).json({ error: "Erro ao criar usuario." });
  }
});

router.put("/users/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const name = String(req.body?.name || "").trim();
    const sectorId = Number(req.body?.sectorId);
    const positionId = Number(req.body?.positionId);
    const companyId = Number(req.body?.companyId);
    const active = req.body?.active === undefined ? true : Boolean(req.body.active);

    if (!id || !name || !sectorId || !positionId || !companyId) {
      return res.status(400).json({ error: "Dados invalidos para atualizacao." });
    }

    const result = await pool.query(
      `
        UPDATE users
        SET name = $1, sector_id = $2, position_id = $3, company_id = $4, active = $5
        WHERE id = $6 AND role = 'USER'
        RETURNING id, name, cpf, role, sector_id, position_id, company_id, active, created_at
      `,
      [name, sectorId, positionId, companyId, active, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Usuario nao encontrado." });
    return res.json({ user: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao atualizar usuario." });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const result = await pool.query(
      `
        UPDATE users
        SET active = FALSE
        WHERE id = $1 AND role = 'USER'
        RETURNING id
      `,
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Usuario nao encontrado." });
    return res.json({ message: "Usuario inativado com sucesso." });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao excluir usuario." });
  }
});

router.get("/pending", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        tr.id,
        tr.record_date,
        tr.record_type,
        tr.recorded_at,
        tr.status,
        tr.outside_tolerance,
        tr.schedule_diff_minutes,
        tr.photo_url,
        tr.system_observation,
        u.id AS user_id,
        u.name AS user_name,
        u.cpf AS user_cpf,
        s.name AS sector_name,
        p.name AS position_name,
        c.name AS company_name
      FROM time_records tr
      JOIN users u ON u.id = tr.user_id
      LEFT JOIN sectors s ON s.id = u.sector_id
      LEFT JOIN positions p ON p.id = u.position_id
      LEFT JOIN companies c ON c.id = u.company_id
      WHERE tr.status = 'PENDENTE'
      ORDER BY tr.recorded_at DESC
    `);
    return res.json({ items: result.rows });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao listar pendencias." });
  }
});

router.get("/records", async (req, res) => {
  try {
    const { clause, values } = buildRecordFilter({ query: req.query });
    const parsedLimit = Number(req.query.limit || 1000);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 10000) : 1000;
    const valuesWithLimit = [...values, limit];
    const result = await pool.query(
      `
        SELECT
          tr.id,
          tr.record_date,
          tr.record_type,
          tr.recorded_at,
          tr.status,
          tr.outside_tolerance,
          tr.schedule_diff_minutes,
          tr.photo_url,
          tr.system_observation,
          tr.decision_observation,
          tr.decided_at,
          u.id AS user_id,
          u.name AS user_name,
          u.cpf AS user_cpf,
          s.name AS sector_name,
          p.name AS position_name,
          c.name AS company_name
        FROM time_records tr
        JOIN users u ON u.id = tr.user_id
        LEFT JOIN sectors s ON s.id = u.sector_id
        LEFT JOIN positions p ON p.id = u.position_id
        LEFT JOIN companies c ON c.id = u.company_id
        ${clause}
        ORDER BY tr.recorded_at DESC
        LIMIT $${valuesWithLimit.length}
      `,
      valuesWithLimit
    );
    return res.json({ items: result.rows });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao buscar registros." });
  }
});

router.patch("/records/:id/decision", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status || "");
    const decisionObservation = String(req.body?.decisionObservation || "").trim();
    if (!id) return res.status(400).json({ error: "ID invalido." });
    if (!["CONFIRMADO", "NEGADO"].includes(status)) {
      return res.status(400).json({ error: "Status permitido: CONFIRMADO ou NEGADO." });
    }

    const result = await pool.query(
      `
        UPDATE time_records
        SET status = $1, decision_observation = $2, decided_by = $3, decided_at = NOW()
        WHERE id = $4 AND status = 'PENDENTE'
        RETURNING id, status, decision_observation, decided_at
      `,
      [status, decisionObservation || null, req.user.id, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Registro nao encontrado ou ja decidido." });
    }
    return res.json({ record: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao decidir pendencia." });
  }
});

router.get("/sectors", async (_req, res) => {
  const result = await pool.query("SELECT id, name, entry_time, exit_time FROM sectors ORDER BY name ASC");
  return res.json({ items: result.rows });
});

router.post("/sectors", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const entryTime = String(req.body?.entryTime || "").trim();
    const exitTime = String(req.body?.exitTime || "").trim();
    if (!name || !entryTime || !exitTime) {
      return res.status(400).json({ error: "Nome, horario de entrada e saida sao obrigatorios." });
    }
    const result = await pool.query(
      `
        INSERT INTO sectors (name, entry_time, exit_time)
        VALUES ($1, $2, $3)
        RETURNING id, name, entry_time, exit_time
      `,
      [name, entryTime, exitTime]
    );
    return res.status(201).json({ item: result.rows[0] });
  } catch (error) {
    if (String(error.message || "").includes("duplicate key")) {
      return res.status(409).json({ error: "Setor ja existe." });
    }
    return res.status(500).json({ error: "Erro ao criar setor." });
  }
});

router.put("/sectors/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const name = String(req.body?.name || "").trim();
    const entryTime = String(req.body?.entryTime || "").trim();
    const exitTime = String(req.body?.exitTime || "").trim();
    const result = await pool.query(
      `
        UPDATE sectors
        SET name = $1, entry_time = $2, exit_time = $3
        WHERE id = $4
        RETURNING id, name, entry_time, exit_time
      `,
      [name, entryTime, exitTime, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Setor nao encontrado." });
    return res.json({ item: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao atualizar setor." });
  }
});

router.delete("/sectors/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const inUse = await pool.query("SELECT 1 FROM users WHERE sector_id = $1 LIMIT 1", [id]);
    if (inUse.rowCount > 0) {
      return res.status(409).json({ error: "Setor em uso por usuarios." });
    }
    const result = await pool.query("DELETE FROM sectors WHERE id = $1 RETURNING id", [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Setor nao encontrado." });
    return res.json({ message: "Setor removido." });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao remover setor." });
  }
});

router.get("/positions", async (_req, res) => {
  const result = await pool.query("SELECT id, name FROM positions ORDER BY name ASC");
  return res.json({ items: result.rows });
});

router.post("/positions", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Nome obrigatorio." });
    const result = await pool.query("INSERT INTO positions (name) VALUES ($1) RETURNING id, name", [name]);
    return res.status(201).json({ item: result.rows[0] });
  } catch (error) {
    if (String(error.message || "").includes("duplicate key")) {
      return res.status(409).json({ error: "Cargo ja existe." });
    }
    return res.status(500).json({ error: "Erro ao criar cargo." });
  }
});

router.put("/positions/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const name = String(req.body?.name || "").trim();
    const result = await pool.query("UPDATE positions SET name = $1 WHERE id = $2 RETURNING id, name", [name, id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Cargo nao encontrado." });
    return res.json({ item: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao atualizar cargo." });
  }
});

router.delete("/positions/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const inUse = await pool.query("SELECT 1 FROM users WHERE position_id = $1 LIMIT 1", [id]);
    if (inUse.rowCount > 0) return res.status(409).json({ error: "Cargo em uso por usuarios." });
    const result = await pool.query("DELETE FROM positions WHERE id = $1 RETURNING id", [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Cargo nao encontrado." });
    return res.json({ message: "Cargo removido." });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao remover cargo." });
  }
});

router.get("/companies", async (_req, res) => {
  const result = await pool.query("SELECT id, name FROM companies ORDER BY name ASC");
  return res.json({ items: result.rows });
});

router.post("/companies", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Nome obrigatorio." });
    const result = await pool.query("INSERT INTO companies (name) VALUES ($1) RETURNING id, name", [name]);
    return res.status(201).json({ item: result.rows[0] });
  } catch (error) {
    if (String(error.message || "").includes("duplicate key")) {
      return res.status(409).json({ error: "Empresa ja existe." });
    }
    return res.status(500).json({ error: "Erro ao criar empresa." });
  }
});

router.put("/companies/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const name = String(req.body?.name || "").trim();
    const result = await pool.query("UPDATE companies SET name = $1 WHERE id = $2 RETURNING id, name", [name, id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Empresa nao encontrada." });
    return res.json({ item: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao atualizar empresa." });
  }
});

router.delete("/companies/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const inUse = await pool.query("SELECT 1 FROM users WHERE company_id = $1 LIMIT 1", [id]);
    if (inUse.rowCount > 0) return res.status(409).json({ error: "Empresa em uso por usuarios." });
    const result = await pool.query("DELETE FROM companies WHERE id = $1 RETURNING id", [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Empresa nao encontrada." });
    return res.json({ message: "Empresa removida." });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao remover empresa." });
  }
});

const fetchFilteredUsersForReport = async (query) => {
  const where = ["u.role = 'USER'"];
  const values = [];
  if (query.sectorId) {
    values.push(Number(query.sectorId));
    where.push(`u.sector_id = $${values.length}`);
  }
  if (query.positionId) {
    values.push(Number(query.positionId));
    where.push(`u.position_id = $${values.length}`);
  }
  if (query.companyId) {
    values.push(Number(query.companyId));
    where.push(`u.company_id = $${values.length}`);
  }
  if (query.search) {
    const text = `%${String(query.search).trim()}%`;
    values.push(text, text);
    where.push(`(u.name ILIKE $${values.length - 1} OR u.cpf ILIKE $${values.length})`);
  }
  const result = await pool.query(
    `
      SELECT
        u.id,
        u.name,
        u.cpf,
        s.name AS sector_name,
        p.name AS position_name,
        c.name AS company_name
      FROM users u
      LEFT JOIN sectors s ON s.id = u.sector_id
      LEFT JOIN positions p ON p.id = u.position_id
      LEFT JOIN companies c ON c.id = u.company_id
      WHERE ${where.join(" AND ")}
      ORDER BY u.name ASC
    `,
    values
  );
  return result.rows;
};

const fetchFilteredRecordsForReport = async (query, dateFrom, dateTo, userId = null) => {
  const where = ["tr.record_date >= $1", "tr.record_date <= $2"];
  const values = [dateFrom, dateTo];
  if (query.sectorId) {
    values.push(Number(query.sectorId));
    where.push(`u.sector_id = $${values.length}`);
  }
  if (query.positionId) {
    values.push(Number(query.positionId));
    where.push(`u.position_id = $${values.length}`);
  }
  if (query.companyId) {
    values.push(Number(query.companyId));
    where.push(`u.company_id = $${values.length}`);
  }
  if (query.search) {
    const text = `%${String(query.search).trim()}%`;
    values.push(text, text);
    where.push(`(u.name ILIKE $${values.length - 1} OR u.cpf ILIKE $${values.length})`);
  }
  if (userId) {
    values.push(userId);
    where.push(`u.id = $${values.length}`);
  }

  const result = await pool.query(
    `
      SELECT
        tr.id,
        tr.user_id,
        tr.record_date,
        tr.record_type,
        tr.recorded_at,
        tr.status,
        tr.outside_tolerance,
        tr.schedule_diff_minutes,
        tr.photo_url,
        tr.system_observation,
        tr.decision_observation,
        u.name AS user_name,
        u.cpf AS user_cpf,
        s.name AS sector_name,
        p.name AS position_name,
        c.name AS company_name
      FROM time_records tr
      JOIN users u ON u.id = tr.user_id
      LEFT JOIN sectors s ON s.id = u.sector_id
      LEFT JOIN positions p ON p.id = u.position_id
      LEFT JOIN companies c ON c.id = u.company_id
      WHERE ${where.join(" AND ")}
      ORDER BY tr.recorded_at ASC
    `,
    values
  );
  return result.rows;
};

router.get("/reports/general.xlsx", async (req, res) => {
  try {
    const { dateFrom, dateTo } = getReportDateRange(req.query);
    const users = await fetchFilteredUsersForReport(req.query);
    const records = await fetchFilteredRecordsForReport(req.query, dateFrom, dateTo);
    const workbook = createGeneralWorkbook({
      filters: { dateFrom, dateTo },
      users,
      records
    });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=relatorio-geral-${dateFrom}-${dateTo}.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    return res.status(500).json({ error: "Erro ao gerar relatorio geral." });
  }
});

router.get("/reports/user/:userId.xlsx", async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: "Usuario invalido." });
    const { dateFrom, dateTo } = getReportDateRange(req.query);

    const userResult = await pool.query(
      `
        SELECT
          u.id,
          u.name,
          u.cpf,
          s.name AS sector_name,
          s.entry_time,
          s.exit_time,
          p.name AS position_name,
          c.name AS company_name
        FROM users u
        LEFT JOIN sectors s ON s.id = u.sector_id
        LEFT JOIN positions p ON p.id = u.position_id
        LEFT JOIN companies c ON c.id = u.company_id
        WHERE u.id = $1 AND u.role = 'USER'
        LIMIT 1
      `,
      [userId]
    );
    if (userResult.rowCount === 0) return res.status(404).json({ error: "Usuario nao encontrado." });

    const records = await fetchFilteredRecordsForReport(req.query, dateFrom, dateTo, userId);
    const workbook = createUserWorkbook({
      filters: { dateFrom, dateTo },
      user: userResult.rows[0],
      records
    });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=relatorio-usuario-${userResult.rows[0].cpf}-${dateFrom}-${dateTo}.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    return res.status(500).json({ error: "Erro ao gerar relatorio por usuario." });
  }
});

module.exports = router;
