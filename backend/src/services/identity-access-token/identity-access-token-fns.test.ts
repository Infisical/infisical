import { afterEach, describe, expect, test, vi } from "vitest";

import { computeIssuedTtl, hasLegacyTokenWithoutExpExceededMaxAge } from "./identity-access-token-fns";

const MAX_AGE = 7_776_000;
const NOW = 1_700_000_000;
const ENFORCED_AT = new Date("2026-05-04T00:00:00.000Z");

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({
    MAX_MACHINE_IDENTITY_TOKEN_AGE: MAX_AGE
  })
}));

describe("computeIssuedTtl", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("at issuance (creationEpoch === nowSeconds)", () => {
    test("requestedTTL=0 and maxTTL=0 returns MAX_AGE", () => {
      expect(computeIssuedTtl({ requestedTTL: 0, maxTTL: 0, creationEpoch: NOW, nowSeconds: NOW })).toBe(MAX_AGE);
    });

    test("requestedTTL larger than MAX_AGE is capped to MAX_AGE", () => {
      expect(computeIssuedTtl({ requestedTTL: MAX_AGE + 10_000, maxTTL: 0, creationEpoch: NOW, nowSeconds: NOW })).toBe(
        MAX_AGE
      );
    });

    test("maxTTL > MAX_AGE is allowed; ceiling still binds the per-issuance JWT", () => {
      expect(computeIssuedTtl({ requestedTTL: 0, maxTTL: MAX_AGE + 50_000, creationEpoch: NOW, nowSeconds: NOW })).toBe(
        MAX_AGE
      );
    });

    test("requestedTTL=600 with maxTTL=3600 returns 600 (requested wins)", () => {
      expect(computeIssuedTtl({ requestedTTL: 600, maxTTL: 3600, creationEpoch: NOW, nowSeconds: NOW })).toBe(600);
    });

    test("maxTTL wins when smaller than requestedTTL (pathological config)", () => {
      expect(computeIssuedTtl({ requestedTTL: 3600, maxTTL: 600, creationEpoch: NOW, nowSeconds: NOW })).toBe(600);
    });
  });

  describe("at renewal (nowSeconds > creationEpoch)", () => {
    test("budget shrinks as time elapses; remainingBudget binds when smaller than requestedTTL", () => {
      // 1h elapsed of a 24h budget; 23h remaining; requested 5h → 5h wins
      const oneHour = 3600;
      const result = computeIssuedTtl({
        requestedTTL: 5 * oneHour,
        maxTTL: 24 * oneHour,
        creationEpoch: NOW,
        nowSeconds: NOW + oneHour
      });
      expect(result).toBe(5 * oneHour);
    });

    test("remainingBudget binds when smaller than requestedTTL near end of life", () => {
      // 23h elapsed of a 24h budget; only 1h remaining; requested 5h → 1h wins
      const oneHour = 3600;
      const result = computeIssuedTtl({
        requestedTTL: 5 * oneHour,
        maxTTL: 24 * oneHour,
        creationEpoch: NOW,
        nowSeconds: NOW + 23 * oneHour
      });
      expect(result).toBe(oneHour);
    });

    test("returns 0 exactly at budget exhaustion", () => {
      const maxTTL = 86_400;
      const result = computeIssuedTtl({
        requestedTTL: 3600,
        maxTTL,
        creationEpoch: NOW,
        nowSeconds: NOW + maxTTL
      });
      expect(result).toBe(0);
    });

    test("returns negative past budget exhaustion (caller rejects on <= 0)", () => {
      const maxTTL = 86_400;
      const result = computeIssuedTtl({
        requestedTTL: 3600,
        maxTTL,
        creationEpoch: NOW,
        nowSeconds: NOW + maxTTL + 60
      });
      expect(result).toBeLessThan(0);
    });

    test("maxTTL > ceiling: each renewed JWT is ceiling-bounded; budget keeps decaying", () => {
      // 180d budget, 90d ceiling, 30d elapsed → 150d remaining → ceiling (90d) wins
      const day = 86_400;
      const result = computeIssuedTtl({
        requestedTTL: 0,
        maxTTL: 180 * day,
        creationEpoch: NOW,
        nowSeconds: NOW + 30 * day
      });
      expect(result).toBe(MAX_AGE);
    });

    test("maxTTL=0 means no budget cap; pure (requested, ceiling) min", () => {
      const result = computeIssuedTtl({
        requestedTTL: 600,
        maxTTL: 0,
        creationEpoch: NOW,
        nowSeconds: NOW + 1_000_000
      });
      expect(result).toBe(600);
    });
  });
});

describe("hasLegacyTokenWithoutExpExceededMaxAge", () => {
  test("does not apply to JWTs that already have exp", () => {
    expect(
      hasLegacyTokenWithoutExpExceededMaxAge({
        exp: NOW,
        enforcedAt: ENFORCED_AT,
        maxAgeSeconds: MAX_AGE,
        nowMs: ENFORCED_AT.getTime() + MAX_AGE * 1000 + 1
      })
    ).toBe(false);
  });

  test("keeps no-exp legacy JWTs valid until deployment plus max age", () => {
    expect(
      hasLegacyTokenWithoutExpExceededMaxAge({
        enforcedAt: ENFORCED_AT,
        maxAgeSeconds: MAX_AGE,
        nowMs: ENFORCED_AT.getTime() + MAX_AGE * 1000
      })
    ).toBe(false);
  });

  test("expires no-exp legacy JWTs after deployment plus max age", () => {
    expect(
      hasLegacyTokenWithoutExpExceededMaxAge({
        enforcedAt: ENFORCED_AT,
        maxAgeSeconds: MAX_AGE,
        nowMs: ENFORCED_AT.getTime() + MAX_AGE * 1000 + 1
      })
    ).toBe(true);
  });
});
