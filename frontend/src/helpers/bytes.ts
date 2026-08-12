const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

// Binary multiples with the familiar short labels, matching the units the network rule form offers so
// a threshold reads back the same way it was entered.
export const formatBytes = (bytes: number, fractionDigits = 1) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
  const value = bytes / 1024 ** exponent;

  return `${Number(value.toFixed(exponent === 0 ? 0 : fractionDigits))} ${BYTE_UNITS[exponent]}`;
};
