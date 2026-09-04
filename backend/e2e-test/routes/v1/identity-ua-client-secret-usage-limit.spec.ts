/**
 * E2E tests for the Universal Auth client-secret usage limit under concurrency.
 *
 * Prerequisites (handled by vitest-environment-knex.ts):
 *   - testServer: running Fastify instance
 *   - jwtAuthToken: pre-authenticated admin JWT (user session)
 *   - testDb: knex instance
 *
 * numUsesLimit has to hold when logins arrive together, not just in sequence, so
 * these cover the concurrent case a sequential test cannot reach.
 *
 * Rate limiting is only registered for production cloud (server/app.ts), so a
 * burst of logins here is not throttled.
 *
 * Each test creates and tears down its own identity so nothing depends on or
 * mutates the seeded machine identity.
 */

import { OrgMembershipRole, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

const CONCURRENCY = 20;
const USAGE_LIMIT_REACHED_MESSAGE = "Access denied due to client secret usage limit reached";

/** Create a temporary identity with Universal Auth and one client secret capped at numUsesLimit. */
const createUaIdentity = async (name: string, numUsesLimit: number) => {
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

  const attachRes = await testServer.inject({
    method: "POST",
    url: `/api/v1/auth/universal-auth/identities/${identity.id}`,
    headers: { authorization: `Bearer ${jwtAuthToken}` },
    body: {
      accessTokenTTL: 2592000,
      accessTokenMaxTTL: 2592000,
      accessTokenNumUsesLimit: 0,
      // a burst of rejections must not be able to trip the lockout and change what these assert
      lockoutEnabled: false
    }
  });
  expect(attachRes.statusCode).toBe(200);

  const csRes = await testServer.inject({
    method: "POST",
    url: `/api/v1/auth/universal-auth/identities/${identity.id}/client-secrets`,
    headers: { authorization: `Bearer ${jwtAuthToken}` },
    body: { numUsesLimit }
  });
  expect(csRes.statusCode).toBe(200);

  return {
    identityId: identity.id,
    clientId: attachRes.json().identityUniversalAuth.clientId as string,
    clientSecret: csRes.json().clientSecret as string,
    clientSecretId: csRes.json().clientSecretData.id as string
  };
};

const deleteIdentity = async (identityId: string) => {
  await testServer.inject({
    method: "DELETE",
    url: `/api/v1/identities/${identityId}`,
    headers: { authorization: `Bearer ${jwtAuthToken}` }
  });
};

const loginConcurrently = (clientId: string, clientSecret: string) =>
  Promise.all(
    Array.from({ length: CONCURRENCY }, () =>
      testServer.inject({
        method: "POST",
        url: "/api/v1/auth/universal-auth/login",
        body: { clientId, clientSecret }
      })
    )
  );

const readClientSecretRow = async (clientSecretId: string) => {
  const row = await testDb(TableName.IdentityUaClientSecret).where({ id: clientSecretId }).first<{
    clientSecretNumUses: string | number;
    isClientSecretRevoked: boolean;
  }>("clientSecretNumUses", "isClientSecretRevoked");

  // pg hands back int8 as a string, which is why the row schema coerces it
  return row && { ...row, clientSecretNumUses: Number(row.clientSecretNumUses) };
};

describe("Universal Auth client secret usage limit", async () => {
  test.each([
    { label: "single-use", numUsesLimit: 1 },
    { label: "multi-use", numUsesLimit: 5 }
  ])(
    "a $label client secret mints at most $numUsesLimit tokens under concurrent logins",
    async ({ label, numUsesLimit }) => {
      const { identityId, clientId, clientSecret, clientSecretId } = await createUaIdentity(
        `test-ua-usage-limit-${label}`,
        numUsesLimit
      );

      try {
        const responses = await loginConcurrently(clientId, clientSecret);

        const succeeded = responses.filter((res) => res.statusCode === 200);
        const rejected = responses.filter((res) => res.statusCode !== 200);

        expect(succeeded).toHaveLength(numUsesLimit);
        expect(rejected).toHaveLength(CONCURRENCY - numUsesLimit);

        // not an incidental failure, which would make the count above pass for the wrong reason
        rejected.forEach((res) => {
          expect(res.statusCode).toBe(401);
          expect(res.json().message).toBe(USAGE_LIMIT_REACHED_MESSAGE);
        });

        const tokens = succeeded.map((res) => res.json().accessToken as string);
        expect(new Set(tokens).size).toBe(numUsesLimit);

        // exactly the limit: no increments lost by the winners, none burned by the losers
        const row = await readClientSecretRow(clientSecretId);
        expect(row?.clientSecretNumUses).toBe(numUsesLimit);

        // a spent secret is revoked by the next attempt rather than mid-burst. Revoking during the
        // burst would hide it from the secret lookup and send the rest of the burst down the
        // invalid-credential path, which feeds the lockout counter for the whole clientId
        expect(row?.isClientSecretRevoked).toBe(false);

        const afterBurst = await testServer.inject({
          method: "POST",
          url: "/api/v1/auth/universal-auth/login",
          body: { clientId, clientSecret }
        });
        expect(afterBurst.statusCode).toBe(401);
        expect((await readClientSecretRow(clientSecretId))?.isClientSecretRevoked).toBe(true);
      } finally {
        await deleteIdentity(identityId);
      }
    }
  );

  test(`an unlimited client secret still serves all ${CONCURRENCY} concurrent logins`, async () => {
    const { identityId, clientId, clientSecret, clientSecretId } = await createUaIdentity(
      "test-ua-usage-limit-unlimited",
      0
    );

    try {
      const responses = await loginConcurrently(clientId, clientSecret);

      expect(responses.filter((res) => res.statusCode === 200)).toHaveLength(CONCURRENCY);

      // numUses is informational here and its write is debounced, so only usability is assertable
      const row = await readClientSecretRow(clientSecretId);
      expect(row?.isClientSecretRevoked).toBe(false);
    } finally {
      await deleteIdentity(identityId);
    }
  });

  test("a single-use client secret is rejected on a sequential second login", async () => {
    const { identityId, clientId, clientSecret } = await createUaIdentity("test-ua-usage-limit-sequential", 1);

    try {
      const first = await testServer.inject({
        method: "POST",
        url: "/api/v1/auth/universal-auth/login",
        body: { clientId, clientSecret }
      });
      expect(first.statusCode).toBe(200);

      const second = await testServer.inject({
        method: "POST",
        url: "/api/v1/auth/universal-auth/login",
        body: { clientId, clientSecret }
      });
      expect(second.statusCode).toBe(401);
      expect(second.json().message).toBe(USAGE_LIMIT_REACHED_MESSAGE);
    } finally {
      await deleteIdentity(identityId);
    }
  });
});
