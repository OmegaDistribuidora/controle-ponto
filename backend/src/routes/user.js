const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { pool } = require("../db");

const router = express.Router();

router.use(requireAuth, requireRole(["USER"]));

router.get("/records", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 100);
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
          decider.name AS decided_by_name,
          tr.decided_at
        FROM time_records tr
        LEFT JOIN users decider ON decider.id = tr.decided_by
        WHERE tr.user_id = $1
        ORDER BY tr.recorded_at DESC
        LIMIT $2
      `,
      [req.user.id, limit]
    );
    return res.json({ items: result.rows });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao buscar historico." });
  }
});

module.exports = router;
