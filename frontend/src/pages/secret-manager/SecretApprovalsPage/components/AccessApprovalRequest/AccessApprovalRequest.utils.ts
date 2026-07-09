import ms from "ms";

// Parse a user-supplied duration string ("30m", "2h", "1d") to milliseconds.
// Returns undefined for anything ms() can't parse to a positive number.
export const parseAccessDurationMs = (value?: string | null) => {
  if (!value) return undefined;
  try {
    const parsed = ms(value);
    return typeof parsed === "number" && parsed > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const DURATION_UNITS = [
  { label: "day", ms: 24 * 60 * 60 * 1000 },
  { label: "hour", ms: 60 * 60 * 1000 },
  { label: "minute", ms: 60 * 1000 },
  { label: "second", ms: 1000 }
] as const;

// Break a duration into its exact day/hour/minute/second parts instead of letting
// ms() round to a single unit (e.g. 90m -> "1 hour 30 minutes", not "2 hours").
export const formatAccessDuration = (durationMs: number) => {
  const parts: string[] = [];
  let remaining = durationMs;

  DURATION_UNITS.forEach(({ label, ms: unitMs }) => {
    const count = Math.floor(remaining / unitMs);
    if (count > 0) {
      parts.push(`${count} ${label}${count === 1 ? "" : "s"}`);
      remaining -= count * unitMs;
    }
  });

  return parts.length ? parts.join(" ") : "0 seconds";
};

// Single source for the access-duration copy so the label a requester previews in
// RequestAccessForm matches what reviewers later see in ReviewAccessModal.
export const getAccessDurationLabel = (isTemporary?: boolean, temporaryRange?: string | null) => {
  if (!isTemporary || !temporaryRange) return "Permanent";
  const rangeMs = parseAccessDurationMs(temporaryRange);
  if (!rangeMs) return `Valid for ${temporaryRange} after approval`;
  return `Valid for ${formatAccessDuration(rangeMs)} after approval`;
};
