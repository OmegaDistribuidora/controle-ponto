const express = require("express");
const { pool } = require("../db");
const { uploadPunchPhoto } = require("../services/drive");
const { config } = require("../config");
const { nowInFortaleza, scheduleDiffMinutes, timeStringToMinutes } = require("../time");
const { isCpfLike, onlyDigits } = require("../utils");

const router = express.Router();

const EARTH_RADIUS_METERS = 6371000;

const distanceMeters = ({ fromLat, fromLon, toLat, toLon }) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(toLat - fromLat);
  const dLon = toRad(toLon - fromLon);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
};

router.post("/punch", async (req, res) => {
  try {
    const cpf = onlyDigits(req.body?.cpf);
    const imageBase64 = String(req.body?.imageBase64 || "");
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    if (!isCpfLike(cpf)) return res.status(400).json({ error: "CPF invalido." });
    if (!imageBase64) return res.status(400).json({ error: "Foto obrigatoria para registrar ponto." });
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({ error: "Localizacao obrigatoria para registrar ponto." });
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: "Coordenadas de localizacao invalidas." });
    }

    const userResult = await pool.query(
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
          s.latitude AS sector_latitude,
          s.longitude AS sector_longitude
        FROM users u
        LEFT JOIN sectors s ON s.id = u.sector_id
        WHERE u.cpf = $1
        LIMIT 1
      `,
      [cpf]
    );
    if (userResult.rowCount === 0) return res.status(404).json({ error: "Usuario nao encontrado." });
    const user = userResult.rows[0];
    if (!user.active) return res.status(403).json({ error: "Usuario inativo." });
    if (user.role !== "USER") {
      return res.status(403).json({ error: "Apenas usuarios comuns podem bater ponto neste fluxo." });
    }
    if (!user.sector_id) {
      return res.status(400).json({ error: "Usuario sem setor vinculado. Procure o RH." });
    }
    if (!Number.isFinite(Number(user.sector_latitude)) || !Number.isFinite(Number(user.sector_longitude))) {
      return res
        .status(400)
        .json({ error: "Setor sem coordenadas de localizacao. Procure o RH para configurar." });
    }

    const sectorDistance = distanceMeters({
      fromLat: latitude,
      fromLon: longitude,
      toLat: Number(user.sector_latitude),
      toLon: Number(user.sector_longitude)
    });
    if (sectorDistance > config.maxPunchDistanceMeters) {
      return res.status(403).json({
        error: `Fora da area permitida para este setor. Distancia atual: ${Math.round(
          sectorDistance
        )}m (limite ${config.maxPunchDistanceMeters}m).`
      });
    }

    const now = nowInFortaleza();
    const recordDate = now.toISODate();
    const dayCountResult = await pool.query(
      "SELECT record_type FROM time_records WHERE user_id = $1 AND record_date = $2 ORDER BY created_at ASC",
      [user.id, recordDate]
    );
    if (dayCountResult.rowCount >= 2) {
      return res.status(409).json({ error: "Voce ja registrou entrada e saida hoje." });
    }

    const recordType = dayCountResult.rowCount === 0 ? "ENTRADA" : "SAIDA";
    const currentMinutes = now.hour * 60 + now.minute;
    const targetMinutes =
      recordType === "ENTRADA"
        ? timeStringToMinutes(user.entry_time)
        : timeStringToMinutes(user.exit_time);
    const diffMinutes = scheduleDiffMinutes({
      currentMinutes,
      targetMinutes,
      toleranceMinutes: config.toleranceMinutes
    });

    const outsideTolerance = diffMinutes !== 0;
    const status = outsideTolerance ? "PENDENTE" : "CONFIRMADO";
    const systemObservation = outsideTolerance
      ? diffMinutes > 0
        ? `Registro fora da tolerancia: ${diffMinutes} min apos limite.`
        : `Registro fora da tolerancia: ${Math.abs(diffMinutes)} min antes do limite.`
      : "Registro dentro da tolerancia do setor.";

    const upload = await uploadPunchPhoto({
      base64Image: imageBase64,
      cpf,
      recordType,
      recordDate
    });

    const insertResult = await pool.query(
      `
        INSERT INTO time_records (
          user_id,
          record_date,
          record_type,
          recorded_at,
          status,
          outside_tolerance,
          schedule_diff_minutes,
          photo_url,
          drive_file_id,
          system_observation
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, record_date, record_type, recorded_at, status, photo_url, outside_tolerance, system_observation
      `,
      [
        user.id,
        recordDate,
        recordType,
        now.toUTC().toJSDate(),
        status,
        outsideTolerance,
        diffMinutes,
        upload.url,
        upload.fileId,
        systemObservation
      ]
    );

    return res.json({
      message: status === "CONFIRMADO" ? "Ponto registrado com sucesso." : "Ponto com pendencias. Contate o RH.",
      record: insertResult.rows[0]
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao registrar ponto." });
  }
});

module.exports = router;
