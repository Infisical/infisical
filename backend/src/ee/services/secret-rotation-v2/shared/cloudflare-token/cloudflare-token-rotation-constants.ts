/**
 * A generated token stays active across at most two rotation cycles, so `2 * interval + 1` days can
 * never expire a token that is still in use. The floor keeps rotation development mode (where the
 * interval is treated as minutes) from producing a near-immediate expiry.
 */
export const CLOUDFLARE_TOKEN_MIN_TTL_DAYS = 7;

/**
 * Cloudflare caps token names at 120 characters. We generate names as `<name>-<timestamp>`, so the
 * user-supplied portion is capped lower to leave room for the suffix.
 */
export const CLOUDFLARE_TOKEN_NAME_MAX_LENGTH = 100;
