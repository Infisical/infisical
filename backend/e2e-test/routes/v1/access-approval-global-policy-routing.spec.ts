import { Knex } from "knex";

import { AccessScope, OrgMembershipRole, OrgMembershipStatus, ProjectMembershipRole, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { alphaNumericNanoId } from "@app/lib/nanoid";
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
const createLegacyPolicy = async (dto: { name: string; secretPath: string; id?: string }) => {
  const db = getDb();
  const env = await getSeedEnv();

  const [policy] = await db(TableName.AccessApprovalPolicy)
    .insert({
      ...(dto.id ? { id: dto.id } : {}),
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
    headers: authHeaders(),
    body: {
      projectSlug: seedData1.project.slug,
      environment: seedData1.environment.slug,
      name: dto.name,
      secretPath: dto.secretPath,
      approvers: [{ type: ApproverType.User, id: seedData1.id }],
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

  test("Updating a policy onto a path a policy on the other system covers is rejected", async () => {
    const db = getDb();
    const policy = await createGlobalPolicy({
      name: "policy-routing-conflict",
      secretPath: "/policy-routing-conflict"
    });
    const legacyPolicy = await createLegacyPolicy({
      name: "policy-routing-conflict-legacy",
      secretPath: "/policy-routing-conflict-legacy"
    });
    await createGlobalPolicy({
      name: "policy-routing-conflict-global",
      secretPath: "/policy-routing-conflict-global"
    });

    const legacyConflict = await patchPolicy(policy.id, { secretPath: "/policy-routing-conflict-legacy" });
    expect(legacyConflict.statusCode).toBe(400);
    expect(legacyConflict.json().message).toContain(`already exists in environment '${seedData1.environment.slug}'`);

    const legacyOntoGlobal = await patchPolicy(legacyPolicy.id, { secretPath: "/policy-routing-conflict-global" });
    expect(legacyOntoGlobal.statusCode).toBe(400);
    expect(legacyOntoGlobal.json().message).toContain(`already exists in environment '${seedData1.environment.slug}'`);

    const unchangedLegacy = await db(TableName.AccessApprovalPolicy).where({ id: legacyPolicy.id }).first();
    expect(unchangedLegacy?.secretPath).toBe("/policy-routing-conflict-legacy");
  });

  test("A migrated policy's legacy row does not block the scope it moved away from", async () => {
    const migrated = await createGlobalPolicy({
      name: "policy-routing-migrated",
      secretPath: "/policy-routing-migrated"
    });
    await createLegacyPolicy({
      id: migrated.id,
      name: "policy-routing-migrated",
      secretPath: "/policy-routing-migrated"
    });

    const moved = await patchPolicy(migrated.id, { secretPath: "/policy-routing-migrated-moved" });
    expect(moved.statusCode).toBe(200);

    const replacement = await createGlobalPolicy({
      name: "policy-routing-migrated-replacement",
      secretPath: "/policy-routing-migrated"
    });
    expect(replacement.secretPath).toBe("/policy-routing-migrated");
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

const seedProjectMember = async () => {
  const db = getDb();
  const username = `policy-routing-approver-${alphaNumericNanoId(8)}@example.com`.toLowerCase();
  const [user] = await db(TableName.Users)
    .insert({ username, email: username, isGhost: false, isAccepted: true, authMethods: ["email"] })
    .returning("*");

  const [orgMembership] = await db(TableName.Membership)
    .insert({
      scope: AccessScope.Organization,
      scopeOrgId: seedData1.organization.id,
      actorUserId: user.id,
      status: OrgMembershipStatus.Accepted,
      isActive: true
    })
    .returning("*");
  await db(TableName.MembershipRole).insert({ membershipId: orgMembership.id, role: OrgMembershipRole.Member });

  const [projectMembership] = await db(TableName.Membership)
    .insert({
      scope: AccessScope.Project,
      scopeOrgId: seedData1.organization.id,
      scopeProjectId: seedData1.project.id,
      actorUserId: user.id
    })
    .returning("*");
  await db(TableName.MembershipRole).insert({ membershipId: projectMembership.id, role: ProjectMembershipRole.Member });

  return user.id;
};

describe("Access approval policy required approvals per step", () => {
  let otherApproverId: string;

  beforeAll(async () => {
    otherApproverId = await seedProjectMember();
  });

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

  afterAll(async () => {
    const db = getDb();
    await db(TableName.Membership).where({ actorUserId: otherApproverId }).del();
    await db(TableName.Users).where({ id: otherApproverId }).del();
  });

  const getStepRequirements = async (policyId: string) =>
    (await getDb()(TableName.ApprovalPolicySteps).where({ policyId }).orderBy("stepNumber", "asc")).map(
      (step) => step.requiredApprovals
    );

  const approverViews = (approvers: { id: string; sequence: number; approvalsRequired: number }[]) =>
    approvers
      .map(({ id, sequence, approvalsRequired }) => ({ id, sequence, approvalsRequired }))
      .sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));

  test("A legacy policy also returns a user once per step", async () => {
    const legacyPolicy = await createLegacyPolicy({
      name: "policy-routing-legacy-user-in-two-steps",
      secretPath: "/legacy-user-in-two-steps"
    });

    const res = await patchPolicy(legacyPolicy.id, {
      approvers: [
        { type: ApproverType.User, id: seedData1.id, sequence: 1 },
        { type: ApproverType.User, id: otherApproverId, sequence: 1 },
        { type: ApproverType.User, id: otherApproverId, sequence: 2 }
      ],
      approvals: 2,
      approvalsRequired: [
        { stepNumber: 1, numberOfApprovals: 2 },
        { stepNumber: 2, numberOfApprovals: 1 }
      ]
    });
    expect(res.statusCode).toBe(200);

    const getRes = await getPolicy(legacyPolicy.id);
    expect(getRes.statusCode).toBe(200);
    expect(approverViews(getRes.json().approval.approvers)).toEqual(
      approverViews([
        { id: seedData1.id, sequence: 1, approvalsRequired: 2 },
        { id: otherApproverId, sequence: 1, approvalsRequired: 2 },
        { id: otherApproverId, sequence: 2, approvalsRequired: 1 }
      ])
    );
  });

  test("The same update stores the same effective requirement on legacy and global", async () => {
    const db = getDb();
    const legacyPolicy = await createLegacyPolicy({
      name: "policy-routing-required-legacy",
      secretPath: "/required-parity-legacy"
    });
    const globalPolicy = await createGlobalPolicy({
      name: "policy-routing-required-global",
      secretPath: "/required-parity-global"
    });
    const body = {
      approvers: [
        { type: ApproverType.User, id: seedData1.id, sequence: 1 },
        { type: ApproverType.User, id: otherApproverId, sequence: 2 }
      ],
      approvals: 2,
      approvalsRequired: [{ stepNumber: 1, numberOfApprovals: 1 }]
    };

    expect((await patchPolicy(legacyPolicy.id, body)).statusCode).toBe(200);
    expect((await patchPolicy(globalPolicy.id, body)).statusCode).toBe(200);

    const legacyApprovers = await db(TableName.AccessApprovalPolicyApprover)
      .where({ policyId: legacyPolicy.id })
      .orderBy("sequence", "asc");
    const legacyEffective = legacyApprovers.map((approver) => approver.approvalsRequired || 1);

    expect(legacyEffective).toEqual([1, 1]);
    expect(await getStepRequirements(globalPolicy.id)).toEqual(legacyEffective);
  });
});
