const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

// Binary multiples with the familiar short labels, matching the units the network rule form offers so
// a threshold reads back the same way it was entered.
export const formatBytes = (bytes: number, fractionDigits = 1) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
  const value = bytes / 1024 ** exponent;

  return `${Number(value.toFixed(exponent === 0 ? 0 : fractionDigits))} ${BYTE_UNITS[exponent]}`;
};

// A transfer threshold is a rate, so the window is half the number's meaning: "100 MB" alone says
// nothing without "per minute". Renders the common windows as words and anything else as a duration.
export const formatTransferWindow = (seconds?: number | null) => {
  if (!seconds || seconds <= 0) return "minute";
  if (seconds === 1) return "second";
  if (seconds === 60) return "minute";
  if (seconds === 3600) return "hour";
  if (seconds % 3600 === 0) return `${seconds / 3600} hours`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds}s`;
};
