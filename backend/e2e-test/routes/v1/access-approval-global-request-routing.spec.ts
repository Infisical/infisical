import { createFakeWebhookServer } from "e2e-test/fakes/webhook-destination";
import { createWebhook } from "e2e-test/testUtils/webhooks";
import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { EnforcementLevel } from "@app/lib/types";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

const SECRET_ACCESS_TYPE = "secret-access";

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

    expect(res.statusCode).toBe(200);
    const { approval } = res.json();
    expect(approval.policyId).toBe(globalPolicyRow?.id);
    expect(approval.status).toBe("pending");

    const globalRequest = await db(TableName.ApprovalRequests).where({ id: approval.id }).first();
    expect(globalRequest?.type).toBe(SECRET_ACCESS_TYPE);
    expect(globalRequest?.policyId).toBe(globalPolicyRow?.id);
    expect(globalRequest?.requesterId).toBe(seedData1.id);

    const steps = await db(TableName.ApprovalRequestSteps).where({ requestId: approval.id });
    expect(steps).toHaveLength(1);

    const legacyRows = await db(TableName.AccessApprovalRequest)
      .whereRaw(`"permissions"::text like ?`, [`%${secretPath}%`])
      .select("id");
    expect(legacyRows).toHaveLength(0);
  });

  test("Review and revoke of a legacy request keep running on the legacy system", async () => {
    const db = getDb();
    const secretPath = "/routing-legacy-lifecycle";
    const legacyPolicy = await createLegacyPolicy({ name: "routing-legacy-lifecycle", secretPath });

    const createRes = await createAccessRequest(secretPath);
    expect(createRes.statusCode).toBe(200);
    const requestId = createRes.json().approval.id as string;

    const reviewRes = await reviewAccessRequest(requestId, "approved");
    expect(reviewRes.statusCode).toBe(200);
    expect(reviewRes.json().review.requestId).toBe(requestId);

    const reviewers = await db(TableName.AccessApprovalRequestReviewer).where({ requestId });
    expect(reviewers).toHaveLength(1);

    const approved = await db(TableName.AccessApprovalRequest).where({ id: requestId }).first();
    expect(approved?.status).toBe("approved");
    expect(approved?.policyId).toBe(legacyPolicy.id);
    const privilegeId = approved?.privilegeId as string;
    expect(privilegeId).toBeTruthy();

    const privilege = await db(TableName.AdditionalPrivilege).where({ id: privilegeId }).first();
    expect(privilege?.grantId).toBeNull();

    const revokeRes = await revokeAccessRequest(requestId);
    expect(revokeRes.statusCode).toBe(200);
    expect(revokeRes.json().request.status).toBe("revoked");

    const deletedPrivilege = await db(TableName.AdditionalPrivilege).where({ id: privilegeId }).first();
    expect(deletedPrivilege).toBeUndefined();

    const globalRequests = await db(TableName.ApprovalRequests).where({ id: requestId });
    expect(globalRequests).toHaveLength(0);
    const grants = await db(TableName.ApprovalRequestGrants).where({ requestId });
    expect(grants).toHaveLength(0);
  });

  test("Creating a request on the global system sends the access request webhook", async () => {
    const secretPath = "/routing-global-webhook";
    const fakeWebhookServer = await createFakeWebhookServer();
    const webhook = await createWebhook({
      projectId: seedData1.project.id,
      environmentSlug: seedData1.environment.slug,
      webhookUrl: fakeWebhookServer.url,
      authToken: jwtAuthToken
    });

    try {
      const createRes = await createGlobalPolicy({ name: "routing-global-webhook", secretPath });
      expect(createRes.statusCode).toBe(200);
      const policyId = createRes.json().approval.id as string;

      const res = await createAccessRequest(secretPath);
      expect(res.statusCode).toBe(200);
      const { approval } = res.json();

      const message = await fakeWebhookServer.waitForMessage(
        (m) => (m.body as { request?: { id?: string } })?.request?.id === approval.id,
        10_000
      );
      expect(message.body).toMatchObject({
        event: "secrets.access-request.modified",
        action: "created",
        project: { id: seedData1.project.id },
        request: {
          id: approval.id,
          status: "pending",
          isBypassed: false,
          policy: { id: policyId, name: "routing-global-webhook", hasSequencedApprovers: false },
          requestedAccess: {
            target: { environment: { slug: seedData1.environment.slug }, secretPath },
            isTemporary: false,
            permissions: [{ subject: "secrets", actions: ["read"] }]
          },
          requestedBy: { type: "user", id: seedData1.id },
          approvedAt: null,
          revokedAt: null
        }
      });
    } finally {
      await getDb()(TableName.Webhook).where({ id: webhook.id }).del();
      await fakeWebhookServer.stop();
    }
  }, 30_000);

  test("A request with no policy on either system is rejected", async () => {
    const res = await createAccessRequest("/routing-none");

    expect(res.statusCode).toBe(404);
    expect(res.json().message).toContain("No policy in environment");
  });
});
