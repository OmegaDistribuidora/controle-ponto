const bcrypt = require("bcryptjs");
const express = require("express");
const { signToken } = require("../auth");
const { requireAuth } = require("../middleware/auth");
const { pool } = require("../db");
const { onlyDigits } = require("../utils");

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const login = String(req.body?.login ?? req.body?.cpf ?? "").trim();
    const password = String(req.body?.password || "");
    if (!login || !password) {
      return res.status(400).json({ error: "Login e senha sao obrigatorios." });
    }

    let result;
    const loginLower = login.toLowerCase();
    if (["rh", "admin"].includes(loginLower)) {
      result = await pool.query(
        `
          SELECT id, name, cpf, role, password_hash, active
          FROM users
          WHERE LOWER(cpf) = $1 AND role IN ('RH', 'ADMIN')
          LIMIT 1
        `,
        [loginLower]
      );
    } else {
      const cpf = onlyDigits(login);
      result = await pool.query(
        `
          SELECT id, name, cpf, role, password_hash, active
          FROM users
          WHERE cpf = $1 AND role = 'USER'
          LIMIT 1
        `,
        [cpf]
      );
    }

    if (result.rowCount === 0) return res.status(401).json({ error: "Credenciais invalidas." });
    const user = result.rows[0];
    if (!user.active) return res.status(403).json({ error: "Usuario inativo." });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Credenciais invalidas." });

    const token = signToken(user);
    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        cpf: user.cpf,
        role: user.role
      }
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao autenticar." });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          u.id,
          u.name,
          u.cpf,
          u.role,
          u.active,
          s.id AS sector_id,
          s.name AS sector_name,
          s.entry_time,
          s.exit_time,
          p.id AS position_id,
          p.name AS position_name,
          c.id AS company_id,
          c.name AS company_name
        FROM users u
        LEFT JOIN sectors s ON s.id = u.sector_id
        LEFT JOIN positions p ON p.id = u.position_id
        LEFT JOIN companies c ON c.id = u.company_id
        WHERE u.id = $1
        LIMIT 1
      `,
      [req.user.id]
    );
    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ error: "Erro ao buscar usuario." });
  }
});

router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    if (!currentPassword || newPassword.length < 3) {
      return res
        .status(400)
        .json({ error: "Senha atual obrigatoria e nova senha com pelo menos 3 caracteres." });
    }

    const result = await pool.query("SELECT password_hash FROM users WHERE id = $1 LIMIT 1", [req.user.id]);
    const isValid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!isValid) return res.status(401).json({ error: "Senha atual incorreta." });

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [newHash, req.user.id]);
    return res.json({ message: "Senha alterada com sucesso." });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao trocar senha." });
  }
});

module.exports = router;
