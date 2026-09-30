import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { EnforcementLevel } from "@app/lib/types";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

const GLOBAL_REQUEST_UNSUPPORTED_MESSAGE =
  "Secret access approval requests are not supported on the global approval system yet";

// Both systems share the seeded project and environment, so every policy this
// file creates is removed after each test to keep later specs unaffected.
const legacyPolicyIds: string[] = [];
const globalPolicyIds: string[] = [];

// The create route always writes to the global tables now, so a legacy policy
// has to be seeded straight into the legacy tables.
const createLegacyPolicy = async (dto: { name: string; secretPath: string }) => {
  const db = getDb();
  const env = await db(TableName.Environment)
    .where({ projectId: seedData1.project.id, slug: seedData1.environment.slug })
    .first();
  if (!env) throw new Error(`seed environment '${seedData1.environment.slug}' not found`);

  const [policy] = await db(TableName.AccessApprovalPolicy)
    .insert({
      name: dto.name,
      secretPath: dto.secretPath,
      envId: env.id,
      approvals: 1,
      enforcementLevel: EnforcementLevel.Hard,
      allowedSelfApprovals: true
    })
    .returning("*");
  legacyPolicyIds.push(policy.id);

  await db(TableName.AccessApprovalPolicyEnvironment).insert({ policyId: policy.id, envId: env.id });
  await db(TableName.AccessApprovalPolicyApprover).insert({
    policyId: policy.id,
    approverUserId: seedData1.id,
    sequence: 1,
    approvalsRequired: 1
  });

  return policy;
};

const createGlobalPolicy = async (dto: { name: string; secretPath: string }) => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v1/access-approvals/policies",
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      projectSlug: seedData1.project.slug,
      environment: seedData1.environment.slug,
      name: dto.name,
      secretPath: dto.secretPath,
      approvers: [{ type: ApproverType.User, id: seedData1.id }],
      approvals: 1
    }
  });

  if (res.statusCode === 200) {
    globalPolicyIds.push(res.json().approval.id);
  }
  return res;
};

const createAccessRequest = (secretPath: string) =>
  testServer.inject({
    method: "POST",
    url: `/api/v1/access-approvals/requests?projectSlug=${seedData1.project.slug}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      permissions: [
        ["read", "secrets", { environment: seedData1.environment.slug, secretPath: { $glob: secretPath } }]
      ],
      isTemporary: false
    }
  });

describe("Access approval request routing", () => {
  afterEach(async () => {
    const db = getDb();
    const legacyIds = legacyPolicyIds.splice(0);
    const globalIds = globalPolicyIds.splice(0);

    if (legacyIds.length) {
      await db(TableName.AccessApprovalRequest).whereIn("policyId", legacyIds).del();
      await db(TableName.AccessApprovalPolicyApprover).whereIn("policyId", legacyIds).del();
      await db(TableName.AccessApprovalPolicyEnvironment).whereIn("policyId", legacyIds).del();
      await db(TableName.AccessApprovalPolicy).whereIn("id", legacyIds).del();
    }
    if (globalIds.length) {
      await db(TableName.ApprovalPolicies).whereIn("id", globalIds).del();
    }
  });

  test("A global policy cannot be created for an env and path a legacy policy already covers", async () => {
    const db = getDb();
    const secretPath = "/routing-conflict";
    await createLegacyPolicy({ name: "routing-conflict-legacy", secretPath });

    const res = await createGlobalPolicy({ name: "routing-conflict-global", secretPath });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain(`already exists in environment '${seedData1.environment.slug}'`);

    const globalRows = await db(TableName.ApprovalPolicySecretEnvironment).where({ secretPath });
    expect(globalRows).toHaveLength(0);
  });

  test("A request against a legacy policy is created on the legacy system", async () => {
    const db = getDb();
    const secretPath = "/routing-legacy";
    const legacyPolicy = await createLegacyPolicy({ name: "routing-legacy", secretPath });

    const res = await createAccessRequest(secretPath);

    expect(res.statusCode).toBe(200);
    const { approval } = res.json();
    expect(approval.policyId).toBe(legacyPolicy.id);

    const rows = await db(TableName.AccessApprovalRequest).where({ policyId: legacyPolicy.id });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(approval.id);
  });

  test("A request against a global policy is routed to the global system", async () => {
    const db = getDb();
    const secretPath = "/routing-global";
    const createRes = await createGlobalPolicy({ name: "routing-global", secretPath });
    expect(createRes.statusCode).toBe(200);

    const globalPolicyRow = await db(TableName.ApprovalPolicies).where({ id: createRes.json().approval.id }).first();
    expect(globalPolicyRow?.type).toBe("secret-access");

    const res = await createAccessRequest(secretPath);

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe(GLOBAL_REQUEST_UNSUPPORTED_MESSAGE);

    const legacyRows = await db(TableName.AccessApprovalRequest)
      .whereRaw(`"permissions"::text like ?`, [`%${secretPath}%`])
      .select("id");
    expect(legacyRows).toHaveLength(0);
  });

  test("A request with no policy on either system is rejected", async () => {
    const res = await createAccessRequest("/routing-none");

    expect(res.statusCode).toBe(404);
    expect(res.json().message).toContain("No policy in environment");
  });
});
