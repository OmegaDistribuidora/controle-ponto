const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const { config } = require("./config");

const pool = new Pool(
  config.postgres.connectionString
    ? {
        connectionString: config.postgres.connectionString,
        ssl: config.postgres.ssl || config.postgres.connectionString.includes("railway")
          ? { rejectUnauthorized: false }
          : false
      }
    : {
        host: config.postgres.host,
        port: config.postgres.port,
        database: config.postgres.database,
        user: config.postgres.user,
        password: config.postgres.password,
        ssl: config.postgres.ssl ? { rejectUnauthorized: false } : false
      }
);

const ensureSeedUser = async ({ cpf, name, role, password }) => {
  const hash = await bcrypt.hash(password, 10);
  const login = String(cpf).trim().toLowerCase();

  const byLogin = await pool.query(
    "SELECT id, role FROM users WHERE LOWER(cpf) = $1 ORDER BY id ASC LIMIT 1",
    [login]
  );
  if (byLogin.rowCount > 0 && byLogin.rows[0].role === role) {
    await pool.query(
      `
        UPDATE users
        SET name = $1, cpf = $2, password_hash = $3, active = TRUE
        WHERE id = $4
      `,
      [name, login, hash, byLogin.rows[0].id]
    );
    return;
  }

  const byRole = await pool.query("SELECT id FROM users WHERE role = $1 ORDER BY id ASC LIMIT 1", [role]);
  if (byRole.rowCount > 0) {
    await pool.query(
      `
        UPDATE users
        SET name = $1, cpf = $2, password_hash = $3, active = TRUE
        WHERE id = $4
      `,
      [name, login, hash, byRole.rows[0].id]
    );
    return;
  }

  await pool.query(
    `
      INSERT INTO users (name, cpf, password_hash, role, active)
      VALUES ($1, $2, $3, $4, TRUE)
    `,
    [name, login, hash, role]
  );
};

const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS positions (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sectors (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      entry_time TIME NOT NULL,
      exit_time TIME NOT NULL,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query("ALTER TABLE sectors ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION");
  await pool.query("ALTER TABLE sectors ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      cpf TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('RH', 'ADMIN', 'USER')),
      sector_id INTEGER REFERENCES sectors(id) ON DELETE SET NULL,
      position_id INTEGER REFERENCES positions(id) ON DELETE SET NULL,
      company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS time_records (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      record_date DATE NOT NULL,
      record_type TEXT NOT NULL CHECK (record_type IN ('ENTRADA', 'SAIDA')),
      recorded_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('CONFIRMADO', 'PENDENTE', 'NEGADO')),
      outside_tolerance BOOLEAN NOT NULL DEFAULT FALSE,
      schedule_diff_minutes INTEGER NOT NULL DEFAULT 0,
      photo_url TEXT NOT NULL,
      drive_file_id TEXT,
      system_observation TEXT,
      decision_observation TEXT,
      decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      decided_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uniq_user_day_type UNIQUE (user_id, record_date, record_type)
    )
  `);

  await pool.query(`
    INSERT INTO sectors (name, entry_time, exit_time, latitude, longitude)
    VALUES
      ('Licitacao - Barroso', '07:30', '17:30', NULL, NULL),
      ('Administrativo - Barroso', '08:00', '18:00', NULL, NULL)
    ON CONFLICT (name) DO UPDATE
    SET
      entry_time = EXCLUDED.entry_time,
      exit_time = EXCLUDED.exit_time
  `);

  await pool.query(`
    INSERT INTO companies (name)
    VALUES ('Omega'), ('Orion')
    ON CONFLICT (name) DO NOTHING
  `);

  await pool.query(`
    INSERT INTO positions (name)
    VALUES ('Licitacao')
    ON CONFLICT (name) DO NOTHING
  `);

  await ensureSeedUser({
    cpf: config.seed.rh.cpf,
    name: config.seed.rh.name,
    role: "RH",
    password: config.seed.rh.password
  });
  await ensureSeedUser({
    cpf: config.seed.admin.cpf,
    name: config.seed.admin.name,
    role: "ADMIN",
    password: config.seed.admin.password
  });
};

module.exports = {
  initDb,
  pool
};
