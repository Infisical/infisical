import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";
import { createFolder } from "../../testUtils/folders";
import { createSecretV2, getSecretsV2, updateSecretV2 } from "../../testUtils/secrets";

// More concurrent updates than the connection pool holds (DB_POOL_MAX, 10 by default). Each update
// runs createCommit inside its transaction, so any query in that path that skips tx needs a second
// connection while the first is held, and a burst this size exhausts the pool. Uses a subfolder so
// the root-folder tree checkpoint lookup isn't involved.
const CONCURRENT_UPDATES = 30;

describe("Concurrent secret update", () => {
  test("updates every secret in a folder when requests arrive at once", async () => {
    const { projectId, authToken, cleanup } = await createIsolatedOrgAndProject("concurrent-secret-update");
    try {
      await createFolder({ workspaceId: projectId, environmentSlug: "dev", secretPath: "/", name: "app", authToken });

      for (let i = 0; i < CONCURRENT_UPDATES; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await createSecretV2({
          workspaceId: projectId,
          environmentSlug: "dev",
          secretPath: "/app",
          key: `CONCURRENT_SECRET_${i}`,
          value: `old-value-${i}`,
          authToken
        });
      }

      await Promise.all(
        Array.from({ length: CONCURRENT_UPDATES }, (_, i) =>
          updateSecretV2({
            workspaceId: projectId,
            environmentSlug: "dev",
            secretPath: "/app",
            key: `CONCURRENT_SECRET_${i}`,
            value: `new-value-${i}`,
            authToken
          })
        )
      );

      const { secrets } = await getSecretsV2({
        workspaceId: projectId,
        environmentSlug: "dev",
        secretPath: "/app",
        authToken
      });
      const values = Object.fromEntries(secrets.map((s) => [s.secretKey, s.secretValue]));
      for (let i = 0; i < CONCURRENT_UPDATES; i += 1) {
        expect(values[`CONCURRENT_SECRET_${i}`]).toBe(`new-value-${i}`);
      }
    } finally {
      await cleanup();
    }
  }, 120_000);
});
