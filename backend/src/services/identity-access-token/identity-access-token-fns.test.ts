import { afterEach, describe, expect, test, vi } from "vitest";

import {
  computeIssuedTtl,
  computePerTokenMarkerExpiry,
  computeRevocationVerdictFingerprint,
  computeSingleIssuanceTtlCap,
  computeTokenAuthRevokeMarkerExpiry,
  evaluateRevocationMarkers,
  hasLegacyTokenWithoutExpExceededMaxAge,
  IDENTITY_REVOCATION_MARKER_SKEW_SECONDS
} from "./identity-access-token-fns";

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

describe("computeSingleIssuanceTtlCap", () => {
  test("returns the requested TTL when below the ceiling", () => {
    expect(computeSingleIssuanceTtlCap({ requestedTTL: 3600, accessTokenPeriod: 0 })).toBe(3600);
  });

  test("caps the requested TTL at the ceiling", () => {
    expect(computeSingleIssuanceTtlCap({ requestedTTL: MAX_AGE + 10_000, accessTokenPeriod: 0 })).toBe(MAX_AGE);
  });

  test("falls back to the ceiling when TTL is unset (the true worst case)", () => {
    expect(computeSingleIssuanceTtlCap({ requestedTTL: 0, accessTokenPeriod: 0 })).toBe(MAX_AGE);
  });

  test("periodic mode uses period as the effective TTL", () => {
    expect(computeSingleIssuanceTtlCap({ requestedTTL: 0, accessTokenPeriod: 900 })).toBe(900);
  });
});

describe("computePerTokenMarkerExpiry", () => {
  test("tightens a short-TTL / large-maxTTL token to exp + one issuance TTL + skew", () => {
    const twoHours = 7200;
    const thirtyDays = 2_592_000;
    const exp = NOW + twoHours;
    const result = computePerTokenMarkerExpiry({
      exp,
      requestedTTL: twoHours,
      accessTokenMaxTTL: thirtyDays,
      accessTokenPeriod: 0,
      creationEpoch: NOW,
      nowSeconds: NOW
    });
    // min(exp + 2h, creationEpoch + 30d) = exp + 2h; plus skew.
    expect(result).toEqual(new Date((exp + twoHours + IDENTITY_REVOCATION_MARKER_SKEW_SECONDS) * 1000));
  });

  test("clamps to the legacy creationEpoch+maxTTL upper bound plus skew", () => {
    const oneHour = 3600;
    const exp = NOW + oneHour;
    const result = computePerTokenMarkerExpiry({
      exp,
      // A huge requested TTL would push exp+cap past the maxTTL budget; the clamp wins.
      requestedTTL: MAX_AGE,
      accessTokenMaxTTL: oneHour + 60,
      accessTokenPeriod: 0,
      creationEpoch: NOW,
      nowSeconds: NOW
    });
    expect(result).toEqual(new Date((NOW + oneHour + 60 + IDENTITY_REVOCATION_MARKER_SKEW_SECONDS) * 1000));
  });

  test("keeps the ~90d marker for maxTTL=0/TTL=0 tokens (irreducible)", () => {
    const exp = NOW + MAX_AGE;
    const result = computePerTokenMarkerExpiry({
      exp,
      requestedTTL: 0,
      accessTokenMaxTTL: 0,
      accessTokenPeriod: 0,
      creationEpoch: NOW,
      nowSeconds: NOW
    });
    // min(exp + ceiling, now + ceiling) = now + ceiling; plus skew.
    expect(result).toEqual(new Date((NOW + MAX_AGE + IDENTITY_REVOCATION_MARKER_SKEW_SECONDS) * 1000));
  });

  test("falls back to the legacy bound (no skew) when exp is absent", () => {
    const result = computePerTokenMarkerExpiry({
      exp: undefined,
      requestedTTL: 3600,
      accessTokenMaxTTL: 7200,
      accessTokenPeriod: 0,
      creationEpoch: NOW,
      nowSeconds: NOW
    });
    expect(result).toEqual(new Date((NOW + 7200) * 1000));
  });
});

describe("computeTokenAuthRevokeMarkerExpiry", () => {
  test("anchors on now + single-issuance cap when maxTTL=0", () => {
    const result = computeTokenAuthRevokeMarkerExpiry({
      accessTokenTTL: 3600,
      accessTokenMaxTTL: 0,
      accessTokenPeriod: 0,
      createdAtMs: (NOW - 100) * 1000,
      nowSeconds: NOW
    });
    expect(result).toEqual(new Date((NOW + 3600 + IDENTITY_REVOCATION_MARKER_SKEW_SECONDS) * 1000));
  });

  test("clamps to createdAt+maxTTL when that is sooner than now + cap", () => {
    const createdAt = NOW - 1000;
    const result = computeTokenAuthRevokeMarkerExpiry({
      accessTokenTTL: MAX_AGE,
      accessTokenMaxTTL: 2000,
      accessTokenPeriod: 0,
      createdAtMs: createdAt * 1000,
      nowSeconds: NOW
    });
    // min(createdAt + 2000, now + MAX_AGE) = createdAt + 2000; plus skew.
    expect(result).toEqual(new Date((createdAt + 2000 + IDENTITY_REVOCATION_MARKER_SKEW_SECONDS) * 1000));
  });
});

describe("computeRevocationVerdictFingerprint", () => {
  test("is stable for the same tuple and differs when iat changes", () => {
    const base = { tokenId: "t1", issuedAtMs: 1000, clientSecretId: "cs", authMethod: "universal-auth" };
    expect(computeRevocationVerdictFingerprint(base)).toBe(computeRevocationVerdictFingerprint({ ...base }));
    // A renewed JWT reuses the jti (tokenId) but carries a fresh iat.
    expect(computeRevocationVerdictFingerprint(base)).not.toBe(
      computeRevocationVerdictFingerprint({ ...base, issuedAtMs: 2000 })
    );
  });

  test("differs across token id, client secret, and auth method", () => {
    const base = { tokenId: "t1", issuedAtMs: 1000, clientSecretId: "cs", authMethod: "universal-auth" };
    expect(computeRevocationVerdictFingerprint(base)).not.toBe(
      computeRevocationVerdictFingerprint({ ...base, tokenId: "t2" })
    );
    expect(computeRevocationVerdictFingerprint(base)).not.toBe(
      computeRevocationVerdictFingerprint({ ...base, clientSecretId: "cs2" })
    );
    expect(computeRevocationVerdictFingerprint(base)).not.toBe(
      computeRevocationVerdictFingerprint({ ...base, authMethod: "oidc-auth" })
    );
  });
});

describe("evaluateRevocationMarkers", () => {
  const base = {
    tokenId: "token-id",
    identityId: "identity-id",
    issuedAtMs: NOW * 1000,
    clientSecretId: "cs-id",
    authMethod: "universal-auth"
  };

  test("returns null when no marker matches", () => {
    expect(evaluateRevocationMarkers({ ...base, markers: [] })).toBeNull();
  });

  test("denies a per-token marker matching the token id", () => {
    expect(
      evaluateRevocationMarkers({
        ...base,
        markers: [{ id: "token-id", identityId: "identity-id", createdAt: new Date(NOW * 1000), scope: null }]
      })
    ).toBe("token");
  });

  test("denies an identity-wide marker only for tokens issued before revokedAt", () => {
    const revokedAfter = { id: "identity-id", identityId: "identity-id", createdAt: new Date((NOW + 10) * 1000) };
    const revokedBefore = { id: "identity-id", identityId: "identity-id", createdAt: new Date((NOW - 10) * 1000) };
    expect(evaluateRevocationMarkers({ ...base, markers: [{ ...revokedAfter, scope: null }] })).toBe("identity");
    expect(evaluateRevocationMarkers({ ...base, markers: [{ ...revokedBefore, scope: null }] })).toBeNull();
  });

  test("denies scoped markers by client secret and auth method", () => {
    const revokedAt = new Date((NOW + 10) * 1000);
    expect(
      evaluateRevocationMarkers({
        ...base,
        markers: [{ id: "uuid", identityId: "identity-id", createdAt: revokedAt, revokedAt, scope: "cs-id" }]
      })
    ).toBe("client-secret");
    expect(
      evaluateRevocationMarkers({
        ...base,
        markers: [{ id: "uuid", identityId: "identity-id", createdAt: revokedAt, revokedAt, scope: "universal-auth" }]
      })
    ).toBe("auth-method");
  });
});
