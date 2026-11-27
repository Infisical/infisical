import ms from "ms";

const DURATION_UNITS = [
  { seconds: 86_400, suffix: "d", name: "day" },
  { seconds: 3600, suffix: "h", name: "hour" },
  { seconds: 60, suffix: "m", name: "minute" },
  { seconds: 1, suffix: "s", name: "second" }
];

// Uses the largest unit that divides the value exactly, so 5400 reads "90 minutes", not "2 hours".
export const describeDurationSeconds = (seconds: number) => {
  const unit = DURATION_UNITS.find((u) => seconds % u.seconds === 0) ?? DURATION_UNITS[3];
  const amount = seconds / unit.seconds;
  return {
    value: `${amount}${unit.suffix}`,
    label: `${amount} ${unit.name}${amount === 1 ? "" : "s"}`
  };
};

// Renders a stored duration (e.g. "3600000ms" from the CLI or "1h" from the dashboard) in a
// human-readable form, falling back to the raw value if it can't be parsed.
export const formatDuration = (duration?: string) => {
  if (!duration) return "-";
  const parsed = ms(duration);
  if (typeof parsed !== "number") return duration;
  if (parsed > 0 && parsed % 1000 === 0) return describeDurationSeconds(parsed / 1000).label;
  return ms(parsed, { long: true });
};
