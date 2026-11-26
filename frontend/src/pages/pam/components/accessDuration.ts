import { capDurationOptions, parseDurationMs } from "@app/helpers/datetime";

import { describeDurationSeconds } from "./formatDuration";

type TAccessDurationOption = { value: string; label: string };

const ACCESS_DURATION_PRESETS: TAccessDurationOption[] = [
  { value: "15m", label: "15 minutes" },
  { value: "1h", label: "1 hour" },
  { value: "4h", label: "4 hours" },
  { value: "1d", label: "1 day" },
  { value: "3d", label: "3 days" },
  { value: "7d", label: "1 week" }
];

export const getAccessDurationOptions = (maxSeconds?: number | null): TAccessDurationOption[] => {
  if (!maxSeconds) return ACCESS_DURATION_PRESETS;
  return capDurationOptions(
    ACCESS_DURATION_PRESETS,
    maxSeconds * 1000,
    describeDurationSeconds(maxSeconds)
  );
};

export const formatAccessDurationLimit = (maxSeconds: number) =>
  describeDurationSeconds(maxSeconds).label;

// Approval grants at most the template max, even for requests raised before it was lowered.
export const isAccessDurationCapped = (duration?: string, maxSeconds?: number | null) => {
  const requestedMs = parseDurationMs(duration);
  return Boolean(maxSeconds && requestedMs !== null && requestedMs > maxSeconds * 1000);
};
