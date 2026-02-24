const { DateTime } = require("luxon");
const { config } = require("./config");

const ZONE = config.timezone;

const nowInFortaleza = () => DateTime.now().setZone(ZONE);

const normalizeTimeString = (value) => {
  if (!value) return "00:00:00";
  const text = String(value);
  if (text.length === 5) return `${text}:00`;
  return text;
};

const timeStringToMinutes = (value) => {
  const normalized = normalizeTimeString(value);
  const [hour, minute] = normalized.split(":").map((item) => Number(item));
  return hour * 60 + minute;
};

const minutesToTimeLabel = (minutes) => {
  const safe = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const averageMinutesLabel = (values) => {
  if (!values.length) return "-";
  const sum = values.reduce((acc, item) => acc + item, 0);
  return minutesToTimeLabel(Math.round(sum / values.length));
};

const scheduleDiffMinutes = ({ currentMinutes, targetMinutes, toleranceMinutes }) => {
  const lower = targetMinutes - toleranceMinutes;
  const upper = targetMinutes + toleranceMinutes;
  if (currentMinutes < lower) return currentMinutes - lower;
  if (currentMinutes > upper) return currentMinutes - upper;
  return 0;
};

module.exports = {
  ZONE,
  averageMinutesLabel,
  minutesToTimeLabel,
  nowInFortaleza,
  normalizeTimeString,
  scheduleDiffMinutes,
  timeStringToMinutes
};
