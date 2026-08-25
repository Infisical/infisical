import { SecretType } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";

/**
 * Tests for the `bypassForMachineIdentities` flag on secret approval policies.
 *
 * When bypass is enabled, machine identities (IDENTITY_ACCESS_TOKEN auth) should
 * be able to create/update/delete secrets directly without going through the
 * approval flow. Users (JWT auth) must always go through approval regardless
 * of the flag.
 *
 * Uses the v3 project (seedData1.projectV3) which supports server-side encryption
 * and the v4 secret endpoints.
 */

// Track policy IDs for cleanup
const createdPolicyIds: string[] = [];

const deletePolicy = async (sapId: string) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v1/secret-approvals/${sapId}`,
    headers: { authorization: `Bearer ${jwtAuthToken}` }
  });
  if (res.statusCode !== 200 && res.statusCode !== 404) {
    throw new Error(`cleanup: unexpected ${res.statusCode} deleting policy ${sapId}`);
  }
};

const createApprovalPolicy = async (dto: { name: string; bypassForMachineIdentities: boolean }) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/secret-approvals`,
    headers: { authorization: `Bearer ${jwtAuthToken}` },
    body: {
      workspaceId: seedData1.projectV3.id,
      environment: seedData1.environment.slug,
      secretPath: "/",
      approvers: [{ type: ApproverType.User, id: seedData1.id }],
      approvals: 1,
      name: dto.name,
      enforcementLevel: "hard",
      bypassForMachineIdentities: dto.bypassForMachineIdentities
    }
  });
  expect(res.statusCode).toBe(200);
  const { approval } = res.json();
  createdPolicyIds.push(approval.id);
  return approval;
};

const updateApprovalPolicy = async (sapId: string, bypassForMachineIdentities: boolean) => {
  const res = await testServer.inject({
    method: "PATCH",
    url: `/api/v1/secret-approvals/${sapId}`,
    headers: { authorization: `Bearer ${jwtAuthToken}` },
    body: {
      approvers: [{ type: ApproverType.User, id: seedData1.id }],
      bypassForMachineIdentities
    }
  });
  expect(res.statusCode).toBe(200);
  return res.json().approval;
};

const getMachineIdentityToken = async () => {
  const loginRes = await testServer.inject({
    method: "POST",
    url: "/api/v1/auth/universal-auth/login",
    body: {
      clientId: seedData1.machineIdentity.clientCredentials.id,
      clientSecret: seedData1.machineIdentity.clientCredentials.secret
    }
  });
  expect(loginRes.statusCode).toBe(200);
  return loginRes.json().accessToken as string;
};

// -- Secret helpers using v4 endpoints --

const createSecretRaw = async (token: string, key: string, value: string) => {
  return testServer.inject({
    method: "POST",
    url: `/api/v4/secrets/${key}`,
    headers: { authorization: `Bearer ${token}` },
    body: {
      projectId: seedData1.projectV3.id,
      environment: seedData1.environment.slug,
      secretPath: "/",
      type: SecretType.Shared,
      secretKey: key,
      secretValue: value
    }
  });
};

const updateSecretRaw = async (token: string, key: string, value: string) => {
  return testServer.inject({
    method: "PATCH",
    url: `/api/v4/secrets/${key}`,
    headers: { authorization: `Bearer ${token}` },
    body: {
      projectId: seedData1.projectV3.id,
      environment: seedData1.environment.slug,
      secretPath: "/",
      type: SecretType.Shared,
      secretValue: value
    }
  });
};

const deleteSecretRaw = async (token: string, key: string) => {
  return testServer.inject({
    method: "DELETE",
    url: `/api/v4/secrets/${key}`,
    headers: { authorization: `Bearer ${token}` },
    body: {
      projectId: seedData1.projectV3.id,
      environment: seedData1.environment.slug,
      secretPath: "/"
    }
  });
};

const bulkCreateSecrets = async (token: string, secrets: { secretKey: string; secretValue: string }[]) => {
  return testServer.inject({
    method: "POST",
    url: `/api/v4/secrets/batch`,
    headers: { authorization: `Bearer ${token}` },
    body: {
      projectId: seedData1.projectV3.id,
      environment: seedData1.environment.slug,
      secretPath: "/",
      secrets
    }
  });
};

const bulkUpdateSecrets = async (token: string, secrets: { secretKey: string; secretValue: string }[]) => {
  return testServer.inject({
    method: "PATCH",
    url: `/api/v4/secrets/batch`,
    headers: { authorization: `Bearer ${token}` },
    body: {
      projectId: seedData1.projectV3.id,
      environment: seedData1.environment.slug,
      secretPath: "/",
      secrets
    }
  });
};

const bulkDeleteSecrets = async (token: string, secretKeys: string[]) => {
  return testServer.inject({
    method: "DELETE",
    url: `/api/v4/secrets/batch`,
    headers: { authorization: `Bearer ${token}` },
    body: {
      projectId: seedData1.projectV3.id,
      environment: seedData1.environment.slug,
      secretPath: "/",
      secrets: secretKeys.map((secretKey) => ({ secretKey }))
    }
  });
};

// Response shape checks
const isDirectSecret = (res: { statusCode: number; json: () => Record<string, unknown> }) => {
  if (res.statusCode !== 200) return false;
  const body = res.json();
  return "secret" in body || "secrets" in body;
};

const isApprovalRequest = (res: { statusCode: number; json: () => Record<string, unknown> }) => {
  if (res.statusCode !== 200) return false;
  const body = res.json();
  return "approval" in body;
};

// Best-effort secret cleanup (ignore errors)
const cleanupSecret = async (token: string, key: string) => {
  await testServer.inject({
    method: "DELETE",
    url: `/api/v4/secrets/${key}`,
    headers: { authorization: `Bearer ${token}` },
    body: {
      projectId: seedData1.projectV3.id,
      environment: seedData1.environment.slug,
      secretPath: "/"
    }
  });
};

describe("Secret approval policy bypass for machine identities", () => {
  let miToken: string;

  beforeAll(async () => {
    miToken = await getMachineIdentityToken();
  });

  // Safety net: delete any policies that were tracked but not cleaned up by
  // a nested describe's afterAll (e.g. when a test block fails before its
  // own cleanup runs). Runs after the entire top-level describe, not after
  // each individual test, so it won't interfere with nested blocks that
  // share a policy across multiple tests.
  afterAll(async () => {
    const ids = createdPolicyIds.splice(0);
    await Promise.all(ids.map(deletePolicy));
  });

  // ============================================================
  // PHASE 1: bypass=true -- machine identity bypasses the policy
  // ============================================================
  describe("bypass=true: machine identity bypasses approval", () => {
    let policyId: string;

    beforeAll(async () => {
      const policy = await createApprovalPolicy({
        name: "bypass-mi-test",
        bypassForMachineIdentities: true
      });
      policyId = policy.id;
    });

    afterAll(async () => {
      // Cleanup secrets created during these tests (best-effort)
      const keys = ["BP_SINGLE_1", "BP_UPD_1", "BP_DEL_1", "BP_BULK_A", "BP_BULK_B"];
      await Promise.all(keys.map((k) => cleanupSecret(miToken, k)));
      await deletePolicy(policyId);
      // Remove from tracked list since we deleted it manually
      const idx = createdPolicyIds.indexOf(policyId);
      if (idx >= 0) createdPolicyIds.splice(idx, 1);
    });

    test("Create single secret directly", async () => {
      const res = await createSecretRaw(miToken, "BP_SINGLE_1", "val1");
      expect(isDirectSecret(res)).toBe(true);
    });

    test("Update single secret directly", async () => {
      const res = await updateSecretRaw(miToken, "BP_SINGLE_1", "val2");
      expect(isDirectSecret(res)).toBe(true);
    });

    test("Delete single secret directly", async () => {
      // Seed a secret to delete
      await createSecretRaw(miToken, "BP_DEL_1", "to-delete");
      const res = await deleteSecretRaw(miToken, "BP_DEL_1");
      expect(isDirectSecret(res)).toBe(true);
    });

    test("Bulk create secrets directly", async () => {
      const res = await bulkCreateSecrets(miToken, [
        { secretKey: "BP_BULK_A", secretValue: "a" },
        { secretKey: "BP_BULK_B", secretValue: "b" }
      ]);
      expect(isDirectSecret(res)).toBe(true);
    });

    test("Bulk update secrets directly", async () => {
      const res = await bulkUpdateSecrets(miToken, [
        { secretKey: "BP_BULK_A", secretValue: "a2" },
        { secretKey: "BP_BULK_B", secretValue: "b2" }
      ]);
      expect(isDirectSecret(res)).toBe(true);
    });

    test("Bulk delete secrets directly", async () => {
      const res = await bulkDeleteSecrets(miToken, ["BP_BULK_A", "BP_BULK_B"]);
      expect(isDirectSecret(res)).toBe(true);
    });
  });

  // ============================================================
  // PHASE 2: bypass=false -- machine identity blocked by policy
  // ============================================================
  describe("bypass=false: machine identity goes through approval", () => {
    let policyId: string;

    beforeAll(async () => {
      const policy = await createApprovalPolicy({
        name: "no-bypass-mi-test",
        bypassForMachineIdentities: false
      });
      policyId = policy.id;
    });

    afterAll(async () => {
      await deletePolicy(policyId);
      const idx = createdPolicyIds.indexOf(policyId);
      if (idx >= 0) createdPolicyIds.splice(idx, 1);
    });

    test("Create single secret triggers approval", async () => {
      const res = await createSecretRaw(miToken, "NBP_SINGLE_1", "val1");
      expect(isApprovalRequest(res)).toBe(true);
    });

    test("Bulk create secrets triggers approval", async () => {
      const res = await bulkCreateSecrets(miToken, [
        { secretKey: "NBP_BULK_A", secretValue: "a" },
        { secretKey: "NBP_BULK_B", secretValue: "b" }
      ]);
      expect(isApprovalRequest(res)).toBe(true);
    });
  });

  // ============================================================
  // PHASE 3: Toggle -- flipping bypass takes effect immediately
  // ============================================================
  describe("toggling bypass takes effect immediately", () => {
    let policyId: string;

    beforeAll(async () => {
      const policy = await createApprovalPolicy({
        name: "toggle-mi-test",
        bypassForMachineIdentities: false
      });
      policyId = policy.id;
    });

    afterAll(async () => {
      await cleanupSecret(miToken, "TOGGLE_1");
      await deletePolicy(policyId);
      const idx = createdPolicyIds.indexOf(policyId);
      if (idx >= 0) createdPolicyIds.splice(idx, 1);
    });

    test("Blocked when bypass=false, then bypasses after flipping to true", async () => {
      // Should be blocked
      const blockedRes = await createSecretRaw(miToken, "TOGGLE_1", "blocked");
      expect(isApprovalRequest(blockedRes)).toBe(true);

      // Flip to bypass=true
      await updateApprovalPolicy(policyId, true);

      // Should now bypass
      const bypassedRes = await createSecretRaw(miToken, "TOGGLE_1", "bypassed");
      expect(isDirectSecret(bypassedRes)).toBe(true);
    });
  });

  // ============================================================
  // PHASE 4: User regression -- users always go through approval
  // ============================================================
  describe("users always go through approval regardless of bypass flag", () => {
    let policyId: string;

    beforeAll(async () => {
      const policy = await createApprovalPolicy({
        name: "user-regression-test",
        bypassForMachineIdentities: true
      });
      policyId = policy.id;
    });

    afterAll(async () => {
      // Clean up any secrets the MI may have created
      await cleanupSecret(miToken, "USER_UPD_SEED");
      await deletePolicy(policyId);
      const idx = createdPolicyIds.indexOf(policyId);
      if (idx >= 0) createdPolicyIds.splice(idx, 1);
    });

    test("User create single secret triggers approval (bypass=true)", async () => {
      const res = await createSecretRaw(jwtAuthToken, "USER_CREATE_1", "user-val");
      expect(isApprovalRequest(res)).toBe(true);
    });

    test("User bulk create triggers approval (bypass=true)", async () => {
      const res = await bulkCreateSecrets(jwtAuthToken, [
        { secretKey: "USER_BULK_A", secretValue: "a" },
        { secretKey: "USER_BULK_B", secretValue: "b" }
      ]);
      expect(isApprovalRequest(res)).toBe(true);
    });

    test("User update triggers approval (bypass=true)", async () => {
      // Seed via MI (bypasses policy)
      await createSecretRaw(miToken, "USER_UPD_SEED", "seed-val");

      const res = await updateSecretRaw(jwtAuthToken, "USER_UPD_SEED", "updated");
      expect(isApprovalRequest(res)).toBe(true);
    });

    test("User delete triggers approval (bypass=true)", async () => {
      const res = await deleteSecretRaw(jwtAuthToken, "USER_UPD_SEED");
      expect(isApprovalRequest(res)).toBe(true);
    });

    test("User create still triggers approval after flipping to bypass=false", async () => {
      await updateApprovalPolicy(policyId, false);

      const res = await createSecretRaw(jwtAuthToken, "USER_NOBYPASS_1", "val");
      expect(isApprovalRequest(res)).toBe(true);

      // Restore bypass=true for subsequent tests
      await updateApprovalPolicy(policyId, true);
    });
  });
});
