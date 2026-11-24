import ms from "ms";

type TAccessDurationOption = { value: string; label: string };

const ACCESS_DURATION_PRESETS: TAccessDurationOption[] = [
  { value: "15m", label: "15 minutes" },
  { value: "1h", label: "1 hour" },
  { value: "4h", label: "4 hours" },
  { value: "1d", label: "1 day" },
  { value: "3d", label: "3 days" },
  { value: "7d", label: "1 week" }
];

const DURATION_UNITS = [
  { seconds: 86_400, suffix: "d", name: "day" },
  { seconds: 3600, suffix: "h", name: "hour" },
  { seconds: 60, suffix: "m", name: "minute" },
  { seconds: 1, suffix: "s", name: "second" }
];

const toDurationOption = (seconds: number): TAccessDurationOption => {
  const unit = DURATION_UNITS.find((u) => seconds % u.seconds === 0) ?? DURATION_UNITS[3];
  const amount = seconds / unit.seconds;
  return {
    value: `${amount}${unit.suffix}`,
    label: `${amount} ${unit.name}${amount === 1 ? "" : "s"}`
  };
};

const parseMs = (duration?: string) => {
  if (!duration) return null;
  const parsed = ms(duration);
  return typeof parsed === "number" && parsed > 0 ? parsed : null;
};

export const getAccessDurationOptions = (maxSeconds?: number | null): TAccessDurationOption[] => {
  if (!maxSeconds) return ACCESS_DURATION_PRESETS;
  const maxMs = maxSeconds * 1000;
  const allowed = ACCESS_DURATION_PRESETS.filter((option) => (parseMs(option.value) ?? 0) <= maxMs);
  if (allowed.some((option) => parseMs(option.value) === maxMs)) return allowed;
  return [...allowed, toDurationOption(maxSeconds)];
};

export const formatAccessDurationLimit = (maxSeconds: number) => toDurationOption(maxSeconds).label;

// Approval grants at most the template max, even for requests raised before it was lowered.
export const isAccessDurationCapped = (duration?: string, maxSeconds?: number | null) => {
  const requestedMs = parseMs(duration);
  return Boolean(maxSeconds && requestedMs !== null && requestedMs > maxSeconds * 1000);
};
