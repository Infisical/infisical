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

// Formats a duration string into a human-readable form (e.g. "3600000ms" or "1h" -> "1 hour"),
// falling back to the input if it can't be parsed. For display only; rounds like the ms package.
export const formatDuration = (val: string): string => {
  const parsed = msFn(val as StringValue);
  if (typeof parsed !== "number") return val;
  return msFn(parsed, { long: true });
};
