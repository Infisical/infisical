import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

const SECRET_ACCESS_TYPE = "secret-access";

const globalPolicyIds: string[] = [];

const authHeaders = () => ({ authorization: `Bearer ${jwtAuthToken}` });

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
      approvals: 1,
      allowedSelfApprovals: true
    }
  });
  expect(res.statusCode).toBe(200);
  const { approval } = res.json();
  globalPolicyIds.push(approval.id);
  return approval as { id: string };
};

const createAccessRequest = (secretPath: string, body: Record<string, unknown> = {}) =>
  testServer.inject({
    method: "POST",
    url: `/api/v1/access-approvals/requests?projectSlug=${seedData1.project.slug}`,
    headers: authHeaders(),
    body: {
      permissions: [
        ["read", "secrets", { environment: seedData1.environment.slug, secretPath: { $glob: secretPath } }]
      ],
      isTemporary: false,
      ...body
    }
  });

const reviewAccessRequest = (requestId: string, body: Record<string, unknown>) =>
  testServer.inject({
    method: "POST",
    url: `/api/v1/access-approvals/requests/${requestId}/review`,
    headers: authHeaders(),
    body
  });

const revokeAccessRequest = (requestId: string) =>
  testServer.inject({
    method: "POST",
    url: `/api/v1/access-approvals/requests/${requestId}/revoke`,
    headers: authHeaders()
  });

const listAccessRequests = () =>
  testServer.inject({
    method: "GET",
    url: `/api/v1/access-approvals/requests?projectSlug=${seedData1.project.slug}`,
    headers: authHeaders()
  });

const countAccessRequests = () =>
  testServer.inject({
    method: "GET",
    url: `/api/v1/access-approvals/requests/count?projectSlug=${seedData1.project.slug}`,
    headers: authHeaders()
  });

const createApprovedTemporaryRequest = async (secretPath: string) => {
  const policy = await createGlobalPolicy({ name: `lifecycle-${secretPath.slice(1)}`, secretPath });

  const createRes = await createAccessRequest(secretPath, { isTemporary: true, temporaryRange: "1h" });
  expect(createRes.statusCode).toBe(200);
  const requestId = createRes.json().approval.id as string;

  const reviewRes = await reviewAccessRequest(requestId, { status: "approved" });
  expect(reviewRes.statusCode).toBe(200);

  return { policy, requestId };
};

describe("Access approval request lifecycle on the global system", () => {
  afterEach(async () => {
    const db = getDb();
    const globalIds = globalPolicyIds.splice(0);

    await db(TableName.AdditionalPrivilege)
      .where({ actorUserId: seedData1.id })
      .whereLike("name", "requested-privilege-%")
      .del();
    await db(TableName.ApprovalRequestGrants)
      .where({ projectId: seedData1.project.id, type: SECRET_ACCESS_TYPE })
      .del();
    if (globalIds.length) {
      await db(TableName.ApprovalRequests).whereIn("policyId", globalIds).del();
      await db(TableName.ApprovalPolicies).whereIn("id", globalIds).del();
    }
  });

  test("Approving a request creates a grant and a privilege that references it", async () => {
    const db = getDb();
    const { policy, requestId } = await createApprovedTemporaryRequest("/lifecycle-approve");

    const approvals = await db(TableName.ApprovalRequestApprovals)
      .join(
        TableName.ApprovalRequestSteps,
        `${TableName.ApprovalRequestApprovals}.stepId`,
        `${TableName.ApprovalRequestSteps}.id`
      )
      .where(`${TableName.ApprovalRequestSteps}.requestId`, requestId)
      .select(`${TableName.ApprovalRequestApprovals}.decision`);
    expect(approvals).toHaveLength(1);
    expect(approvals[0].decision).toBe("approved");

    const request = await db(TableName.ApprovalRequests).where({ id: requestId }).first();
    expect(request?.status).toBe("approved");
    expect(request?.policyId).toBe(policy.id);

    const grant = await db(TableName.ApprovalRequestGrants).where({ requestId }).first();
    expect(grant?.status).toBe("active");
    expect(grant?.type).toBe(SECRET_ACCESS_TYPE);
    expect(grant?.granteeUserId).toBe(seedData1.id);
    expect(grant?.expiresAt).toBeTruthy();

    const privilege = await db(TableName.AdditionalPrivilege).where({ grantId: grant?.id }).first();
    expect(privilege).toBeDefined();
    expect(privilege?.actorUserId).toBe(seedData1.id);
    expect(privilege?.projectId).toBe(seedData1.project.id);
    expect(privilege?.isTemporary).toBe(true);
    expect(privilege?.temporaryRange).toBe("1h");

    const legacyRows = await db(TableName.AccessApprovalRequest).where({ id: requestId });
    expect(legacyRows).toHaveLength(0);
  });

  test("Revoking an approved request revokes the grant and deletes the privilege", async () => {
    const db = getDb();
    const { requestId } = await createApprovedTemporaryRequest("/lifecycle-revoke");

    const grantBefore = await db(TableName.ApprovalRequestGrants).where({ requestId }).first();
    expect(grantBefore?.status).toBe("active");
    const privilegeBefore = await db(TableName.AdditionalPrivilege).where({ grantId: grantBefore?.id }).first();
    expect(privilegeBefore).toBeDefined();

    const revokeRes = await revokeAccessRequest(requestId);
    expect(revokeRes.statusCode).toBe(200);
    const { request } = revokeRes.json();
    expect(request.id).toBe(requestId);
    expect(request.status).toBe("revoked");
    expect(request.revokedByUserId).toBe(seedData1.id);
    expect(request.revokedAt).toBeTruthy();
    expect(request.privilegeId).toBeNull();

    const grantAfter = await db(TableName.ApprovalRequestGrants).where({ id: grantBefore?.id }).first();
    expect(grantAfter?.status).toBe("revoked");
    expect(grantAfter?.revokedAt).toBeTruthy();
    expect(grantAfter?.revokedByUserId).toBe(seedData1.id);

    const privilegeAfter = await db(TableName.AdditionalPrivilege).where({ id: privilegeBefore?.id }).first();
    expect(privilegeAfter).toBeUndefined();

    const secondRevoke = await revokeAccessRequest(requestId);
    expect(secondRevoke.statusCode).toBe(400);
    expect(secondRevoke.json().message).toBe("Only approved requests can be revoked");
  });

  test("Rejecting a request creates no grant and no privilege", async () => {
    const db = getDb();
    const secretPath = "/lifecycle-reject";
    await createGlobalPolicy({ name: "lifecycle-reject", secretPath });

    const createRes = await createAccessRequest(secretPath);
    expect(createRes.statusCode).toBe(200);
    const requestId = createRes.json().approval.id as string;

    const reviewRes = await reviewAccessRequest(requestId, { status: "rejected" });
    expect(reviewRes.statusCode).toBe(200);
    expect(reviewRes.json().review.status).toBe("rejected");

    const request = await db(TableName.ApprovalRequests).where({ id: requestId }).first();
    expect(request?.status).toBe("rejected");

    const grants = await db(TableName.ApprovalRequestGrants).where({ requestId });
    expect(grants).toHaveLength(0);

    const privileges = await db(TableName.AdditionalPrivilege)
      .where({ actorUserId: seedData1.id })
      .whereLike("name", "requested-privilege-%");
    expect(privileges).toHaveLength(0);
  });

  test("Global requests are served by the list and count endpoints", async () => {
    const { policy, requestId: approvedId } = await createApprovedTemporaryRequest("/lifecycle-list");

    const pendingPath = "/lifecycle-list-pending";
    await createGlobalPolicy({ name: "lifecycle-list-pending", secretPath: pendingPath });
    const pendingRes = await createAccessRequest(pendingPath);
    expect(pendingRes.statusCode).toBe(200);
    const pendingId = pendingRes.json().approval.id as string;

    const listRes = await listAccessRequests();
    expect(listRes.statusCode).toBe(200);
    const { requests } = listRes.json();

    const approved = requests.find((request: { id: string }) => request.id === approvedId);
    expect(approved).toBeDefined();
    expect(approved.policyId).toBe(policy.id);
    expect(approved.policy.id).toBe(policy.id);
    expect(approved.policy.secretPath).toBe("/lifecycle-list");
    expect(approved.environmentName).toBe(seedData1.environment.slug);
    expect(approved.isApproved).toBe(true);
    expect(approved.isTemporary).toBe(true);
    expect(approved.privilege).not.toBeNull();
    expect(approved.privilege.isTemporary).toBe(true);
    expect(approved.reviewers).toEqual([expect.objectContaining({ userId: seedData1.id, status: "approved" })]);
    expect(approved.policy.approvers).toEqual([expect.objectContaining({ userId: seedData1.id, sequence: 1 })]);
    expect(approved.requestedByUser.userId).toBe(seedData1.id);
    expect(approved.approvedByUser.userId).toBe(seedData1.id);

    const pending = requests.find((request: { id: string }) => request.id === pendingId);
    expect(pending).toBeDefined();
    expect(pending.status).toBe("pending");
    expect(pending.isApproved).toBe(false);
    expect(pending.privilege).toBeNull();
    expect(pending.reviewers).toEqual([]);

    const countRes = await countAccessRequests();
    expect(countRes.statusCode).toBe(200);
    expect(countRes.json().pendingCount).toBeGreaterThanOrEqual(1);
    expect(countRes.json().finalizedCount).toBeGreaterThanOrEqual(1);

    const revokeRes = await revokeAccessRequest(approvedId);
    expect(revokeRes.statusCode).toBe(200);

    const afterRevoke = (await listAccessRequests())
      .json()
      .requests.find((request: { id: string }) => request.id === approvedId);
    expect(afterRevoke.status).toBe("revoked");
    expect(afterRevoke.privilege).toBeNull();
    expect(afterRevoke.revokedByUser.userId).toBe(seedData1.id);
  });

  test("A duplicate pending request, an edit, and a bypass are rejected", async () => {
    const secretPath = "/lifecycle-guards";
    await createGlobalPolicy({ name: "lifecycle-guards", secretPath });

    const createRes = await createAccessRequest(secretPath);
    expect(createRes.statusCode).toBe(200);
    const requestId = createRes.json().approval.id as string;

    const duplicateRes = await createAccessRequest(secretPath);
    expect(duplicateRes.statusCode).toBe(400);
    expect(duplicateRes.json().message).toBe("You already have a pending access request with the same criteria");

    const patchRes = await testServer.inject({
      method: "PATCH",
      url: `/api/v1/access-approvals/requests/${requestId}`,
      headers: authHeaders(),
      body: { temporaryRange: "30m", editNote: "shorter" }
    });
    expect(patchRes.statusCode).toBe(400);
    expect(patchRes.json().message).toBe("Access requests on the global approval system cannot be edited");

    const bypassRes = await reviewAccessRequest(requestId, { status: "approved", bypassReason: "need it right now" });
    expect(bypassRes.statusCode).toBe(400);
    expect(bypassRes.json().message).toBe("Break-glass approvals are not supported for this request yet");
  });
});
