const { verifyToken } = require("../auth");
const { pool } = require("../db");

const requireAuth = async (req, res, next) => {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return res.status(401).json({ error: "Token ausente." });

    const decoded = verifyToken(token);
    const userResult = await pool.query(
      `
        SELECT id, name, cpf, role, active
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [decoded.sub]
    );
    if (userResult.rowCount === 0 || !userResult.rows[0].active) {
      return res.status(401).json({ error: "Usuario invalido." });
    }

    req.user = userResult.rows[0];
    next();
  } catch (error) {
    return res.status(401).json({ error: "Token invalido." });
  }
};

const requireRole = (allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: "Acesso negado." });
  }
  next();
};

module.exports = {
  requireAuth,
  requireRole
};
