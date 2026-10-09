import crypto from "node:crypto";

import { Knex } from "knex";

import { AccessScope, OrgMembershipRole, OrgMembershipStatus, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

const seedGroup = async (db: Knex, dto: { slug: string; addToProject: boolean }) => {
  const [group] = await db(TableName.Groups)
    .insert({
      orgId: seedData1.organization.id,
      name: dto.slug,
      slug: dto.slug
    })
    .returning("*");

  if (dto.addToProject) {
    const [membership] = await db(TableName.Membership)
      .insert({
        actorGroupId: group.id,
        scope: AccessScope.Project,
        scopeOrgId: seedData1.organization.id,
        scopeProjectId: seedData1.project.id,
        isActive: true
      })
      .returning("*");

    await db(TableName.MembershipRole).insert({
      membershipId: membership.id,
      role: "member"
    });
  }

  return group;
};

const cleanupGroup = async (db: Knex, groupId: string) => {
  const memberships = await db(TableName.Membership).where({ actorGroupId: groupId }).select("id");
  if (memberships.length) {
    await db(TableName.MembershipRole)
      .whereIn(
        "membershipId",
        memberships.map((m) => m.id)
      )
      .del();
    await db(TableName.Membership).where({ actorGroupId: groupId }).del();
  }
  await db(TableName.Groups).where({ id: groupId }).del();
};

// A user that is NOT a direct project member, but belongs to a group that is in the project. Group
// membership always sits on top of an org membership, whose status decides whether the user counts.
const seedGroupOnlyUser = async (db: Knex, dto: { groupId: string; orgMembershipStatus: OrgMembershipStatus }) => {
  const username = `sap-group-user-${crypto.randomUUID()}@localhost.local`;
  const [user] = await db(TableName.Users)
    .insert({
      email: username,
      username,
      isGhost: false,
      isEmailVerified: true,
      isAccepted: dto.orgMembershipStatus === OrgMembershipStatus.Accepted,
      authMethods: ["email"]
    })
    .returning("*");

  const [orgMembership] = await db(TableName.Membership)
    .insert({
      scope: AccessScope.Organization,
      scopeOrgId: seedData1.organization.id,
      actorUserId: user.id,
      status: dto.orgMembershipStatus,
      isActive: true
    })
    .returning("*");
  await db(TableName.MembershipRole).insert({ membershipId: orgMembership.id, role: OrgMembershipRole.Member });

  await db(TableName.UserGroupMembership).insert({
    userId: user.id,
    groupId: dto.groupId,
    isPending: dto.orgMembershipStatus !== OrgMembershipStatus.Accepted
  });

  return user;
};

const cleanupGroupOnlyUser = async (db: Knex, userId: string) => {
  await db(TableName.SecretApprovalPolicyApprover).where({ approverUserId: userId }).del();
  await db(TableName.UserGroupMembership).where({ userId }).del();
  const memberships = await db(TableName.Membership).where({ actorUserId: userId }).select("id");
  if (memberships.length) {
    await db(TableName.MembershipRole)
      .whereIn(
        "membershipId",
        memberships.map((m) => m.id)
      )
      .del();
    await db(TableName.Membership).where({ actorUserId: userId }).del();
  }
  await db(TableName.Users).where({ id: userId }).del();
};

const createPolicyWithUserApprover = async (userId: string, secretPath: string) =>
  testServer.inject({
    method: "POST",
    url: `/api/v1/secret-approvals`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      workspaceId: seedData1.project.id,
      environment: seedData1.environment.slug,
      name: `test-policy${secretPath.replaceAll("/", "-")}`,
      secretPath,
      approvers: [{ id: userId, type: ApproverType.User }],
      approvals: 1
    }
  });

// The rest of this router is covered by tests/suites/secretmanager/approvals. This case stays here
// because it needs a pending group membership, which the HTTP-only suite cannot construct.
describe("Secret approval policy router", async () => {
  test("Create policy succeeds when user approver is in a project group but has not accepted the org invite", async () => {
    const db = getDb();
    const group = await seedGroup(db, { slug: "sap-group-invited-user-approver", addToProject: true });
    const user = await seedGroupOnlyUser(db, {
      groupId: group.id,
      orgMembershipStatus: OrgMembershipStatus.Invited
    });

    let policyId: string | undefined;
    try {
      const res = await createPolicyWithUserApprover(user.id, "/group-invited-user-approver");

      expect(res.statusCode).toBe(200);
      policyId = res.json().approval.id;
    } finally {
      if (policyId) await db(TableName.SecretApprovalPolicy).where({ id: policyId }).del();
      await cleanupGroupOnlyUser(db, user.id);
      await cleanupGroup(db, group.id);
    }
  });
});
