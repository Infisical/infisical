import crypto from "node:crypto";

import { Knex } from "knex";

import { AccessScope, OrgMembershipRole, OrgMembershipStatus, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

// Policies are created on the *shared* seeded project and environment, so any
// that outlive this file change how every later spec behaves: a policy at "/"
// makes secret writes there return an approval request instead of a secret,
// which breaks specs that have nothing to do with approvals. Track what we
// create and remove it after each test.
const createdPolicyIds: string[] = [];

const deletePolicy = async (sapId: string) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v1/secret-approvals/${sapId}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    }
  });
  if (res.statusCode !== 200 && res.statusCode !== 404) {
    throw new Error(`cleanup: unexpected ${res.statusCode} deleting policy ${sapId} — ${res.payload}`);
  }
};

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
  const { approval } = res.json();
  createdPolicyIds.push(approval.id);
  return approval;
};

// Returns the raw response because callers assert on rejections too, so only
// register a policy when one was actually created.
const createPolicyWithGroupApprover = async (dto: { name: string; groupId: string; secretPath: string }) => {
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
      approvers: [{ id: dto.groupId, type: ApproverType.Group }],
      approvals: 1
    }
  });

  if (res.statusCode === 200) {
    createdPolicyIds.push(res.json().approval.id);
  }
  return res;
};

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
  afterEach(async () => {
    const ids = createdPolicyIds.splice(0);
    await Promise.all(ids.map(deletePolicy));
  });

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

  test("Create policy succeeds when user approver is a project member only via a group", async () => {
    const db = getDb();
    const group = await seedGroup(db, { slug: "sap-group-user-approver", addToProject: true });
    const user = await seedGroupOnlyUser(db, {
      groupId: group.id,
      orgMembershipStatus: OrgMembershipStatus.Accepted
    });

    let policyId: string | undefined;
    try {
      const res = await createPolicyWithUserApprover(user.id, "/group-user-approver");

      expect(res.statusCode).toBe(200);
      policyId = res.json().approval.id;
    } finally {
      if (policyId) await db(TableName.SecretApprovalPolicy).where({ id: policyId }).del();
      await cleanupGroupOnlyUser(db, user.id);
      await cleanupGroup(db, group.id);
    }
  });

  test("Create policy fails when user approver is in a project group but has not accepted the org invite", async () => {
    const db = getDb();
    const group = await seedGroup(db, { slug: "sap-group-invited-user-approver", addToProject: true });
    const user = await seedGroupOnlyUser(db, {
      groupId: group.id,
      orgMembershipStatus: OrgMembershipStatus.Invited
    });

    try {
      const res = await createPolicyWithUserApprover(user.id, "/group-invited-user-approver");

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("not members of the project");
    } finally {
      await cleanupGroupOnlyUser(db, user.id);
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
