import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";

// Each create runs inside a transaction that holds one pool connection. Any query in that path
// that skips the transaction needs a second connection, and once concurrent creates outnumber the
// pool (DB_POOL_MAX, 10 by default) every request is waiting for a connection none of them will
// release, until knex times out and the requests fail with 500s. A burst well above the pool size
// is what surfaces that; sequential creates never do.
const CONCURRENT_CREATES = 30;

describe("Concurrent secret creation", () => {
  test("creates every secret in a root folder when requests arrive at once", async () => {
    const { projectId, authToken, cleanup } = await createIsolatedOrgAndProject("concurrent-secret-create");

    try {
      const results = await Promise.all(
        Array.from({ length: CONCURRENT_CREATES }, (_, i) =>
          testServer.inject({
            method: "POST",
            url: `/api/v4/secrets/CONCURRENT_SECRET_${i}`,
            headers: { authorization: `Bearer ${authToken}` },
            body: { projectId, environment: "dev", secretPath: "/", secretValue: `value-${i}` }
          })
        )
      );

      const failed = results
        .map((res, i) => ({ i, statusCode: res.statusCode }))
        .filter(({ statusCode }) => statusCode !== 200);
      expect(failed).toEqual([]);

      const listRes = await testServer.inject({
        method: "GET",
        url: "/api/v4/secrets",
        headers: { authorization: `Bearer ${authToken}` },
        query: { projectId, environment: "dev", secretPath: "/" }
      });
      expect(listRes.statusCode).toBe(200);
      expect(listRes.json().secrets).toHaveLength(CONCURRENT_CREATES);
    } finally {
      await cleanup();
    }
  }, 120_000);
});
