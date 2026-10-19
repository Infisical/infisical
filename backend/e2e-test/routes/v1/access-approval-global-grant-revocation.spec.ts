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

type TMember = { userId: string; projectMembershipId: string; token: string };

const adminHeaders = () => ({ authorization: `Bearer ${jwtAuthToken}` });

const createProjectMember = async (): Promise<TMember> => {
  const db = getDb();
  const username = `grant-revocation-${alphaNumericNanoId(8)}@example.com`.toLowerCase();
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
      userAgent: "e2e-access-approval-grant-revocation",
      accessVersion: 1,
      refreshVersion: 1,
      lastUsed: new Date()
    } as never)
    .returning("*");

  return {
    userId: user.id,
    projectMembershipId: projectMembership.id,
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

const createGlobalPolicy = async (secretPath: string) => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v1/access-approvals/policies",
    headers: adminHeaders(),
    body: {
      projectSlug: seedData1.project.slug,
      environment: seedData1.environment.slug,
      name: `grant-revocation-${secretPath.slice(1)}`,
      secretPath,
      approvers: [{ type: ApproverType.User, id: seedData1.id }],
      approvals: 1,
      allowedSelfApprovals: true
    }
  });
  expect(res.statusCode).toBe(200);
  const { approval }: { approval: { id: string } } = res.json();
  return approval;
};

const createApprovedRequest = async (secretPath: string, requesterHeaders: Record<string, string>) => {
  const createRes = await testServer.inject({
    method: "POST",
    url: `/api/v1/access-approvals/requests?projectSlug=${seedData1.project.slug}`,
    headers: requesterHeaders,
    body: {
      permissions: [
        ["read", "secrets", { environment: seedData1.environment.slug, secretPath: { $glob: secretPath } }]
      ],
      isTemporary: true,
      temporaryRange: "1h"
    }
  });
  expect(createRes.statusCode).toBe(200);
  const { approval }: { approval: { id: string } } = createRes.json();

  const reviewRes = await testServer.inject({
    method: "POST",
    url: `/api/v1/access-approvals/requests/${approval.id}/review`,
    headers: adminHeaders(),
    body: { status: "approved" }
  });
  expect(reviewRes.statusCode).toBe(200);

  const grant = await getDb()(TableName.ApprovalRequestGrants).where({ requestId: approval.id }).first();
  if (!grant) throw new Error(`Approved request '${approval.id}' has no grant`);
  expect(grant.status).toBe("active");
  return grant;
};

describe("Deleting an additional privilege revokes its approval grant", () => {
  const policyIds: string[] = [];
  const memberIds: string[] = [];

  beforeAll(async () => {
    initLogger();
    await initEnvConfig(testHsmService, testKmsRootConfigDAL, testSuperAdminDAL, logger);
  });

  afterEach(async () => {
    const db = getDb();
    const ids = policyIds.splice(0);
    const userIds = memberIds.splice(0);

    await db(TableName.AdditionalPrivilege)
      .whereIn("actorUserId", [seedData1.id, ...userIds])
      .whereLike("name", "requested-privilege-%")
      .del();
    await db(TableName.ApprovalRequestGrants)
      .where({ projectId: seedData1.project.id, type: SECRET_ACCESS_TYPE })
      .del();
    if (ids.length) {
      await db(TableName.ApprovalRequests).whereIn("policyId", ids).del();
      await db(TableName.ApprovalPolicies).whereIn("id", ids).del();
    }
    if (userIds.length) {
      await db(TableName.AuthTokenSession).whereIn("userId", userIds).del();
      await db(TableName.Membership).whereIn("actorUserId", userIds).del();
      await db(TableName.Users).whereIn("id", userIds).del();
    }
  });

  test("Removing a member from the project revokes only that member's grants", async () => {
    const db = getDb();
    const member = await createProjectMember();
    memberIds.push(member.userId);

    const memberPath = "/grant-revocation-member";
    policyIds.push((await createGlobalPolicy(memberPath)).id);
    const memberGrant = await createApprovedRequest(memberPath, { authorization: `Bearer ${member.token}` });
    const memberPrivilege = await db(TableName.AdditionalPrivilege).where({ grantId: memberGrant.id }).first();
    expect(memberPrivilege?.actorUserId).toBe(member.userId);

    const adminPath = "/grant-revocation-admin";
    policyIds.push((await createGlobalPolicy(adminPath)).id);
    const adminGrant = await createApprovedRequest(adminPath, adminHeaders());

    const removeRes = await testServer.inject({
      method: "DELETE",
      url: `/api/v1/projects/${seedData1.project.id}/memberships/${member.projectMembershipId}`,
      headers: adminHeaders()
    });
    expect(removeRes.statusCode).toBe(200);

    const privilegeAfter = await db(TableName.AdditionalPrivilege).where({ id: memberPrivilege?.id }).first();
    expect(privilegeAfter).toBeUndefined();

    const memberGrantAfter = await db(TableName.ApprovalRequestGrants).where({ id: memberGrant.id }).first();
    expect(memberGrantAfter?.status).toBe("revoked");
    expect(memberGrantAfter?.revokedAt).toBeTruthy();
    expect(memberGrantAfter?.revokedByUserId).toBeNull();

    const adminGrantAfter = await db(TableName.ApprovalRequestGrants).where({ id: adminGrant.id }).first();
    expect(adminGrantAfter?.status).toBe("active");
    expect(adminGrantAfter?.revokedAt).toBeNull();
  });
});
