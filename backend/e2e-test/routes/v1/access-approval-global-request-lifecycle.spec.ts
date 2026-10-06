import jwt from "jsonwebtoken";
import { Knex } from "knex";

import { AccessScope, OrgMembershipRole, OrgMembershipStatus, ProjectMembershipRole, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { getConfig, initEnvConfig } from "@app/lib/config/env";
import { initLogger, logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

const SECRET_ACCESS_TYPE = "secret-access";

const globalPolicyIds: string[] = [];
const policylessRequestIds: string[] = [];

const authHeaders = () => ({ authorization: `Bearer ${jwtAuthToken}` });

const createGlobalPolicy = async (dto: { name: string; secretPath: string }, body: Record<string, unknown> = {}) => {
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
      allowedSelfApprovals: true,
      ...body
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

const deletePolicy = (policyId: string) =>
  testServer.inject({
    method: "DELETE",
    url: `/api/v1/access-approvals/policies/${policyId}`,
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
    const requestIds = policylessRequestIds.splice(0);
    if (requestIds.length) {
      await db(TableName.ApprovalRequests).whereIn("id", requestIds).del();
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

  test("A privilege granted through an approval request cannot be edited", async () => {
    const db = getDb();
    const { requestId } = await createApprovedTemporaryRequest("/lifecycle-edit-guard");

    const grant = await db(TableName.ApprovalRequestGrants).where({ requestId }).first();
    const privilege = await db(TableName.AdditionalPrivilege).where({ grantId: grant?.id }).first();
    expect(privilege).toBeDefined();

    const res = await testServer.inject({
      method: "PATCH",
      url: `/api/v1/user-project-additional-privilege/${privilege?.id}`,
      headers: authHeaders(),
      body: { isTemporary: false }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe("Cannot update a privilege that was granted through an access approval request");

    const privilegeAfter = await db(TableName.AdditionalPrivilege).where({ id: privilege?.id }).first();
    expect(privilegeAfter?.isTemporary).toBe(true);
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

  test("Deleting a policy keeps its requests listed and the count in step", async () => {
    const { policy, requestId: approvedId } = await createApprovedTemporaryRequest("/lifecycle-deleted-policy");
    const pendingRes = await createAccessRequest("/lifecycle-deleted-policy", { isTemporary: false });
    expect(pendingRes.statusCode).toBe(200);
    const pendingId = pendingRes.json().approval.id as string;
    policylessRequestIds.push(approvedId, pendingId);

    const countBefore = (await countAccessRequests()).json();

    expect((await deletePolicy(policy.id)).statusCode).toBe(200);

    const listRes = await listAccessRequests();
    expect(listRes.statusCode).toBe(200);
    const { requests } = listRes.json();

    const approved = requests.find((request: { id: string }) => request.id === approvedId);
    expect(approved).toBeDefined();
    expect(approved.policyId).toBeNull();
    expect(approved.policy.id).toBeNull();
    expect(approved.policy.deletedAt).toBeTruthy();
    expect(approved.policy.secretPath).toBe("/lifecycle-deleted-policy");
    expect(approved.environment).toBe(seedData1.environment.slug);
    expect(approved.status).toBe("revoked");
    expect(approved.privilege).toBeNull();

    const pending = requests.find((request: { id: string }) => request.id === pendingId);
    expect(pending).toBeDefined();
    expect(pending.policyId).toBeNull();
    expect(pending.policy.deletedAt).toBeTruthy();
    expect(pending.status).toBe("pending");

    const countAfter = (await countAccessRequests()).json();
    expect(countAfter.pendingCount).toBe(countBefore.pendingCount - 1);
    expect(countAfter.finalizedCount).toBe(countBefore.finalizedCount + 1);

    const reviewRes = await reviewAccessRequest(pendingId, { status: "approved" });
    expect(reviewRes.statusCode).toBe(400);
    expect(reviewRes.json().message).toBe("The policy associated with this access request has been deleted.");
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
    expect(bypassRes.statusCode).toBe(403);
    expect(bypassRes.json().message).toBe("You are not permitted to bypass approval on this request");
  });

  test("A policy's max time period caps the requested range and survives an update that omits it", async () => {
    const db = getDb();
    const secretPath = "/lifecycle-max-time";
    const policy = await createGlobalPolicy({ name: "lifecycle-max-time", secretPath }, { maxTimePeriod: "1h" });

    const storedPolicy = await db(TableName.ApprovalPolicies).where({ id: policy.id }).first();
    expect(storedPolicy?.maxRequestTtl).toBeNull();
    expect(storedPolicy?.constraints).toEqual(
      expect.objectContaining({ constraints: expect.objectContaining({ maxTimePeriod: "1h" }) })
    );

    const tooLongRes = await createAccessRequest(secretPath, { isTemporary: true, temporaryRange: "2h" });
    expect(tooLongRes.statusCode).toBe(400);
    expect(tooLongRes.json().message).toBe("Requested access time range is limited to 1h by policy");

    const permanentRes = await createAccessRequest(secretPath);
    expect(permanentRes.statusCode).toBe(400);
    expect(permanentRes.json().message).toBe("Requested access time range is limited to 1h by policy");

    const updateRes = await testServer.inject({
      method: "PATCH",
      url: `/api/v1/access-approvals/policies/${policy.id}`,
      headers: authHeaders(),
      body: { name: "lifecycle-max-time-renamed", approvers: [{ type: ApproverType.User, id: seedData1.id }] }
    });
    expect(updateRes.statusCode).toBe(200);

    const getRes = await testServer.inject({
      method: "GET",
      url: `/api/v1/access-approvals/policies/${policy.id}`,
      headers: authHeaders()
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().approval.maxTimePeriod).toBe("1h");

    const withinRes = await createAccessRequest(secretPath, { isTemporary: true, temporaryRange: "30m" });
    expect(withinRes.statusCode).toBe(200);
  });

  test("Asking again for access the user already holds is rejected", async () => {
    const secretPath = "/lifecycle-active-grant";
    await createApprovedTemporaryRequest(secretPath);

    const repeatRes = await createAccessRequest(secretPath, { isTemporary: true, temporaryRange: "1h" });
    expect(repeatRes.statusCode).toBe(400);
    expect(repeatRes.json().message).toBe("You already have an active privilege with the same criteria");
  });

  test("A request with a range is granted temporary access even when isTemporary is false", async () => {
    const db = getDb();
    const secretPath = "/lifecycle-range-without-flag";
    await createGlobalPolicy({ name: "lifecycle-range-without-flag", secretPath });

    const createRes = await createAccessRequest(secretPath, { isTemporary: false, temporaryRange: "1h" });
    expect(createRes.statusCode).toBe(200);
    const requestId = createRes.json().approval.id as string;

    const reviewRes = await reviewAccessRequest(requestId, { status: "approved" });
    expect(reviewRes.statusCode).toBe(200);

    const grant = await db(TableName.ApprovalRequestGrants).where({ requestId }).first();
    expect(grant?.expiresAt).toBeTruthy();

    const privilege = await db(TableName.AdditionalPrivilege).where({ grantId: grant?.id }).first();
    expect(privilege?.isTemporary).toBe(true);
    expect(privilege?.temporaryRange).toBe("1h");
    expect(privilege?.temporaryAccessEndTime).toBeTruthy();
  });

  test("A temporary request without a range is rejected and saves nothing", async () => {
    const db = getDb();
    const secretPath = "/lifecycle-missing-range";
    const policy = await createGlobalPolicy({ name: "lifecycle-missing-range", secretPath });

    const createRes = await createAccessRequest(secretPath, { isTemporary: true });
    expect(createRes.statusCode).toBe(400);
    expect(createRes.json().message).toBe("A temporary range is required for temporary requests");

    const requests = await db(TableName.ApprovalRequests).where({ policyId: policy.id });
    expect(requests).toHaveLength(0);
  });

  test("An expired request cannot be approved or rejected and is marked expired", async () => {
    const db = getDb();
    const secretPath = "/lifecycle-expired";
    await createGlobalPolicy({ name: "lifecycle-expired", secretPath }, { requestExpirationTime: "1h" });

    const createRes = await createAccessRequest(secretPath);
    expect(createRes.statusCode).toBe(200);
    const requestId = createRes.json().approval.id as string;
    const created = await db(TableName.ApprovalRequests).where({ id: requestId }).first();
    expect(created?.expiresAt).toBeTruthy();

    await db(TableName.ApprovalRequests)
      .where({ id: requestId })
      .update({ expiresAt: new Date(Date.now() - 60_000) });

    const approveRes = await reviewAccessRequest(requestId, { status: "approved" });
    expect(approveRes.statusCode).toBe(400);
    expect(approveRes.json().message).toBe("This access request has expired and can no longer be reviewed");

    const request = await db(TableName.ApprovalRequests).where({ id: requestId }).first();
    expect(request?.status).toBe("expired");
    const grants = await db(TableName.ApprovalRequestGrants).where({ requestId });
    expect(grants).toHaveLength(0);

    const rejectRes = await reviewAccessRequest(requestId, { status: "rejected" });
    expect(rejectRes.statusCode).toBe(400);
    expect(rejectRes.json().message).toBe("The request has been closed");
  });

  const openPendingRequest = async (secretPath: string) => {
    const policy = await createGlobalPolicy({ name: `scope-${secretPath.replace(/[/*]/g, "")}`, secretPath });
    const createRes = await createAccessRequest(secretPath);
    expect(createRes.statusCode).toBe(200);
    return { policy, requestId: createRes.json().approval.id as string };
  };

  test("Approval is refused when the policy path no longer contains the requested glob", async () => {
    const secretPath = "/scope-mismatch/*";
    const { policy, requestId } = await openPendingRequest(secretPath);

    await getDb()(TableName.ApprovalPolicySecretEnvironment)
      .where({ policyId: policy.id })
      .update({ secretPath: "/other" });

    const approveRes = await reviewAccessRequest(requestId, { status: "approved" });
    expect(approveRes.statusCode).toBe(400);
    expect(approveRes.json().message).toBe(`The policy no longer covers secret path '${secretPath}'.`);

    const request = await getDb()(TableName.ApprovalRequests).where({ id: requestId }).first();
    expect(request?.status).toBe("pending");
  });

  test("Approval stands when a broader policy path still contains the requested glob", async () => {
    const secretPath = "/scope-broader/*";
    const { policy, requestId } = await openPendingRequest(secretPath);

    await getDb()(TableName.ApprovalPolicySecretEnvironment)
      .where({ policyId: policy.id })
      .update({ secretPath: "/scope-broader/**" });

    const approveRes = await reviewAccessRequest(requestId, { status: "approved" });
    expect(approveRes.statusCode).toBe(200);

    const request = await getDb()(TableName.ApprovalRequests).where({ id: requestId }).first();
    expect(request?.status).toBe("approved");
  });

  test("Approval is refused when the policy no longer includes the requested environment", async () => {
    const { policy, requestId } = await openPendingRequest("/scope-env");
    const otherEnv = await getDb()(TableName.Environment)
      .where({ projectId: seedData1.project.id })
      .whereNot({ slug: seedData1.environment.slug })
      .first();
    expect(otherEnv).toBeDefined();

    await getDb()(TableName.ApprovalPolicySecretEnvironment)
      .where({ policyId: policy.id })
      .update({ envId: otherEnv!.id });

    const approveRes = await reviewAccessRequest(requestId, { status: "approved" });
    expect(approveRes.statusCode).toBe(400);
    expect(approveRes.json().message).toBe(
      `The policy is no longer attached to environment '${seedData1.environment.slug}'.`
    );
  });

  test("A request whose policy path no longer matches can still be rejected", async () => {
    const { policy, requestId } = await openPendingRequest("/scope-reject/*");

    await getDb()(TableName.ApprovalPolicySecretEnvironment)
      .where({ policyId: policy.id })
      .update({ secretPath: "/other" });

    const rejectRes = await reviewAccessRequest(requestId, { status: "rejected" });
    expect(rejectRes.statusCode).toBe(200);
    expect(rejectRes.json().review.status).toBe("rejected");

    const request = await getDb()(TableName.ApprovalRequests).where({ id: requestId }).first();
    expect(request?.status).toBe("rejected");
    const grants = await getDb()(TableName.ApprovalRequestGrants).where({ requestId });
    expect(grants).toHaveLength(0);
  });
});

type TApprover = { userId: string; token: string };

const createApproverUser = async (): Promise<TApprover> => {
  const db = getDb();
  const username = `access-approver-${alphaNumericNanoId(8)}@example.com`.toLowerCase();
  const [user] = await db(TableName.Users)
    .insert({ username, email: username, isGhost: false, isAccepted: true, authMethods: [AuthMethod.EMAIL] })
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
  await db(TableName.MembershipRole).insert({
    membershipId: projectMembership.id,
    role: ProjectMembershipRole.Member
  });

  const [session] = await db(TableName.AuthTokenSession)
    .insert({
      userId: user.id,
      ip: "127.0.0.1",
      userAgent: "e2e-access-approval-required-approvals",
      accessVersion: 1,
      refreshVersion: 1,
      lastUsed: new Date()
    } as never)
    .returning("*");

  return {
    userId: user.id,
    token: jwt.sign(
      {
        authTokenType: AuthTokenType.ACCESS_TOKEN,
        userId: user.id,
        tokenVersionId: session.id,
        authMethod: AuthMethod.EMAIL,
        organizationId: seedData1.organization.id,
        accessVersion: 1
      },
      getConfig().AUTH_SECRET,
      { expiresIn: 3600 }
    )
  };
};

const reviewAs = (approver: TApprover, requestId: string) =>
  testServer.inject({
    method: "POST",
    url: `/api/v1/access-approvals/requests/${requestId}/review`,
    headers: { authorization: `Bearer ${approver.token}` },
    body: { status: "approved" }
  });

const createPolicyWithApprovers = async (body: {
  secretPath: string;
  approvers: { type: ApproverType; id: string; sequence?: number }[];
  approvals: number;
  approvalsRequired?: { stepNumber: number; numberOfApprovals: number }[];
}) => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v1/access-approvals/policies",
    headers: authHeaders(),
    body: {
      projectSlug: seedData1.project.slug,
      environment: seedData1.environment.slug,
      name: `required-${body.secretPath.slice(1)}`,
      allowedSelfApprovals: false,
      ...body
    }
  });
  expect(res.statusCode).toBe(200);
  const { approval } = res.json();
  globalPolicyIds.push(approval.id);
  return approval as { id: string };
};

const getPolicySteps = (policyId: string) =>
  getDb()(TableName.ApprovalPolicySteps).where({ policyId }).orderBy("stepNumber", "asc");

const getRequestState = async (requestId: string) => {
  const db = getDb();
  const request = await db(TableName.ApprovalRequests).where({ id: requestId }).first();
  const grant = await db(TableName.ApprovalRequestGrants).where({ requestId }).first();
  const privilege = grant ? await db(TableName.AdditionalPrivilege).where({ grantId: grant.id }).first() : undefined;
  return { status: request?.status, currentStep: request?.currentStep, grant, privilege };
};

const openRequest = async (secretPath: string) => {
  const res = await createAccessRequest(secretPath);
  expect(res.statusCode).toBe(200);
  return res.json().approval.id as string;
};

const patchPolicy = (policyId: string, body: Record<string, unknown>) =>
  testServer.inject({
    method: "PATCH",
    url: `/api/v1/access-approvals/policies/${policyId}`,
    headers: authHeaders(),
    body: { approvals: 1, allowedSelfApprovals: false, ...body }
  });

const getRequestSteps = async (requestId: string) => {
  const db = getDb();
  const steps = await db(TableName.ApprovalRequestSteps).where({ requestId }).orderBy("stepNumber", "asc");
  return Promise.all(
    steps.map(async (step) => {
      const eligible = await db(TableName.ApprovalRequestStepEligibleApprovers).where({ stepId: step.id });
      const approvals = await db(TableName.ApprovalRequestApprovals).where({ stepId: step.id });
      return {
        id: step.id,
        status: step.status,
        approverUserIds: eligible.map((row) => row.userId).sort(),
        approvalCount: approvals.length
      };
    })
  );
};

describe("Per-step required approvals on the global system", () => {
  const approvers: TApprover[] = [];
  const groupIds: string[] = [];
  let a: TApprover;
  let b: TApprover;
  let c: TApprover;

  beforeAll(async () => {
    initLogger();
    await initEnvConfig(testHsmService, testKmsRootConfigDAL, testSuperAdminDAL, logger);
    a = await createApproverUser();
    b = await createApproverUser();
    c = await createApproverUser();
    approvers.push(a, b, c);
  });

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

  afterAll(async () => {
    const db = getDb();
    const userIds = approvers.map((approver) => approver.userId);
    await db(TableName.UserGroupMembership).whereIn("userId", userIds).del();
    if (groupIds.length) {
      await db(TableName.Membership).whereIn("actorGroupId", groupIds).del();
      await db(TableName.Groups).whereIn("id", groupIds).del();
    }
    await db(TableName.AuthTokenSession).whereIn("userId", userIds).del();
    await db(TableName.Membership).whereIn("actorUserId", userIds).del();
    await db(TableName.Users).whereIn("id", userIds).del();
  });

  test("Two of three approvers complete a step that needs two approvals", async () => {
    const secretPath = "/required-two-of-three";
    const policy = await createPolicyWithApprovers({
      secretPath,
      approvers: [a, b, c].map((approver) => ({ type: ApproverType.User, id: approver.userId })),
      approvals: 1,
      approvalsRequired: [{ stepNumber: 1, numberOfApprovals: 2 }]
    });

    const steps = await getPolicySteps(policy.id);
    expect(steps.map((step) => step.requiredApprovals)).toEqual([2]);

    const requestId = await openRequest(secretPath);

    expect((await reviewAs(a, requestId)).statusCode).toBe(200);
    const afterFirst = await getRequestState(requestId);
    expect(afterFirst.status).toBe("pending");
    expect(afterFirst.grant).toBeUndefined();

    expect((await reviewAs(b, requestId)).statusCode).toBe(200);
    const afterSecond = await getRequestState(requestId);
    expect(afterSecond.status).toBe("approved");
    expect(afterSecond.grant?.status).toBe("active");
    expect(afterSecond.privilege?.actorUserId).toBe(seedData1.id);

    const lateReview = await reviewAs(c, requestId);
    expect(lateReview.statusCode).toBe(400);
    expect(lateReview.json().message).toBe("The request has been closed");
  });

  test("With two approvers and one required approval, the first approval approves the request", async () => {
    const secretPath = "/required-one-of-two";
    const policy = await createPolicyWithApprovers({
      secretPath,
      approvers: [a, b].map((approver) => ({ type: ApproverType.User, id: approver.userId })),
      approvals: 1,
      approvalsRequired: [{ stepNumber: 1, numberOfApprovals: 1 }]
    });

    const steps = await getPolicySteps(policy.id);
    expect(steps.map((step) => step.requiredApprovals)).toEqual([1]);

    const requestId = await openRequest(secretPath);

    expect((await reviewAs(b, requestId)).statusCode).toBe(200);
    const state = await getRequestState(requestId);
    expect(state.status).toBe("approved");
    expect(state.grant?.status).toBe("active");
    expect(state.privilege?.actorUserId).toBe(seedData1.id);

    const secondReview = await reviewAs(a, requestId);
    expect(secondReview.statusCode).toBe(400);
    expect(secondReview.json().message).toBe("The request has been closed");
  });

  test("A first step with no approvalsRequired entry needs the policy's approvals", async () => {
    const secretPath = "/required-from-approvals";
    const policy = await createPolicyWithApprovers({
      secretPath,
      approvers: [
        { type: ApproverType.User, id: a.userId },
        { type: ApproverType.User, id: b.userId }
      ],
      approvals: 2
    });

    const steps = await getPolicySteps(policy.id);
    expect(steps.map((step) => step.requiredApprovals)).toEqual([2]);

    const requestId = await openRequest(secretPath);
    expect((await reviewAs(a, requestId)).statusCode).toBe(200);
    expect((await getRequestState(requestId)).status).toBe("pending");

    expect((await reviewAs(b, requestId)).statusCode).toBe(200);
    const state = await getRequestState(requestId);
    expect(state.status).toBe("approved");
    expect(state.privilege).toBeDefined();
  });

  test("The second step starts only after the first and needs its own two approvals", async () => {
    const secretPath = "/required-two-steps";
    const policy = await createPolicyWithApprovers({
      secretPath,
      approvers: [
        { type: ApproverType.User, id: a.userId, sequence: 1 },
        { type: ApproverType.User, id: b.userId, sequence: 2 },
        { type: ApproverType.User, id: c.userId, sequence: 2 }
      ],
      approvals: 1,
      approvalsRequired: [
        { stepNumber: 1, numberOfApprovals: 1 },
        { stepNumber: 2, numberOfApprovals: 2 }
      ]
    });

    const steps = await getPolicySteps(policy.id);
    expect(steps.map((step) => step.requiredApprovals)).toEqual([1, 2]);

    const requestId = await openRequest(secretPath);

    const early = await reviewAs(b, requestId);
    expect(early.statusCode).toBe(400);
    expect(early.json().message).toBe("You are not a reviewer in this step");

    expect((await reviewAs(a, requestId)).statusCode).toBe(200);
    const afterStepOne = await getRequestState(requestId);
    expect(afterStepOne.status).toBe("pending");
    expect(afterStepOne.currentStep).toBe(2);

    expect((await reviewAs(b, requestId)).statusCode).toBe(200);
    const afterOneOfTwo = await getRequestState(requestId);
    expect(afterOneOfTwo.status).toBe("pending");
    expect(afterOneOfTwo.grant).toBeUndefined();

    expect((await reviewAs(c, requestId)).statusCode).toBe(200);
    const approved = await getRequestState(requestId);
    expect(approved.status).toBe("approved");
    expect(approved.privilege).toBeDefined();
  });

  test("Each approving group member counts as one approval", async () => {
    const db = getDb();
    const secretPath = "/required-group";
    const slug = `required-group-${alphaNumericNanoId(6).toLowerCase()}`;
    const [group] = await db(TableName.Groups)
      .insert({ orgId: seedData1.organization.id, name: slug, slug })
      .returning("*");
    groupIds.push(group.id);
    await db(TableName.UserGroupMembership).insert([
      { userId: a.userId, groupId: group.id, isPending: false },
      { userId: b.userId, groupId: group.id, isPending: false }
    ]);
    const [groupOrgMembership, groupProjectMembership] = await db(TableName.Membership)
      .insert([
        {
          actorGroupId: group.id,
          scope: AccessScope.Organization,
          scopeOrgId: seedData1.organization.id,
          isActive: true
        },
        {
          actorGroupId: group.id,
          scope: AccessScope.Project,
          scopeOrgId: seedData1.organization.id,
          scopeProjectId: seedData1.project.id,
          isActive: true
        }
      ])
      .returning("*");
    await db(TableName.MembershipRole).insert([
      { membershipId: groupOrgMembership.id, role: OrgMembershipRole.Member },
      { membershipId: groupProjectMembership.id, role: ProjectMembershipRole.Member }
    ]);

    await createPolicyWithApprovers({
      secretPath,
      approvers: [{ type: ApproverType.Group, id: group.id }],
      approvals: 1,
      approvalsRequired: [{ stepNumber: 1, numberOfApprovals: 2 }]
    });

    const requestId = await openRequest(secretPath);

    expect((await reviewAs(a, requestId)).statusCode).toBe(200);
    expect((await getRequestState(requestId)).status).toBe("pending");

    expect((await reviewAs(b, requestId)).statusCode).toBe(200);
    const state = await getRequestState(requestId);
    expect(state.status).toBe("approved");
    expect(state.privilege).toBeDefined();
  });

  const twoStepApprovers = () => [
    { type: ApproverType.User, id: a.userId, sequence: 1 },
    { type: ApproverType.User, id: b.userId, sequence: 2 }
  ];

  const openRequestPastStepOne = async (secretPath: string) => {
    const policy = await createPolicyWithApprovers({ secretPath, approvers: twoStepApprovers(), approvals: 1 });
    const requestId = await openRequest(secretPath);
    expect((await reviewAs(a, requestId)).statusCode).toBe(200);

    const before = await getRequestSteps(requestId);
    expect((await getRequestState(requestId)).currentStep).toBe(2);
    expect(before.map((step) => step.approvalCount)).toEqual([1, 0]);
    return { policy, requestId, before };
  };

  const expectStepsReset = async (requestId: string, before: Awaited<ReturnType<typeof getRequestSteps>>) => {
    const after = await getRequestSteps(requestId);
    expect((await getRequestState(requestId)).currentStep).toBe(1);
    expect(after.map((step) => step.status)).toEqual(["in-progress", "pending"]);
    expect(after.map((step) => step.approvalCount)).toEqual([0, 0]);
    expect(after.map((step) => step.id)).not.toEqual(before.map((step) => step.id));
    return after;
  };

  const expectStepsUntouched = async (requestId: string, before: Awaited<ReturnType<typeof getRequestSteps>>) => {
    expect((await getRequestState(requestId)).currentStep).toBe(2);
    expect(await getRequestSteps(requestId)).toEqual(before);
  };

  test("Changing the secret path rebuilds the steps of pending requests", async () => {
    const { policy, requestId, before } = await openRequestPastStepOne("/reset-path");

    const res = await patchPolicy(policy.id, { secretPath: "/reset-path-moved", approvers: twoStepApprovers() });
    expect(res.statusCode).toBe(200);

    const after = await expectStepsReset(requestId, before);
    expect(after.map((step) => step.approverUserIds)).toEqual([[a.userId], [b.userId]]);
  });

  test("Changing the environments rebuilds the steps of pending requests with the updated approvers", async () => {
    const { policy, requestId, before } = await openRequestPastStepOne("/reset-env");
    const otherEnv = await getDb()(TableName.Environment)
      .where({ projectId: seedData1.project.id })
      .whereNot({ slug: seedData1.environment.slug })
      .first();
    expect(otherEnv).toBeDefined();

    const res = await patchPolicy(policy.id, {
      secretPath: "/reset-env",
      environments: [otherEnv!.slug],
      approvers: [...twoStepApprovers(), { type: ApproverType.User, id: c.userId, sequence: 1 }]
    });
    expect(res.statusCode).toBe(200);

    const after = await expectStepsReset(requestId, before);
    expect(after.map((step) => step.approverUserIds)).toEqual([[a.userId, c.userId].sort(), [b.userId]]);
  });

  test("Changing only the approvers leaves the steps of pending requests alone", async () => {
    const { policy, requestId, before } = await openRequestPastStepOne("/reset-approvers-only");

    const res = await patchPolicy(policy.id, {
      secretPath: "/reset-approvers-only",
      environments: [seedData1.environment.slug],
      approvers: [...twoStepApprovers(), { type: ApproverType.User, id: c.userId, sequence: 1 }],
      approvalsRequired: [{ stepNumber: 1, numberOfApprovals: 2 }]
    });
    expect(res.statusCode).toBe(200);

    const policySteps = await getPolicySteps(policy.id);
    expect(policySteps.map((step) => step.requiredApprovals)).toEqual([2, 1]);
    await expectStepsUntouched(requestId, before);
  });

  test("Re-sending the same path and environments does not reset pending requests", async () => {
    const { policy, requestId, before } = await openRequestPastStepOne("/reset-unchanged");

    const res = await patchPolicy(policy.id, {
      name: "reset-unchanged-renamed",
      secretPath: "/reset-unchanged",
      environments: [seedData1.environment.slug],
      approvers: twoStepApprovers()
    });
    expect(res.statusCode).toBe(200);

    await expectStepsUntouched(requestId, before);
  });
});

describe("Break-glass approvals on the global system", () => {
  const approvers: TApprover[] = [];
  let approver: TApprover;

  const bypassReason = "incident INC-1234 needs the production key now";

  const createSoftPolicy = async (body: { secretPath: string; bypassers?: { type: "user"; id: string }[] }) => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v1/access-approvals/policies",
      headers: authHeaders(),
      body: {
        projectSlug: seedData1.project.slug,
        environment: seedData1.environment.slug,
        name: `break-glass-${body.secretPath.slice(1)}`,
        secretPath: body.secretPath,
        approvers: [{ type: ApproverType.User, id: approver.userId }],
        approvals: 1,
        allowedSelfApprovals: false,
        enforcementLevel: "soft",
        ...(body.bypassers && { bypassers: body.bypassers })
      }
    });
    expect(res.statusCode).toBe(200);
    const { approval } = res.json();
    globalPolicyIds.push(approval.id);
    return approval as { id: string };
  };

  beforeAll(async () => {
    initLogger();
    await initEnvConfig(testHsmService, testKmsRootConfigDAL, testSuperAdminDAL, logger);
    approver = await createApproverUser();
    approvers.push(approver);
  });

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

  afterAll(async () => {
    const db = getDb();
    const userIds = approvers.map((el) => el.userId);
    await db(TableName.AuthTokenSession).whereIn("userId", userIds).del();
    await db(TableName.Membership).whereIn("actorUserId", userIds).del();
    await db(TableName.Users).whereIn("id", userIds).del();
  });

  test("A listed bypasser approves their own request without the approver and gets a break-glass grant", async () => {
    const db = getDb();
    const secretPath = "/break-glass-listed";
    const policy = await createSoftPolicy({ secretPath, bypassers: [{ type: "user", id: seedData1.id }] });

    const createRes = await createAccessRequest(secretPath, { isTemporary: true, temporaryRange: "1h" });
    expect(createRes.statusCode).toBe(200);
    const requestId = createRes.json().approval.id as string;

    const selfApproveRes = await reviewAccessRequest(requestId, { status: "approved" });
    expect(selfApproveRes.statusCode).toBe(400);

    const bypassRes = await reviewAccessRequest(requestId, { status: "approved", bypassReason });
    expect(bypassRes.statusCode).toBe(200);
    expect(bypassRes.json().review.status).toBe("approved");
    expect(bypassRes.json().review.reviewerUserId).toBe(seedData1.id);

    const state = await getRequestState(requestId);
    expect(state.status).toBe("approved");
    expect(state.grant?.status).toBe("active");
    expect(state.grant?.isBreakGlass).toBe(true);
    expect(state.grant?.bypassReason).toBe(bypassReason);
    expect(state.grant?.granteeUserId).toBe(seedData1.id);
    expect(state.privilege?.actorUserId).toBe(seedData1.id);
    expect(state.privilege?.temporaryRange).toBe("1h");

    const steps = await db(TableName.ApprovalRequestSteps).where({ requestId });
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((step) => step.status === "completed")).toBe(true);

    const listed = (await listAccessRequests()).json().requests.find((el: { id: string }) => el.id === requestId);
    expect(listed.policyId).toBe(policy.id);
    expect(listed.status).toBe("approved");
    expect(listed.bypassReason).toBe(bypassReason);
    expect(listed.policy.bypassers).toEqual([seedData1.id]);
  });

  test("A soft policy with no bypassers refuses break-glass when self-approvals are off", async () => {
    const secretPath = "/break-glass-anyone";
    await createSoftPolicy({ secretPath });

    const createRes = await createAccessRequest(secretPath);
    expect(createRes.statusCode).toBe(200);
    const requestId = createRes.json().approval.id as string;

    const bypassRes = await reviewAccessRequest(requestId, { status: "approved", bypassReason });
    expect(bypassRes.statusCode).toBe(403);
    expect(bypassRes.json().message).toBe("You are not permitted to bypass approval on this request");

    const state = await getRequestState(requestId);
    expect(state.status).toBe("pending");
    expect(state.grant).toBeUndefined();
  });

  test("A requester who is not on a non-empty bypasser list is refused", async () => {
    const secretPath = "/break-glass-not-listed";
    await createSoftPolicy({ secretPath, bypassers: [{ type: "user", id: approver.userId }] });

    const createRes = await createAccessRequest(secretPath);
    expect(createRes.statusCode).toBe(200);
    const requestId = createRes.json().approval.id as string;

    const bypassRes = await reviewAccessRequest(requestId, { status: "approved", bypassReason });
    expect(bypassRes.statusCode).toBe(403);
    expect(bypassRes.json().message).toBe("You are not permitted to bypass approval on this request");

    const state = await getRequestState(requestId);
    expect(state.status).toBe("pending");
    expect(state.grant).toBeUndefined();
  });

  test("Only the requester can break glass, even when the actor is an approver and a bypasser", async () => {
    const secretPath = "/break-glass-not-requester";
    await createSoftPolicy({ secretPath, bypassers: [{ type: "user", id: approver.userId }] });

    const createRes = await createAccessRequest(secretPath);
    expect(createRes.statusCode).toBe(200);
    const requestId = createRes.json().approval.id as string;

    const bypassRes = await testServer.inject({
      method: "POST",
      url: `/api/v1/access-approvals/requests/${requestId}/review`,
      headers: { authorization: `Bearer ${approver.token}` },
      body: { status: "approved", bypassReason }
    });
    expect(bypassRes.statusCode).toBe(403);
    expect(bypassRes.json().message).toBe("You are not permitted to bypass approval on this request");

    const normalRes = await reviewAs(approver, requestId);
    expect(normalRes.statusCode).toBe(200);
    const state = await getRequestState(requestId);
    expect(state.status).toBe("approved");
    expect(state.grant?.isBreakGlass).toBe(false);
    expect(state.grant?.bypassReason).toBeNull();
  });

  test("A bypass reason is rejected on a rejection and when it is too short", async () => {
    const secretPath = "/break-glass-bad-input";
    await createSoftPolicy({ secretPath });

    const createRes = await createAccessRequest(secretPath);
    expect(createRes.statusCode).toBe(200);
    const requestId = createRes.json().approval.id as string;

    const rejectRes = await reviewAccessRequest(requestId, { status: "rejected", bypassReason });
    expect(rejectRes.statusCode).toBe(400);
    expect(rejectRes.json().message).toBe("A bypass reason can only be provided when approving a request");

    const shortRes = await reviewAccessRequest(requestId, { status: "approved", bypassReason: "too short" });
    expect(shortRes.statusCode).toBe(422);

    const state = await getRequestState(requestId);
    expect(state.status).toBe("pending");
  });
});
