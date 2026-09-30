import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ApproverType, BypasserType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { EnforcementLevel } from "@app/lib/types";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

const SECRET_ACCESS_TYPE = "secret-access";

// Both systems share the seeded project and environment, so every policy this
// file creates is removed after each test to keep later specs unaffected.
const legacyPolicyIds: string[] = [];
const globalPolicyIds: string[] = [];

const authHeaders = () => ({ authorization: `Bearer ${jwtAuthToken}` });

const getSeedEnv = async () => {
  const env = await getDb()(TableName.Environment)
    .where({ projectId: seedData1.project.id, slug: seedData1.environment.slug })
    .first();
  if (!env) throw new Error(`seed environment '${seedData1.environment.slug}' not found`);
  return env;
};

// The create route always writes to the global tables now, so a legacy policy
// has to be seeded straight into the legacy tables.
const createLegacyPolicy = async (dto: { name: string; secretPath: string }) => {
  const db = getDb();
  const env = await getSeedEnv();

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

const createGlobalPolicy = async (dto: {
  name: string;
  secretPath: string;
  bypassers?: { type: BypasserType; id: string }[];
}) => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v1/access-approvals/policies",
    headers: authHeaders(),
    body: {
      projectSlug: seedData1.project.slug,
      environment: seedData1.environment.slug,
      name: dto.name,
      secretPath: dto.secretPath,
      approvers: [{ type: ApproverType.User, id: seedData1.id }],
      bypassers: dto.bypassers,
      approvals: 1
    }
  });
  expect(res.statusCode).toBe(200);
  const { approval } = res.json();
  globalPolicyIds.push(approval.id);
  return approval as { id: string; name: string; secretPath: string };
};

const patchPolicy = (policyId: string, body: Record<string, unknown>) =>
  testServer.inject({
    method: "PATCH",
    url: `/api/v1/access-approvals/policies/${policyId}`,
    headers: authHeaders(),
    body: {
      approvers: [{ type: ApproverType.User, id: seedData1.id }],
      approvals: 1,
      ...body
    }
  });

const getPolicy = (policyId: string) =>
  testServer.inject({
    method: "GET",
    url: `/api/v1/access-approvals/policies/${policyId}`,
    headers: authHeaders()
  });

const deletePolicy = (policyId: string) =>
  testServer.inject({
    method: "DELETE",
    url: `/api/v1/access-approvals/policies/${policyId}`,
    headers: authHeaders()
  });

const listPolicies = () =>
  testServer.inject({
    method: "GET",
    url: `/api/v1/access-approvals/policies?projectSlug=${seedData1.project.slug}`,
    headers: authHeaders()
  });

const countPolicies = () =>
  testServer.inject({
    method: "GET",
    url: `/api/v1/access-approvals/policies/count?projectSlug=${seedData1.project.slug}&envSlug=${seedData1.environment.slug}`,
    headers: authHeaders()
  });

const expectNoLegacyRow = async (policyId: string) => {
  const legacyRow = await getDb()(TableName.AccessApprovalPolicy).where({ id: policyId }).first();
  expect(legacyRow).toBeUndefined();
};

const expectNoGlobalRow = async (policyId: string) => {
  const globalRow = await getDb()(TableName.ApprovalPolicies).where({ id: policyId }).first();
  expect(globalRow).toBeUndefined();
};

describe("Access approval policy routing", () => {
  afterEach(async () => {
    const db = getDb();
    const legacyIds = legacyPolicyIds.splice(0);
    const globalIds = globalPolicyIds.splice(0);

    if (legacyIds.length) {
      await db(TableName.AccessApprovalPolicyApprover).whereIn("policyId", legacyIds).del();
      await db(TableName.AccessApprovalPolicyBypasser).whereIn("policyId", legacyIds).del();
      await db(TableName.AccessApprovalPolicyEnvironment).whereIn("policyId", legacyIds).del();
      await db(TableName.AccessApprovalPolicy).whereIn("id", legacyIds).del();
    }
    if (globalIds.length) {
      await db(TableName.ApprovalPolicies).whereIn("id", globalIds).del();
    }
  });

  test("Updating a global policy writes the global tables and returns the legacy shape", async () => {
    const db = getDb();
    const env = await getSeedEnv();
    const policy = await createGlobalPolicy({ name: "policy-routing-update", secretPath: "/policy-routing-update" });

    const res = await patchPolicy(policy.id, {
      name: "policy-routing-update-renamed",
      secretPath: "/policy-routing-update-moved",
      approvers: [{ type: ApproverType.User, id: seedData1.id, sequence: 1 }],
      bypassers: [{ type: BypasserType.User, id: seedData1.id }],
      approvals: 1,
      allowedSelfApprovals: false
    });

    expect(res.statusCode).toBe(200);
    const { approval } = res.json();
    expect(approval.id).toBe(policy.id);
    expect(approval.name).toBe("policy-routing-update-renamed");
    expect(approval.secretPath).toBe("/policy-routing-update-moved");
    expect(approval.envId).toBe(env.id);
    expect(approval.environment.slug).toBe(seedData1.environment.slug);
    expect(approval.environments).toHaveLength(1);
    expect(approval.allowedSelfApprovals).toBe(false);
    expect(approval.approvals).toBe(1);

    const globalRow = await db(TableName.ApprovalPolicies).where({ id: policy.id }).first();
    expect(globalRow?.name).toBe("policy-routing-update-renamed");
    expect(globalRow?.type).toBe(SECRET_ACCESS_TYPE);

    const steps = await db(TableName.ApprovalPolicySteps).where({ policyId: policy.id });
    expect(steps).toHaveLength(1);
    expect(steps[0].requiredApprovals).toBe(1);

    const stepApprovers = await db(TableName.ApprovalPolicyStepApprovers).where({ policyStepId: steps[0].id });
    expect(stepApprovers).toHaveLength(1);
    expect(stepApprovers[0].userId).toBe(seedData1.id);

    const bypassers = await db(TableName.ApprovalPolicyBypassers).where({ policyId: policy.id });
    expect(bypassers).toHaveLength(1);
    expect(bypassers[0].userId).toBe(seedData1.id);

    const envRows = await db(TableName.ApprovalPolicySecretEnvironment).where({ policyId: policy.id });
    expect(envRows).toHaveLength(1);
    expect(envRows[0].secretPath).toBe("/policy-routing-update-moved");
    expect(envRows[0].envId).toBe(env.id);

    await expectNoLegacyRow(policy.id);
  });

  test("Updating a global policy onto a path another policy covers is rejected on either system", async () => {
    const policy = await createGlobalPolicy({
      name: "policy-routing-conflict",
      secretPath: "/policy-routing-conflict"
    });
    await createLegacyPolicy({ name: "policy-routing-conflict-legacy", secretPath: "/policy-routing-conflict-legacy" });
    await createGlobalPolicy({
      name: "policy-routing-conflict-global",
      secretPath: "/policy-routing-conflict-global"
    });

    const legacyConflict = await patchPolicy(policy.id, { secretPath: "/policy-routing-conflict-legacy" });
    expect(legacyConflict.statusCode).toBe(400);
    expect(legacyConflict.json().message).toContain(`already exists in environment '${seedData1.environment.slug}'`);

    const globalConflict = await patchPolicy(policy.id, { secretPath: "/policy-routing-conflict-global" });
    expect(globalConflict.statusCode).toBe(400);
    expect(globalConflict.json().message).toContain(`already exists in environment '${seedData1.environment.slug}'`);

    const samePath = await patchPolicy(policy.id, { secretPath: "/policy-routing-conflict" });
    expect(samePath.statusCode).toBe(200);
  });

  test("Getting a global policy by id carries approver and bypasser names", async () => {
    const policy = await createGlobalPolicy({
      name: "policy-routing-get",
      secretPath: "/policy-routing-get",
      bypassers: [{ type: BypasserType.User, id: seedData1.id }]
    });

    const res = await getPolicy(policy.id);

    expect(res.statusCode).toBe(200);
    const { approval } = res.json();
    expect(approval.id).toBe(policy.id);
    expect(approval.secretPath).toBe("/policy-routing-get");
    expect(approval.approvers).toEqual([
      {
        id: seedData1.id,
        type: ApproverType.User,
        name: seedData1.username,
        sequence: 1,
        approvalsRequired: 1
      }
    ]);
    expect(approval.bypassers).toEqual([{ id: seedData1.id, type: BypasserType.User, name: seedData1.username }]);
  });

  test("Listing and counting policies include both systems", async () => {
    const legacyPolicy = await createLegacyPolicy({
      name: "policy-routing-list-legacy",
      secretPath: "/policy-routing-list-legacy"
    });
    const globalPolicy = await createGlobalPolicy({
      name: "policy-routing-list-global",
      secretPath: "/policy-routing-list-global"
    });

    const listRes = await listPolicies();
    expect(listRes.statusCode).toBe(200);
    const { approvals }: { approvals: { id: string; approvers: { name?: string }[] }[] } = listRes.json();
    const listedIds = approvals.map((policy) => policy.id);
    expect(listedIds).toContain(legacyPolicy.id);
    expect(listedIds).toContain(globalPolicy.id);

    const listedGlobal = approvals.find((policy) => policy.id === globalPolicy.id);
    expect(listedGlobal?.approvers[0]?.name).toBe(seedData1.username);

    const countRes = await countPolicies();
    expect(countRes.statusCode).toBe(200);
    expect(countRes.json().count).toBe(approvals.length);
  });

  test("Deleting a global policy removes it and its dependent rows", async () => {
    const db = getDb();
    const policy = await createGlobalPolicy({ name: "policy-routing-delete", secretPath: "/policy-routing-delete" });

    const res = await deletePolicy(policy.id);

    expect(res.statusCode).toBe(200);
    expect(res.json().approval.id).toBe(policy.id);
    expect(res.json().approval.secretPath).toBe("/policy-routing-delete");

    await expectNoGlobalRow(policy.id);
    expect(await db(TableName.ApprovalPolicySteps).where({ policyId: policy.id })).toHaveLength(0);
    expect(await db(TableName.ApprovalPolicyBypassers).where({ policyId: policy.id })).toHaveLength(0);
    expect(await db(TableName.ApprovalPolicySecretEnvironment).where({ policyId: policy.id })).toHaveLength(0);
    await expectNoLegacyRow(policy.id);
  });

  test("A legacy policy keeps being served from the legacy tables", async () => {
    const db = getDb();
    const policy = await createLegacyPolicy({ name: "policy-routing-legacy", secretPath: "/policy-routing-legacy" });

    const getRes = await getPolicy(policy.id);
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().approval.id).toBe(policy.id);

    const patchRes = await patchPolicy(policy.id, { name: "policy-routing-legacy-renamed" });
    expect(patchRes.statusCode).toBe(200);
    const legacyRow = await db(TableName.AccessApprovalPolicy).where({ id: policy.id }).first();
    expect(legacyRow?.name).toBe("policy-routing-legacy-renamed");
    await expectNoGlobalRow(policy.id);

    const deleteRes = await deletePolicy(policy.id);
    expect(deleteRes.statusCode).toBe(200);
    const softDeletedRow = await db(TableName.AccessApprovalPolicy).where({ id: policy.id }).first();
    expect(softDeletedRow?.deletedAt).not.toBeNull();
    await expectNoGlobalRow(policy.id);
  });

  test("Updating a policy never moves it between systems", async () => {
    const db = getDb();
    const env = await getSeedEnv();
    const legacyPolicy = await createLegacyPolicy({
      name: "policy-routing-stay-legacy",
      secretPath: "/policy-routing-stay-legacy"
    });
    const globalPolicy = await createGlobalPolicy({
      name: "policy-routing-stay-global",
      secretPath: "/policy-routing-stay-global"
    });

    const legacyRes = await patchPolicy(legacyPolicy.id, { name: "policy-routing-stay-legacy-renamed" });
    expect(legacyRes.statusCode).toBe(200);
    const legacyRow = await db(TableName.AccessApprovalPolicy).where({ id: legacyPolicy.id }).first();
    expect(legacyRow?.name).toBe("policy-routing-stay-legacy-renamed");
    await expectNoGlobalRow(legacyPolicy.id);
    const strayGlobalEnvRows = await db(TableName.ApprovalPolicySecretEnvironment).where({
      envId: env.id,
      secretPath: "/policy-routing-stay-legacy"
    });
    expect(strayGlobalEnvRows).toHaveLength(0);

    const globalRes = await patchPolicy(globalPolicy.id, { name: "policy-routing-stay-global-renamed" });
    expect(globalRes.statusCode).toBe(200);
    expect(globalRes.json().approval.id).toBe(globalPolicy.id);
    const globalRow = await db(TableName.ApprovalPolicies).where({ id: globalPolicy.id }).first();
    expect(globalRow?.type).toBe(SECRET_ACCESS_TYPE);
    expect(globalRow?.name).toBe("policy-routing-stay-global-renamed");
    await expectNoLegacyRow(globalPolicy.id);
  });
});
