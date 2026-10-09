import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";
import { createSecretV2, getSecretsV2 } from "../../testUtils/secrets";

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
      await Promise.all(
        Array.from({ length: CONCURRENT_CREATES }, (_, i) =>
          createSecretV2({
            workspaceId: projectId,
            environmentSlug: "dev",
            secretPath: "/",
            key: `CONCURRENT_SECRET_${i}`,
            value: `value-${i}`,
            authToken
          })
        )
      );

      const { secrets } = await getSecretsV2({
        workspaceId: projectId,
        environmentSlug: "dev",
        secretPath: "/",
        authToken
      });
      expect(secrets).toHaveLength(CONCURRENT_CREATES);
    } finally {
      await cleanup();
    }
  }, 120_000);
});
