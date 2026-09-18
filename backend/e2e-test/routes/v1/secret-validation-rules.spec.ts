import { createIsolatedOrgAndProject } from "e2e-test/testUtils/fixtures";
import { createFolder } from "e2e-test/testUtils/folders";
import { createStaticSecretsValidationRule } from "e2e-test/testUtils/secret-validation-rules";
import { createSecretV2, updateSecretV2 } from "e2e-test/testUtils/secrets";

const PROD_ENV = "prod";
const STAGING_ENV = "staging";

describe("Secret validation rules", () => {
  // A rule preventing reuse of a value another secret already holds is scoped like every other
  // validation rule: only writes inside the rule's environment and path are held against it.
  describe("Preventing reuse of a value another secret holds", () => {
    let projectId: string;
    let authToken: string;
    let cleanup: () => Promise<void>;

    beforeAll(async () => {
      ({ projectId, authToken, cleanup } = await createIsolatedOrgAndProject("secret-validation-rules-e2e"));

      await createStaticSecretsValidationRule({
        projectId,
        name: "no-duplicate-values-in-prod",
        environment: PROD_ENV,
        secretPath: "/",
        valueConstraints: { uniqueWithinScope: true },
        authToken
      });
    });

    afterAll(async () => {
      await cleanup();
    });

    test("accepts distinct values in the rule's environment, and a repeated value outside it", async () => {
      await createSecretV2({
        workspaceId: projectId,
        environmentSlug: PROD_ENV,
        secretPath: "/",
        key: "UNIQUE_A",
        value: "unique-value-a",
        authToken
      });
      await createSecretV2({
        workspaceId: projectId,
        environmentSlug: PROD_ENV,
        secretPath: "/",
        key: "UNIQUE_B",
        value: "unique-value-b",
        authToken
      });

      await createSecretV2({
        workspaceId: projectId,
        environmentSlug: PROD_ENV,
        secretPath: "/",
        key: "SHARED_ACROSS_ENVS",
        value: "shared-across-envs",
        authToken
      });
      // The rule only covers production, so staging can hold a value production already holds.
      const staged = await createSecretV2({
        workspaceId: projectId,
        environmentSlug: STAGING_ENV,
        secretPath: "/",
        key: "SHARED_ACROSS_ENVS_COPY",
        value: "shared-across-envs",
        authToken
      });
      expect(staged.secretValue).toBe("shared-across-envs");
    });

    test("accepts a repeated value at a path the rule does not reach", async () => {
      await createFolder({
        workspaceId: projectId,
        environmentSlug: PROD_ENV,
        secretPath: "/",
        name: "folder",
        authToken
      });

      await createSecretV2({
        workspaceId: projectId,
        environmentSlug: PROD_ENV,
        secretPath: "/",
        key: "SHARED_ACROSS_PATHS",
        value: "shared-across-paths",
        authToken
      });
      // The rule covers "/" alone, not the folders under it, so "/folder" is outside its scope.
      const nested = await createSecretV2({
        workspaceId: projectId,
        environmentSlug: PROD_ENV,
        secretPath: "/folder",
        key: "SHARED_ACROSS_PATHS_COPY",
        value: "shared-across-paths",
        authToken
      });
      expect(nested.secretValue).toBe("shared-across-paths");
    });

    test("rejects a second secret holding a value production already holds", async () => {
      await createSecretV2({
        workspaceId: projectId,
        environmentSlug: PROD_ENV,
        secretPath: "/",
        key: "ORIGINAL",
        value: "duplicated-value",
        authToken
      });

      // The writer is a project admin here, so the message names where the value is already held.
      await createSecretV2({
        workspaceId: projectId,
        environmentSlug: PROD_ENV,
        secretPath: "/",
        key: "DUPLICATE",
        value: "duplicated-value",
        authToken
      }).expect((res) => {
        expect(res.statusCode).toBe(400);
        expect(res.json().message).toContain('Secret "DUPLICATE"');
        expect(res.json().message).toContain('value is already used by secret "ORIGINAL"');
        expect(res.json().message).toContain(`environment "${PROD_ENV}"`);
      });
    });

    test("rejects updating a secret to a value production already holds", async () => {
      await createSecretV2({
        workspaceId: projectId,
        environmentSlug: PROD_ENV,
        secretPath: "/",
        key: "UPDATE_TARGET",
        value: "value-before-update",
        authToken
      });
      await createSecretV2({
        workspaceId: projectId,
        environmentSlug: PROD_ENV,
        secretPath: "/",
        key: "UPDATE_HOLDER",
        value: "value-held-by-another-secret",
        authToken
      });

      await updateSecretV2({
        workspaceId: projectId,
        environmentSlug: PROD_ENV,
        secretPath: "/",
        key: "UPDATE_TARGET",
        value: "value-held-by-another-secret",
        authToken
      }).expect((res) => {
        expect(res.statusCode).toBe(400);
        expect(res.json().message).toContain('Secret "UPDATE_TARGET"');
        expect(res.json().message).toContain('value is already used by secret "UPDATE_HOLDER"');
        expect(res.json().message).toContain(`environment "${PROD_ENV}"`);
      });
    });

    test("accepts re-saving a secret with the value it already holds", async () => {
      await createSecretV2({
        workspaceId: projectId,
        environmentSlug: PROD_ENV,
        secretPath: "/",
        key: "SELF_UPDATE",
        value: "self-update-value",
        authToken
      });

      // The secret being written is excluded from the lookup, so it does not collide with itself.
      const updated = await updateSecretV2({
        workspaceId: projectId,
        environmentSlug: PROD_ENV,
        secretPath: "/",
        key: "SELF_UPDATE",
        value: "self-update-value",
        comment: "touched",
        authToken
      });

      expect(updated.secretValue).toBe("self-update-value");
    });
  });
});
