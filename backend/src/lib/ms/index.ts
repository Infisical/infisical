import msFn, { StringValue } from "ms";

import { BadRequestError } from "../errors";

export const ms = (val: string) => {
  if (typeof val !== "string") {
    throw new BadRequestError({ message: `Date must be string` });
  }

  try {
    return msFn(val as StringValue);
  } catch {
    throw new BadRequestError({ message: `Invalid date format string: ${val}` });
  }
};

const EXACT_DURATION_UNITS = [
  { seconds: 86_400, name: "day" },
  { seconds: 3600, name: "hour" },
  { seconds: 60, name: "minute" },
  { seconds: 1, name: "second" }
];

// Unlike formatDuration, never rounds: 5400 reads "90 minutes", not "2 hours".
export const formatDurationSeconds = (seconds: number): string => {
  const unit = EXACT_DURATION_UNITS.find((u) => seconds % u.seconds === 0) ?? EXACT_DURATION_UNITS[3];
  const amount = seconds / unit.seconds;
  return `${amount} ${unit.name}${amount === 1 ? "" : "s"}`;
};

// Formats a duration string into a human-readable form (e.g. "3600000ms" or "1h" -> "1 hour"),
// falling back to the input if it can't be parsed. For display only; rounds like the ms package.
export const formatDuration = (val: string): string => {
  const parsed = msFn(val as StringValue);
  if (typeof parsed !== "number") return val;
  return msFn(parsed, { long: true });
};
