import { Knex } from "knex";

import { AccessScope, OrgMembershipRole, OrgMembershipStatus, ProjectMembershipRole, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { EnforcementLevel } from "@app/lib/types";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

// Every policy this file creates lives in the seeded project and environment, so it is
// removed after each test to keep later specs unaffected.
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

// Policies the migration left behind only exist in the legacy tables, so they are seeded there directly.
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

  test("Updating a policy onto a path another policy covers is rejected", async () => {
    const policy = await createGlobalPolicy({
      name: "policy-routing-conflict",
      secretPath: "/policy-routing-conflict"
    });
    await createGlobalPolicy({
      name: "policy-routing-conflict-other",
      secretPath: "/policy-routing-conflict-other"
    });

    const conflict = await patchPolicy(policy.id, { secretPath: "/policy-routing-conflict-other" });
    expect(conflict.statusCode).toBe(400);
    expect(conflict.json().message).toContain(`already exists in environment '${seedData1.environment.slug}'`);

    const scopeRows = await getDb()(TableName.ApprovalPolicySecretEnvironment).where({ policyId: policy.id });
    expect(scopeRows.map((row) => row.secretPath)).toEqual(["/policy-routing-conflict"]);
  });

  test("Listing and counting policies agree", async () => {
    const globalPolicy = await createGlobalPolicy({
      name: "policy-routing-list-global",
      secretPath: "/policy-routing-list-global"
    });

    const listRes = await listPolicies();
    expect(listRes.statusCode).toBe(200);
    const { approvals }: { approvals: { id: string; approvers: { name?: string }[] }[] } = listRes.json();
    const listedGlobal = approvals.find((policy) => policy.id === globalPolicy.id);
    expect(listedGlobal?.approvers[0]?.name).toBe(seedData1.username);

    const countRes = await countPolicies();
    expect(countRes.statusCode).toBe(200);
    expect(countRes.json().count).toBe(approvals.length);
  });

  test("A policy that only exists in the legacy tables is not served", async () => {
    const legacyPolicy = await createLegacyPolicy({
      name: "policy-routing-legacy",
      secretPath: "/policy-routing-legacy"
    });

    expect((await getPolicy(legacyPolicy.id)).statusCode).toBe(404);
    expect((await patchPolicy(legacyPolicy.id, { name: "policy-routing-legacy-renamed" })).statusCode).toBe(404);
    expect((await deletePolicy(legacyPolicy.id)).statusCode).toBe(404);

    const listRes = await listPolicies();
    expect(listRes.statusCode).toBe(200);
    const { approvals: listed }: { approvals: { id: string }[] } = listRes.json();
    expect(listed.map((policy) => policy.id)).not.toContain(legacyPolicy.id);

    const replacement = await createGlobalPolicy({
      name: "policy-routing-legacy-replacement",
      secretPath: "/policy-routing-legacy"
    });
    expect(replacement.secretPath).toBe("/policy-routing-legacy");
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
    const globalIds = globalPolicyIds.splice(0);
    if (globalIds.length) {
      await getDb()(TableName.ApprovalPolicies).whereIn("id", globalIds).del();
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

  test("A user listed in two steps is returned once per step", async () => {
    const policy = await createGlobalPolicy({
      name: "policy-routing-user-in-two-steps",
      secretPath: "/user-in-two-steps"
    });

    const res = await patchPolicy(policy.id, {
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

    const getRes = await getPolicy(policy.id);
    expect(getRes.statusCode).toBe(200);
    expect(approverViews(getRes.json().approval.approvers)).toEqual(
      approverViews([
        { id: seedData1.id, sequence: 1, approvalsRequired: 2 },
        { id: otherApproverId, sequence: 1, approvalsRequired: 2 },
        { id: otherApproverId, sequence: 2, approvalsRequired: 1 }
      ])
    );
  });

  test("A later step without an approvalsRequired entry needs one approval", async () => {
    const policy = await createGlobalPolicy({
      name: "policy-routing-required",
      secretPath: "/required-later-step"
    });

    const res = await patchPolicy(policy.id, {
      approvers: [
        { type: ApproverType.User, id: seedData1.id, sequence: 1 },
        { type: ApproverType.User, id: otherApproverId, sequence: 2 }
      ],
      approvals: 2,
      approvalsRequired: [{ stepNumber: 1, numberOfApprovals: 1 }]
    });
    expect(res.statusCode).toBe(200);

    expect(await getStepRequirements(policy.id)).toEqual([1, 1]);
  });
});
