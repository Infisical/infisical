import jwt from "jsonwebtoken";
import { Knex } from "knex";

import {
  AccessScope,
  OrgMembershipRole,
  OrgMembershipStatus,
  ProjectMembershipRole,
  TableName,
  TAccessApprovalPoliciesInsert,
  TAccessApprovalRequestsInsert
} from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { getConfig, initEnvConfig } from "@app/lib/config/env";
import { initLogger, logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

const SECRET_ACCESS_TYPE = "secret-access";

const globalPolicyIds: string[] = [];

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

describe("Access approval request lifecycle on the global system", () => {
  afterEach(async () => {
    const db = getDb();
    const globalIds = globalPolicyIds.splice(0);

    await db(TableName.ApprovalRequestGrants)
      .where({ projectId: seedData1.project.id, type: SECRET_ACCESS_TYPE })
      .del();
    if (globalIds.length) {
      await db(TableName.ApprovalRequests).whereIn("policyId", globalIds).del();
      await db(TableName.ApprovalPolicies).whereIn("id", globalIds).del();
    }
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

const getRequestState = async (requestId: string) => {
  const db = getDb();
  const request = await db(TableName.ApprovalRequests).where({ id: requestId }).first();
  const grant = await db(TableName.ApprovalRequestGrants).where({ requestId }).first();
  const privilege = grant ? await db(TableName.AdditionalPrivilege).where({ grantId: grant.id }).first() : undefined;
  return { status: request?.status, currentStep: request?.currentStep, grant, privilege };
};

const patchPolicy = (policyId: string, body: Record<string, unknown>) =>
  testServer.inject({
    method: "PATCH",
    url: `/api/v1/access-approvals/policies/${policyId}`,
    headers: authHeaders(),
    body: { approvals: 1, allowedSelfApprovals: false, ...body }
  });

describe("Additional privilege list on the global system", () => {
  const approvers: TApprover[] = [];
  const legacyRequestIds: string[] = [];
  let approver: TApprover;

  const listUserPrivileges = async () => {
    const membership = await getDb()(TableName.Membership)
      .where({ scope: AccessScope.Project, scopeProjectId: seedData1.project.id, actorUserId: seedData1.id })
      .first();
    const res = await testServer.inject({
      method: "GET",
      url: `/api/v1/user-project-additional-privilege?projectMembershipId=${membership?.id}`,
      headers: authHeaders()
    });
    expect(res.statusCode).toBe(200);
    return res.json().privileges as {
      id: string;
      isLinkedToAccessApproval: boolean;
      accessApprovalRequestId: string | null;
      policyApproverUserIds: string[];
    }[];
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
    const legacyIds = legacyRequestIds.splice(0);

    if (legacyIds.length) {
      await db(TableName.AccessApprovalRequest).whereIn("id", legacyIds).del();
    }
    await db(TableName.AdditionalPrivilege)
      .where({ actorUserId: seedData1.id })
      .whereLike("name", "requested-privilege-%")
      .del();
    await db(TableName.ApprovalRequestGrants)
      .where({ projectId: seedData1.project.id, type: SECRET_ACCESS_TYPE })
      .del();
    if (globalIds.length) {
      await db(TableName.AccessApprovalPolicyApprover).whereIn("policyId", globalIds).del();
      await db(TableName.AccessApprovalPolicy).whereIn("id", globalIds).del();
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

  test("A migrated privilege lists the global policy's approvers after they change", async () => {
    const db = getDb();
    const secretPath = "/privilege-list-migrated";
    const { policy, requestId } = await createApprovedTemporaryRequest(secretPath);
    const { privilege } = await getRequestState(requestId);

    const environment = await db(TableName.Environment)
      .where({ projectId: seedData1.project.id, slug: seedData1.environment.slug })
      .first();
    const legacyPolicy: TAccessApprovalPoliciesInsert & { id: string } = {
      id: policy.id,
      name: "privilege-list-migrated",
      secretPath,
      envId: environment?.id as string,
      deletedAt: new Date()
    };
    await db(TableName.AccessApprovalPolicy).insert(legacyPolicy);
    await db(TableName.AccessApprovalPolicyApprover).insert({ policyId: policy.id, approverUserId: seedData1.id });
    const legacyRequest: TAccessApprovalRequestsInsert & { id: string } = {
      id: requestId,
      policyId: policy.id,
      privilegeId: privilege?.id,
      requestedByUserId: seedData1.id,
      isTemporary: true,
      temporaryRange: "1h",
      permissions: JSON.stringify([]),
      status: "approved"
    };
    await db(TableName.AccessApprovalRequest).insert(legacyRequest);
    legacyRequestIds.push(requestId);

    const res = await patchPolicy(policy.id, {
      secretPath,
      approvers: [{ type: ApproverType.User, id: approver.userId }]
    });
    expect(res.statusCode).toBe(200);

    const listed = (await listUserPrivileges()).find((el) => el.id === privilege?.id);
    expect(listed?.isLinkedToAccessApproval).toBe(true);
    expect(listed?.accessApprovalRequestId).toBe(requestId);
    expect(listed?.policyApproverUserIds).toEqual([approver.userId]);
  });
});
