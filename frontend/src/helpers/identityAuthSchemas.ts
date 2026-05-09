import { z } from "zod";

import { SECONDS_PER_DAY } from "./datetime";

// Fallback used by identity auth forms when the server's configured
// `MAX_MACHINE_IDENTITY_TOKEN_AGE` is unavailable (e.g. server status hasn't
// loaded yet). 90 days, matching the backend default.
export const MAX_IDENTITY_ACCESS_TOKEN_TTL_FALLBACK = 7_776_000;

// Returns a z.string() with the server-enforced TTL upper-bound refine applied.
// Chain .optional() after for optional fields (e.g. accessTokenPeriod).
export const accessTokenTtlSchema = (maxTTL: number, label: string) =>
  z.string().refine((val) => !val || Number(val) <= maxTTL, {
    message: `${label} cannot exceed ${Math.floor(maxTTL / SECONDS_PER_DAY)} days`
  });
