const onlyDigits = (value) => String(value || "").replace(/\D/g, "");

const isCpfLike = (value) => {
  const digits = onlyDigits(value);
  return digits.length >= 11;
};

module.exports = {
  isCpfLike,
  onlyDigits
};
