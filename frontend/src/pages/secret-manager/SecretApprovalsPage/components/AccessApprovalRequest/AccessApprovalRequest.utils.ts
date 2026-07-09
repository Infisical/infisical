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

// Single source for the access-duration copy so the label a requester previews in
// RequestAccessForm matches what reviewers later see in ReviewAccessModal.
export const getAccessDurationLabel = (isTemporary?: boolean, temporaryRange?: string | null) => {
  if (!isTemporary || !temporaryRange) return "Permanent";
  const rangeMs = parseAccessDurationMs(temporaryRange);
  if (!rangeMs) return `Valid for ${temporaryRange} after approval`;
  return `Valid for ${ms(rangeMs, { long: true })} after approval`;
};
