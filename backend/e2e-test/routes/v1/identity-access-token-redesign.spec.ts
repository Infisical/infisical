/**
 * E2E tests for the redesigned identity-access-token auth flow.
 *
 * Prerequisites (handled by vitest-environment-knex.ts):
 *   - testServer: running Fastify instance
 *   - jwtAuthToken: pre-authenticated admin JWT (user session)
 *   - testDb: knex instance
 *
 * These tests create and tear down temporary identities so they do not
 * depend on or mutate the seeded machine identity.
 */

import { randomUUID } from "node:crypto";

import jwt from "jsonwebtoken";

import { AccessScope, IdentityAuthMethod, OrgMembershipRole, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { AuthTokenType } from "@app/services/auth/auth-type";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Create a temporary identity and attach Universal Auth to it. */
const createUaIdentity = async (
  name: string,
  uaConfig: {
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<{ ipAddress: string }>;
  } = {}
) => {
  // 1. Create bare identity
  const createRes = await testServer.inject({
    method: "POST",
    url: "/api/v1/identities",
    headers: { authorization: `Bearer ${jwtAuthToken}` },
    body: {
      name,
      role: OrgMembershipRole.Member,
      organizationId: seedData1.organization.id
    }
  });
  expect(createRes.statusCode).toBe(200);
  const identity = createRes.json().identity as { id: string };

  const ttl = uaConfig.accessTokenTTL ?? 2592000;
  const maxTtl = uaConfig.accessTokenMaxTTL ?? ttl;

  // 2. Attach Universal Auth
  const attachRes = await testServer.inject({
    method: "POST",
    url: `/api/v1/auth/universal-auth/identities/${identity.id}`,
    headers: { authorization: `Bearer ${jwtAuthToken}` },
    body: {
      accessTokenTTL: ttl,
      accessTokenMaxTTL: maxTtl,
      accessTokenNumUsesLimit: uaConfig.accessTokenNumUsesLimit ?? 0,
      accessTokenTrustedIps: uaConfig.accessTokenTrustedIps
    }
  });
  expect(attachRes.statusCode).toBe(200);

  // 3. Create a client secret
  const csRes = await testServer.inject({
    method: "POST",
    url: `/api/v1/auth/universal-auth/identities/${identity.id}/client-secrets`,
    headers: { authorization: `Bearer ${jwtAuthToken}` },
    body: {}
  });
  expect(csRes.statusCode).toBe(200);
  const { clientSecret } = csRes.json();
  const clientId = attachRes.json().identityUniversalAuth.clientId as string;

  return { identityId: identity.id, clientId, clientSecret };
};

/** Log in as a Universal Auth identity and return the access token. */
const loginWithUa = async (clientId: string, clientSecret: string) => {
  const loginRes = await testServer.inject({
    method: "POST",
    url: "/api/v1/auth/universal-auth/login",
    body: { clientId, clientSecret }
  });
  expect(loginRes.statusCode).toBe(200);
  return loginRes.json().accessToken as string;
};

/** Delete a temporary identity (cleanup). */
const deleteIdentity = async (identityId: string) => {
  await testServer.inject({
    method: "DELETE",
    url: `/api/v1/identities/${identityId}`,
    headers: { authorization: `Bearer ${jwtAuthToken}` }
  });
};

const cleanupIdentityDirect = async (identityId: string) => {
  await testDb(TableName.Identity).where({ id: identityId }).delete();
};

const updateUaAccessTokenTrustedIps = async (identityId: string, ips: Array<{ ipAddress: string }>) => {
  const res = await testServer.inject({
    method: "PATCH",
    url: `/api/v1/auth/universal-auth/identities/${identityId}`,
    headers: { authorization: `Bearer ${jwtAuthToken}` },
    body: {
      accessTokenTrustedIps: ips
    }
  });
  expect(res.statusCode).toBe(200);
};

const deleteOrgIdentityMembership = async (identityId: string) => {
  const membership = await testDb(TableName.Membership)
    .where({
      scope: AccessScope.Organization,
      scopeOrgId: seedData1.organization.id,
      actorIdentityId: identityId
    })
    .first<{ id: string }>();

  expect(membership).toBeDefined();

  await testDb(TableName.MembershipRole).where({ membershipId: membership.id }).delete();
  await testDb(TableName.Membership).where({ id: membership.id }).delete();
};

const waitForRevocationRow = async (tokenId: string) => {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    const row = await testDb(TableName.IdentityAccessTokenRevocation)
      .where({ id: tokenId })
      .first<{ id: string; identityId: string; expiresAt: Date }>();

    if (row) {
      return row;
    }

    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  throw new Error(`Timed out waiting for identity access token revocation row ${tokenId}`);
};

/**
 * Hit a lightweight authenticated endpoint that accepts IDENTITY_ACCESS_TOKEN.
 * GET /api/v1/identities/details only accepts identity tokens — ideal for
 * validating whether a given token is currently authorised.
 */
const callDetailsEndpoint = (accessToken: string, ip?: string) =>
  testServer.inject({
    method: "GET",
    url: "/api/v1/identities/details",
    headers: { authorization: `Bearer ${accessToken}`, ...(ip ? { "x-forwarded-for": ip } : {}) }
  });

const getMaxIdentityAccessTokenTTL = async () => {
  const statusRes = await testServer.inject({
    method: "GET",
    url: "/api/status"
  });

  expect(statusRes.statusCode).toBe(200);

  const { maxIdentityAccessTokenTTL } = statusRes.json();
  expect(typeof maxIdentityAccessTokenTTL).toBe("number");

  return maxIdentityAccessTokenTTL;
};

const createLegacyAccessTokenWithoutOrgClaims = async (identityId: string) => {
  const tokenId = randomUUID();

  await testDb(TableName.IdentityAccessToken).insert({
    id: tokenId,
    identityId,
    accessTokenTTL: 3600,
    accessTokenMaxTTL: 7200,
    accessTokenNumUses: 0,
    accessTokenNumUsesLimit: 0,
    isAccessTokenRevoked: false,
    authMethod: IdentityAuthMethod.UNIVERSAL_AUTH,
    accessTokenPeriod: 0
  } as never);

  return jwt.sign(
    {
      authTokenType: AuthTokenType.IDENTITY_ACCESS_TOKEN,
      identityId,
      identityAccessTokenId: tokenId,
      clientSecretId: ""
    },
    process.env.AUTH_SECRET ?? "something-random",
    { expiresIn: 3600 }
  );
};

// ---------------------------------------------------------------------------
// test suite
// ---------------------------------------------------------------------------

describe("Identity Access Token — redesigned JWT flow", () => {
  // -------------------------------------------------------------------------
  // 1. Issuance caps TTL to MAX_MACHINE_IDENTITY_TOKEN_AGE when accessTokenTTL=0
  // -------------------------------------------------------------------------
  test("issuance with accessTokenTTL=0 caps exp to MAX_MACHINE_IDENTITY_TOKEN_AGE", async () => {
    const maxIdentityAccessTokenTTL = await getMaxIdentityAccessTokenTTL();
    const { identityId, clientId, clientSecret } = await createUaIdentity("test-ttl-cap", {
      accessTokenTTL: 0,
      accessTokenMaxTTL: 0
    });

    try {
      const accessToken = await loginWithUa(clientId, clientSecret);

      const decoded = jwt.decode(accessToken) as { iat: number; exp: number } | null;
      expect(decoded).not.toBeNull();
      expect(typeof decoded!.iat).toBe("number");
      expect(typeof decoded!.exp).toBe("number");

      const issuedTtl = decoded!.exp - decoded!.iat;
      // The issued TTL should be at most MAX_MACHINE_IDENTITY_TOKEN_AGE.
      // Allow 2 s of drift for test execution latency.
      expect(issuedTtl).toBeLessThanOrEqual(maxIdentityAccessTokenTTL);
      expect(issuedTtl).toBeGreaterThanOrEqual(maxIdentityAccessTokenTTL - 2);
    } finally {
      await deleteIdentity(identityId);
    }
  });

  // -------------------------------------------------------------------------
  // 2. Legacy JWT (missing jti / orgId) is rejected with 401
  // -------------------------------------------------------------------------
  test("legacy JWT missing jti and orgId is rejected with 401", async () => {
    // Hand-craft a JWT that looks like the old design: correct authTokenType
    // but none of the new required claims (jti is absent, orgId absent).
    const legacyPayload = {
      authTokenType: AuthTokenType.IDENTITY_ACCESS_TOKEN,
      identityId: "00000000-0000-0000-0000-000000000001",
      identityAccessTokenId: "00000000-0000-0000-0000-000000000002",
      clientSecretId: "00000000-0000-0000-0000-000000000003",
      identityAuth: {}
      // Deliberately omitting: jti, orgId, rootOrgId, parentOrgId, iat (numeric)
    };

    const legacyToken = jwt.sign(legacyPayload, process.env.AUTH_SECRET ?? "something-random", { expiresIn: 3600 });

    const res = await callDetailsEndpoint(legacyToken);
    expect(res.statusCode).toBe(401);
  });

  test("legacy JWT missing org claims authenticates and renews from its token row", async () => {
    const { identityId } = await createUaIdentity("test-legacy-token-no-org-claims");

    try {
      const legacyToken = await createLegacyAccessTokenWithoutOrgClaims(identityId);
      const legacyDecoded = jwt.decode(legacyToken) as { jti?: string; orgId?: string } | null;
      expect(legacyDecoded).not.toBeNull();
      expect(legacyDecoded!.jti).toBeUndefined();
      expect(legacyDecoded!.orgId).toBeUndefined();

      const authRes = await callDetailsEndpoint(legacyToken);
      expect(authRes.statusCode).toBe(200);

      const renewRes = await testServer.inject({
        method: "POST",
        url: "/api/v1/auth/token/renew",
        body: { accessToken: legacyToken }
      });
      expect(renewRes.statusCode).toBe(200);

      const renewedAccessToken = renewRes.json().accessToken as string;
      const renewedDecoded = jwt.decode(renewedAccessToken) as {
        orgId?: string;
        rootOrgId?: string;
        parentOrgId?: string;
      } | null;
      expect(renewedDecoded).not.toBeNull();
      expect(renewedDecoded!.orgId).toBe(seedData1.organization.id);
      expect(renewedDecoded!.rootOrgId).toBe(seedData1.organization.id);
      expect(renewedDecoded!.parentOrgId).toBe(seedData1.organization.id);
      expect((await callDetailsEndpoint(renewedAccessToken)).statusCode).toBe(200);
    } finally {
      await cleanupIdentityDirect(identityId);
    }
  });

  // -------------------------------------------------------------------------
  // 3. Per-token revoke: revoking a token blocks subsequent requests
  // -------------------------------------------------------------------------
  test("revoking a token with POST /api/v1/auth/token/revoke causes subsequent 401", async () => {
    const { identityId, clientId, clientSecret } = await createUaIdentity("test-per-token-revoke");

    try {
      const accessToken = await loginWithUa(clientId, clientSecret);

      // Token is valid before revocation.
      const preRevokeRes = await callDetailsEndpoint(accessToken);
      expect(preRevokeRes.statusCode).toBe(200);

      // Revoke.
      const revokeRes = await testServer.inject({
        method: "POST",
        url: "/api/v1/auth/token/revoke",
        body: { accessToken }
      });
      expect(revokeRes.statusCode).toBe(200);

      // Token must now be rejected.
      const postRevokeRes = await callDetailsEndpoint(accessToken);
      expect(postRevokeRes.statusCode).toBe(401);
    } finally {
      await deleteIdentity(identityId);
    }
  });

  // -------------------------------------------------------------------------
  // 4. Identity-wide revoke: deleting identity invalidates all its tokens
  // -------------------------------------------------------------------------
  test("deleting an identity revokes all its active tokens", async () => {
    const { identityId, clientId, clientSecret } = await createUaIdentity("test-identity-delete-revoke");

    // Issue two independent tokens for the same identity.
    const tokenA = await loginWithUa(clientId, clientSecret);
    const tokenB = await loginWithUa(clientId, clientSecret);

    // Both should be valid before deletion.
    expect((await callDetailsEndpoint(tokenA)).statusCode).toBe(200);
    expect((await callDetailsEndpoint(tokenB)).statusCode).toBe(200);

    // Delete the identity (this also calls revokeAllTokensForIdentity internally).
    const deleteRes = await testServer.inject({
      method: "DELETE",
      url: `/api/v1/identities/${identityId}`,
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });
    expect(deleteRes.statusCode).toBe(200);

    // Both previously valid tokens must now be rejected.
    expect((await callDetailsEndpoint(tokenA)).statusCode).toBe(401);
    expect((await callDetailsEndpoint(tokenB)).statusCode).toBe(401);
  });

  // -------------------------------------------------------------------------
  // 5. Usage-limit: accessTokenNumUsesLimit=2 allows 2 calls, blocks the 3rd
  // -------------------------------------------------------------------------
  test("usage-limited token (numUsesLimit=2) is rejected after two successful uses", async () => {
    const { identityId, clientId, clientSecret } = await createUaIdentity("test-usage-limit", {
      accessTokenNumUsesLimit: 2
    });

    try {
      const accessToken = await loginWithUa(clientId, clientSecret);

      // First use — should succeed.
      const res1 = await callDetailsEndpoint(accessToken);
      expect(res1.statusCode).toBe(200);

      // Second use — should succeed.
      const res2 = await callDetailsEndpoint(accessToken);
      expect(res2.statusCode).toBe(200);

      // Third use — limit exhausted, must be rejected.
      const res3 = await callDetailsEndpoint(accessToken);
      expect(res3.statusCode).toBe(401);
    } finally {
      await deleteIdentity(identityId);
    }
  });

  // -------------------------------------------------------------------------
  // 6. Trusted-IP config changes invalidate already issued tokens
  // -------------------------------------------------------------------------
  test("trusted IP changes reject old tokens from disallowed IPs", async () => {
    const { identityId, clientId, clientSecret } = await createUaIdentity("test-stale-trusted-ip", {
      accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }]
    });

    try {
      const accessToken = await loginWithUa(clientId, clientSecret);

      expect((await callDetailsEndpoint(accessToken)).statusCode).toBe(200);

      await updateUaAccessTokenTrustedIps(identityId, [{ ipAddress: "10.0.0.0/24" }]);

      expect((await callDetailsEndpoint(accessToken, "192.168.1.1")).statusCode).toBe(403);
    } finally {
      await deleteIdentity(identityId);
    }
  });

  // -------------------------------------------------------------------------
  // 7. Org membership changes invalidate already issued tokens
  // -------------------------------------------------------------------------
  test("org membership removal invalidates old tokens", async () => {
    const { identityId, clientId, clientSecret } = await createUaIdentity("test-stale-org-membership");

    try {
      const accessToken = await loginWithUa(clientId, clientSecret);

      expect((await callDetailsEndpoint(accessToken)).statusCode).toBe(200);

      await deleteOrgIdentityMembership(identityId);

      expect((await callDetailsEndpoint(accessToken)).statusCode).toBe(401);
    } finally {
      await cleanupIdentityDirect(identityId);
    }
  });

  // -------------------------------------------------------------------------
  // 8. Per-token revocation survives Redis loss via PG lookup
  // -------------------------------------------------------------------------
  test("zero-TTL revocation survives Redis loss via PG lookup", async () => {
    const { identityId, clientId, clientSecret } = await createUaIdentity("test-revoke-pg-lookup", {
      accessTokenTTL: 0,
      accessTokenMaxTTL: 0
    });

    try {
      const accessToken = await loginWithUa(clientId, clientSecret);
      const decoded = jwt.decode(accessToken) as { exp: number; identityAccessTokenId: string } | null;
      expect(decoded).not.toBeNull();
      expect(typeof decoded!.exp).toBe("number");
      expect(typeof decoded!.identityAccessTokenId).toBe("string");

      const revokeRes = await testServer.inject({
        method: "POST",
        url: "/api/v1/auth/token/revoke",
        body: { accessToken }
      });
      expect(revokeRes.statusCode).toBe(200);

      const revocation = await waitForRevocationRow(decoded!.identityAccessTokenId);
      const expectedExpiresAtMs = decoded!.exp * 1000;
      expect(revocation.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(Math.abs(revocation.expiresAt.getTime() - expectedExpiresAtMs)).toBeLessThanOrEqual(2_000);

      await testRedis.flushdb("SYNC");

      expect((await callDetailsEndpoint(accessToken)).statusCode).toBe(401);
    } finally {
      await cleanupIdentityDirect(identityId);
    }
  });
});
