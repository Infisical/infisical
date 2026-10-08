import { createIsolatedOrgAndProject } from "e2e-test/testUtils/fixtures";
import { createFolder } from "e2e-test/testUtils/folders";
import { createStaticSecretsValidationRule } from "e2e-test/testUtils/secret-validation-rules";
import { createSecretV2, getSecretsV2, updateSecretV2 } from "e2e-test/testUtils/secrets";

import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";

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

  // A move writes its secrets at the destination, so they are held to the destination's rules like any
  // other write there, whether a single secret or a whole folder is moved.
  describe("Moving secrets and folders into a path with rules", () => {
    let projectId: string;
    let authToken: string;
    let cleanup: () => Promise<void>;

    const moveSecrets = (dto: {
      environment: string;
      sourceSecretPath: string;
      destinationSecretPath: string;
      secretIds: string[];
    }) =>
      testServer.inject({
        method: "POST",
        url: `/api/v4/secrets/move`,
        headers: {
          authorization: `Bearer ${authToken}`
        },
        body: {
          projectId,
          sourceEnvironment: dto.environment,
          sourceSecretPath: dto.sourceSecretPath,
          destinationEnvironment: dto.environment,
          destinationSecretPath: dto.destinationSecretPath,
          secretIds: dto.secretIds
        }
      });

    const moveFolder = (dto: { folderId: string; environment: string; destinationPath: string }) =>
      testServer.inject({
        method: "POST",
        url: `/api/v2/folders/move`,
        headers: {
          authorization: `Bearer ${authToken}`
        },
        body: {
          projectId,
          folderId: dto.folderId,
          destinationEnvironment: dto.environment,
          destinationPath: dto.destinationPath
        }
      });

    const secretKeysAt = async (secretPath: string, environment: string) => {
      const { secrets } = await getSecretsV2({
        workspaceId: projectId,
        environmentSlug: environment,
        secretPath,
        authToken
      });
      return secrets.map((secret) => secret.secretKey);
    };

    const folderNamesAt = async (secretPath: string, environment: string) => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/v2/folders`,
        headers: {
          authorization: `Bearer ${authToken}`
        },
        query: {
          projectId,
          environment,
          path: secretPath
        }
      });
      expect(res.statusCode).toBe(200);
      return (res.json().folders as { id: string; name: string }[]).map((folder) => folder.name);
    };

    const createSecretApprovalPolicy = async (dto: { name: string; environment: string; secretPath: string }) => {
      const res = await testServer.inject({
        method: "POST",
        url: `/api/v1/secret-approvals`,
        headers: {
          authorization: `Bearer ${authToken}`
        },
        body: {
          workspaceId: projectId,
          environment: dto.environment,
          name: dto.name,
          secretPath: dto.secretPath,
          approvers: [{ id: seedData1.id, type: ApproverType.User }],
          approvals: 1
        }
      });
      expect(res.statusCode).toBe(200);
      return res.json().approval as { id: string };
    };

    const deleteSecretApprovalPolicy = async (id: string) => {
      const res = await testServer.inject({
        method: "DELETE",
        url: `/api/v1/secret-approvals/${id}`,
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });
      expect(res.statusCode).toBe(200);
    };

    const openChangeRequestCount = async (policyId: string) => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/v1/secret-approval-requests/count`,
        headers: {
          authorization: `Bearer ${authToken}`
        },
        query: {
          projectId,
          policyId
        }
      });
      expect(res.statusCode).toBe(200);
      return res.json().approvals.open as number;
    };

    beforeAll(async () => {
      ({ projectId, authToken, cleanup } = await createIsolatedOrgAndProject("secret-validation-rules-move-e2e"));

      // In production, "/strict" and everything under it requires values of at least 3 characters, while
      // "/lenient" has no rules.
      await createFolder({
        workspaceId: projectId,
        environmentSlug: PROD_ENV,
        secretPath: "/",
        name: "strict",
        authToken
      });
      await createFolder({
        workspaceId: projectId,
        environmentSlug: PROD_ENV,
        secretPath: "/",
        name: "lenient",
        authToken
      });
      await createStaticSecretsValidationRule({
        projectId,
        name: "min-length-under-strict",
        environment: PROD_ENV,
        secretPath: "/strict/**",
        valueConstraints: { minLength: 3 },
        authToken
      });

      // In staging, no two secrets anywhere may hold the same value.
      await createFolder({
        workspaceId: projectId,
        environmentSlug: STAGING_ENV,
        secretPath: "/",
        name: "from",
        authToken
      });
      await createFolder({
        workspaceId: projectId,
        environmentSlug: STAGING_ENV,
        secretPath: "/",
        name: "to",
        authToken
      });
      await createStaticSecretsValidationRule({
        projectId,
        name: "no-duplicate-values-in-staging",
        environment: STAGING_ENV,
        secretPath: "/**",
        valueConstraints: { uniqueWithinScope: true },
        authToken
      });
    });

    afterAll(async () => {
      await cleanup();
    });

    test("rejects moving a secret whose value breaks the destination's rule", async () => {
      const secret = await createSecretV2({
        workspaceId: projectId,
        environmentSlug: PROD_ENV,
        secretPath: "/lenient",
        key: "TOO_SHORT",
        value: "x",
        authToken
      });

      const res = await moveSecrets({
        environment: PROD_ENV,
        sourceSecretPath: "/lenient",
        destinationSecretPath: "/strict",
        secretIds: [secret.id]
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain('Secret "TOO_SHORT"');
      expect(res.json().message).toContain("value must be at least 3 characters");

      // the secret is untouched because the move was rejected before anything was written
      expect(await secretKeysAt("/lenient", PROD_ENV)).toContain("TOO_SHORT");
      expect(await secretKeysAt("/strict", PROD_ENV)).not.toContain("TOO_SHORT");
    }, 10_000);

    test("accepts moving a secret whose value meets the destination's rule", async () => {
      const secret = await createSecretV2({
        workspaceId: projectId,
        environmentSlug: PROD_ENV,
        secretPath: "/lenient",
        key: "LONG_ENOUGH",
        value: "long-enough-value",
        authToken
      });

      const res = await moveSecrets({
        environment: PROD_ENV,
        sourceSecretPath: "/lenient",
        destinationSecretPath: "/strict",
        secretIds: [secret.id]
      });
      expect(res.statusCode).toBe(200);

      expect(await secretKeysAt("/strict", PROD_ENV)).toContain("LONG_ENOUGH");
      expect(await secretKeysAt("/lenient", PROD_ENV)).not.toContain("LONG_ENOUGH");
    }, 10_000);

    test("rejects moving a folder holding a secret that breaks the destination's rule", async () => {
      const folder = await createFolder({
        workspaceId: projectId,
        environmentSlug: PROD_ENV,
        secretPath: "/lenient",
        name: "short-values",
        authToken
      });
      await createSecretV2({
        workspaceId: projectId,
        environmentSlug: PROD_ENV,
        secretPath: "/lenient/short-values",
        key: "NESTED_TOO_SHORT",
        value: "x",
        authToken
      });

      const res = await moveFolder({
        folderId: folder.id,
        environment: PROD_ENV,
        destinationPath: "/strict"
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain('Secret "NESTED_TOO_SHORT"');
      expect(res.json().message).toContain("value must be at least 3 characters");

      // the folder and its secret are untouched because the move was rejected before anything was written
      expect(await folderNamesAt("/lenient", PROD_ENV)).toContain("short-values");
      expect(await folderNamesAt("/strict", PROD_ENV)).not.toContain("short-values");
      expect(await secretKeysAt("/lenient/short-values", PROD_ENV)).toContain("NESTED_TOO_SHORT");
    }, 10_000);

    test("accepts moving a secret within a no-duplicates scope that also covers its source", async () => {
      const secret = await createSecretV2({
        workspaceId: projectId,
        environmentSlug: STAGING_ENV,
        secretPath: "/from",
        key: "MOVED_UNIQUE",
        value: "moved-unique-value",
        authToken
      });

      // The source copy still holds the value while the move runs, so it must not count as a duplicate.
      const res = await moveSecrets({
        environment: STAGING_ENV,
        sourceSecretPath: "/from",
        destinationSecretPath: "/to",
        secretIds: [secret.id]
      });
      expect(res.statusCode).toBe(200);

      expect(await secretKeysAt("/to", STAGING_ENV)).toContain("MOVED_UNIQUE");
      expect(await secretKeysAt("/from", STAGING_ENV)).not.toContain("MOVED_UNIQUE");
    }, 10_000);

    test("rejects moving a secret that breaks the destination's rule into a path with a change policy", async () => {
      await createFolder({
        workspaceId: projectId,
        environmentSlug: PROD_ENV,
        secretPath: "/strict",
        name: "guarded",
        authToken
      });
      const policy = await createSecretApprovalPolicy({
        name: "guarded-under-strict",
        environment: PROD_ENV,
        secretPath: "/strict/guarded"
      });

      // Registered rather than left at the end of the body so a failing assertion can't leak the policy into
      // the tests that share this project.
      onTestFinished(async () => {
        await deleteSecretApprovalPolicy(policy.id);
      });

      const secret = await createSecretV2({
        workspaceId: projectId,
        environmentSlug: PROD_ENV,
        secretPath: "/lenient",
        key: "GUARDED_TOO_SHORT",
        value: "x",
        authToken
      });

      // A move into a path with a change policy opens a change request instead of writing directly, so the rules
      // have to be enforced before that request is opened.
      const res = await moveSecrets({
        environment: PROD_ENV,
        sourceSecretPath: "/lenient",
        destinationSecretPath: "/strict/guarded",
        secretIds: [secret.id]
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain('Secret "GUARDED_TOO_SHORT"');
      expect(res.json().message).toContain("value must be at least 3 characters");

      // no change request was opened and the secret is untouched
      expect(await openChangeRequestCount(policy.id)).toBe(0);
      expect(await secretKeysAt("/lenient", PROD_ENV)).toContain("GUARDED_TOO_SHORT");
    }, 10_000);
  });
});
