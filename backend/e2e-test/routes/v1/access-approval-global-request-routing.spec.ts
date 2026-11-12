import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { EnforcementLevel } from "@app/lib/types";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

const SECRET_ACCESS_TYPE = "secret-access";

// Every policy this file creates lives in the seeded project and environment, so it is
// removed after each test to keep later specs unaffected.
const legacyPolicyIds: string[] = [];
const globalPolicyIds: string[] = [];

// Policies the migration left behind only exist in the legacy tables, so they are seeded there directly.
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

const reviewAccessRequest = (requestId: string, status: "approved" | "rejected") =>
  testServer.inject({
    method: "POST",
    url: `/api/v1/access-approvals/requests/${requestId}/review`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: { status }
  });

const revokeAccessRequest = (requestId: string) =>
  testServer.inject({
    method: "POST",
    url: `/api/v1/access-approvals/requests/${requestId}/revoke`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    }
  });

describe("Access approval request routing", () => {
  afterEach(async () => {
    const db = getDb();
    const legacyIds = legacyPolicyIds.splice(0);
    const globalIds = globalPolicyIds.splice(0);

    // Privileges are reaped first because both grant and request FKs are SET NULL,
    // so the rows would otherwise be orphaned rather than cascaded.
    await db(TableName.AdditionalPrivilege)
      .where({ actorUserId: seedData1.id })
      .whereLike("name", "requested-privilege-%")
      .del();
    if (legacyIds.length) {
      await db(TableName.AccessApprovalRequest).whereIn("policyId", legacyIds).del();
      await db(TableName.AccessApprovalPolicyApprover).whereIn("policyId", legacyIds).del();
      await db(TableName.AccessApprovalPolicyEnvironment).whereIn("policyId", legacyIds).del();
      await db(TableName.AccessApprovalPolicy).whereIn("id", legacyIds).del();
    }
    if (globalIds.length) {
      await db(TableName.ApprovalRequestGrants)
        .where({ projectId: seedData1.project.id, type: SECRET_ACCESS_TYPE })
        .del();
      await db(TableName.ApprovalRequests).whereIn("policyId", globalIds).del();
      await db(TableName.ApprovalPolicies).whereIn("id", globalIds).del();
    }
  });

  test("A request against a global policy is created on the global tables", async () => {
    const db = getDb();
    const secretPath = "/routing-global";
    const created = await createGlobalPolicy({ name: "routing-global", secretPath });
    expect(created.statusCode).toBe(200);
    const policyId: string = created.json().approval.id;

    const res = await createAccessRequest(secretPath);

    expect(res.statusCode).toBe(200);
    const { approval } = res.json();
    expect(approval.policyId).toBe(policyId);

    const rows = await db(TableName.ApprovalRequests).where({ id: approval.id });
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe(SECRET_ACCESS_TYPE);
    expect(await db(TableName.AccessApprovalRequest).where({ id: approval.id })).toHaveLength(0);
  });

  test("A request against a path only a legacy policy covers is refused", async () => {
    const db = getDb();
    const secretPath = "/routing-legacy";
    const legacyPolicy = await createLegacyPolicy({ name: "routing-legacy", secretPath });

    const res = await createAccessRequest(secretPath);

    expect(res.statusCode).toBe(404);
    expect(res.json().message).toContain("No policy in environment");
    expect(await db(TableName.AccessApprovalRequest).where({ policyId: legacyPolicy.id })).toHaveLength(0);
  });

  test("A request that only exists in the legacy tables cannot be reviewed or revoked", async () => {
    const db = getDb();
    const legacyPolicy = await createLegacyPolicy({
      name: "routing-legacy-request",
      secretPath: "/routing-legacy-request"
    });
    const [legacyRequest] = await db(TableName.AccessApprovalRequest)
      .insert({
        policyId: legacyPolicy.id,
        requestedByUserId: seedData1.id,
        isTemporary: false,
        permissions: JSON.stringify([]),
        status: "pending"
      })
      .returning("*");

    const reviewRes = await reviewAccessRequest(legacyRequest.id, "approved");
    expect(reviewRes.statusCode).toBe(404);

    const revokeRes = await revokeAccessRequest(legacyRequest.id);
    expect(revokeRes.statusCode).toBe(404);

    const unchanged = await db(TableName.AccessApprovalRequest).where({ id: legacyRequest.id }).first();
    expect(unchanged?.status).toBe("pending");
  });
});
