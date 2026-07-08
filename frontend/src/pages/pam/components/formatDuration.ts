import ms from "ms";

// Renders a stored duration (e.g. "3600000ms" from the CLI or "1h" from the dashboard) in a
// human-readable form, falling back to the raw value if it can't be parsed.
export const formatDuration = (duration?: string) => {
  if (!duration) return "-";
  const parsed = ms(duration);
  if (typeof parsed !== "number") return duration;
  return ms(parsed, { long: true });
};
