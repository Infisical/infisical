import crypto from "node:crypto";

import { Knex } from "knex";

import { AccessScope, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

const createPolicy = async (dto: {
  name: string;
  secretPath: string;
  approvers: { type: ApproverType.User; id: string }[];
  approvals: number;
}) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/secret-approvals`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      workspaceId: seedData1.project.id,
      environment: seedData1.environment.slug,
      name: dto.name,
      secretPath: dto.secretPath,
      approvers: dto.approvers,
      approvals: dto.approvals
    }
  });

  expect(res.statusCode).toBe(200);
  return res.json().approval;
};

const createPolicyWithGroupApprover = (dto: { name: string; groupId: string; secretPath: string }) =>
  testServer.inject({
    method: "POST",
    url: `/api/v1/secret-approvals`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      workspaceId: seedData1.project.id,
      environment: seedData1.environment.slug,
      name: dto.name,
      secretPath: dto.secretPath,
      approvers: [{ id: dto.groupId, type: ApproverType.Group }],
      approvals: 1
    }
  });

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

describe("Secret approval policy router", async () => {
  test("Create policy", async () => {
    const policy = await createPolicy({
      secretPath: "/",
      approvals: 1,
      approvers: [{ id: seedData1.id, type: ApproverType.User }],
      name: "test-policy"
    });

    expect(policy.name).toBe("test-policy");
  });

  test("Create policy fails when group approver is not a member of the project", async () => {
    // A group id that has no membership row for the project must be rejected.
    const nonMemberGroupId = crypto.randomUUID();

    const res = await createPolicyWithGroupApprover({
      name: "test-policy-group-not-in-project",
      groupId: nonMemberGroupId,
      secretPath: "/group-not-member"
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("Some groups are not members of the project");
    expect(res.json().message).toContain(nonMemberGroupId);
  });

  test("Create policy succeeds when group approver is a member of the project", async () => {
    const db = getDb();
    const group = await seedGroup(db, { slug: "sap-group-in-project", addToProject: true });

    try {
      const res = await createPolicyWithGroupApprover({
        name: "test-policy-group-in-project",
        groupId: group.id,
        secretPath: "/group-member"
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().approval.name).toBe("test-policy-group-in-project");
    } finally {
      await cleanupGroup(db, group.id);
    }
  });

  test("Create policy succeeds when user approver is a project member only via a group", async () => {
    const db = getDb();
    const group = await seedGroup(db, { slug: "sap-group-user-approver", addToProject: true });

    // A user that is NOT a direct project member, but belongs to a group that is in the project.
    const [user] = await db(TableName.Users)
      .insert({
        email: `sap-group-user-${crypto.randomUUID()}@localhost.local`,
        username: `sap-group-user-${crypto.randomUUID()}@localhost.local`,
        isGhost: false,
        isEmailVerified: true,
        authMethods: ["email"]
      })
      .returning("*");

    await db(TableName.UserGroupMembership).insert({
      userId: user.id,
      groupId: group.id,
      isPending: false
    });

    let policyId: string | undefined;
    try {
      const res = await testServer.inject({
        method: "POST",
        url: `/api/v1/secret-approvals`,
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          workspaceId: seedData1.project.id,
          environment: seedData1.environment.slug,
          name: "test-policy-group-user-approver",
          secretPath: "/group-user-approver",
          approvers: [{ id: user.id, type: ApproverType.User }],
          approvals: 1
        }
      });

      expect(res.statusCode).toBe(200);
      policyId = res.json().approval.id;
    } finally {
      await db(TableName.SecretApprovalPolicyApprover).where({ approverUserId: user.id }).del();
      if (policyId) await db(TableName.SecretApprovalPolicy).where({ id: policyId }).del();
      await db(TableName.UserGroupMembership).where({ userId: user.id }).del();
      await db(TableName.Users).where({ id: user.id }).del();
      await cleanupGroup(db, group.id);
    }
  });

  test("Create policy fails when user approver is neither a direct nor a group member", async () => {
    // A user id with no direct project membership and no group-based access must still be rejected.
    const nonMemberUserId = crypto.randomUUID();

    const res = await testServer.inject({
      method: "POST",
      url: `/api/v1/secret-approvals`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        workspaceId: seedData1.project.id,
        environment: seedData1.environment.slug,
        name: "test-policy-non-member-user",
        secretPath: "/non-member-user",
        approvers: [{ id: nonMemberUserId, type: ApproverType.User }],
        approvals: 1
      }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("Some users are not members of the project");
    expect(res.json().message).toContain(nonMemberUserId);
  });
});
