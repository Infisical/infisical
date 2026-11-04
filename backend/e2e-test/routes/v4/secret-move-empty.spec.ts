import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";
import {
  createSecretV2,
  createSecretsBatchV4,
  getSecretByNameV2,
  getSecretsV2,
  moveSecretsV4
} from "../../testUtils/secrets";

describe("Moving empty secrets", () => {
  let projectId: string;
  let authToken: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectId, authToken, cleanup } = await createIsolatedOrgAndProject("move-empty"));
  });

  afterEach(async () => {
    await cleanup();
  });

  test.each(["", "replacement-value"])(
    "overwrites a populated destination with batch source value %j",
    async (value) => {
      const [source] = await createSecretsBatchV4({
        projectId,
        environment: "dev",
        secretPath: "/",
        secrets: [{ secretKey: "MOVE_TEST", secretValue: value }],
        authToken
      });
      const destination = await createSecretV2({
        workspaceId: projectId,
        environmentSlug: "prod",
        secretPath: "/",
        key: "MOVE_TEST",
        value: "old-destination-value",
        authToken
      });

      const result = await moveSecretsV4({
        projectId,
        sourceEnvironment: "dev",
        sourceSecretPath: "/",
        destinationEnvironment: "prod",
        destinationSecretPath: "/",
        secretIds: [source.id],
        shouldOverwrite: true,
        authToken
      });
      expect(result).toEqual({ isSourceUpdated: true, isDestinationUpdated: true });
      const restored = await getSecretByNameV2({
        workspaceId: projectId,
        environmentSlug: "prod",
        secretPath: "/",
        key: "MOVE_TEST",
        authToken
      });
      expect(restored.id).toBe(destination.id);
      expect(restored.secretValue).toBe(value);
      expect(restored.version).toBeGreaterThan(destination.version);
      const remaining = await getSecretsV2({
        workspaceId: projectId,
        environmentSlug: "dev",
        secretPath: "/",
        authToken
      });
      expect(remaining.secrets).toEqual([]);
    }
  );
});
