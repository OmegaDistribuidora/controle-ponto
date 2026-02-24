import { API_BASE_URL } from "./api";

export const onlyDigits = (value) => String(value || "").replace(/\D/g, "");

export const formatCpfInput = (value) => {
  const digits = onlyDigits(value).slice(0, 11);
  const part1 = digits.slice(0, 3);
  const part2 = digits.slice(3, 6);
  const part3 = digits.slice(6, 9);
  const part4 = digits.slice(9, 11);

  if (digits.length <= 3) return part1;
  if (digits.length <= 6) return `${part1}.${part2}`;
  if (digits.length <= 9) return `${part1}.${part2}.${part3}`;
  return `${part1}.${part2}.${part3}-${part4}`;
};

const isDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

const toSafeDate = (value) => {
  const text = String(value || "");
  if (!text) return null;
  if (isDateOnly(text)) {
    const [year, month, day] = text.split("-").map((item) => Number(item));
    return new Date(year, month - 1, day, 0, 0, 0);
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatDateBr = (value) => {
  const date = toSafeDate(value);
  if (!date) return "Data inválida";
  return date.toLocaleDateString("pt-BR", {
    timeZone: "America/Fortaleza"
  });
};

export const formatDateTimeBr = (value) => {
  const date = toSafeDate(value);
  if (!date) return "Data inválida";
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Fortaleza"
  });
};

const getApiOrigin = () => {
  try {
    return new URL(API_BASE_URL, window.location.origin).origin;
  } catch (_error) {
    return window.location.origin;
  }
};

export const resolveMediaUrl = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith("//")) return `${window.location.protocol}${text}`;
  const base = getApiOrigin();
  return `${base}${text.startsWith("/") ? "" : "/"}${text}`;
};

export const statusClass = (status) => {
  if (status === "CONFIRMADO") return "status-confirmed";
  if (status === "PENDENTE") return "status-pending";
  return "status-denied";
};

export const statusLabel = (status) => {
  if (status === "CONFIRMADO") return "Confirmado";
  if (status === "PENDENTE") return "Pendente";
  return "Negado";
};
