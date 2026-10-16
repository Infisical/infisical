import crypto from "node:crypto";

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

// Policies are created on the *shared* seeded project and environment, so any
// that outlive this file change how later specs behave. Nothing in the suite
// exercises access requests today, which is the only reason leftovers here have
// been harmless — the sibling secret-approval leak silently broke secret writes
// at "/" for every later spec. Track what we create and remove it after each
// test rather than relying on that staying true.
const createdPolicyIds: string[] = [];

const deletePolicy = async (policyId: string) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v1/access-approvals/policies/${policyId}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    }
  });
  if (res.statusCode !== 200 && res.statusCode !== 404) {
    throw new Error(`cleanup: unexpected ${res.statusCode} deleting policy ${policyId} — ${res.payload}`);
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
    url: `/api/v1/access-approvals/policies`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      projectSlug: seedData1.project.slug,
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
    url: `/api/v1/access-approvals/policies`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      projectSlug: seedData1.project.slug,
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

type TProjectMember = { userId: string; token: string };

const seedProjectMember = async (db: Knex): Promise<TProjectMember> => {
  const username = `aap-member-${alphaNumericNanoId(8)}@example.com`.toLowerCase();
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
      userAgent: "e2e-access-approval-policy",
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

const cleanupProjectMember = async (db: Knex, userId: string) => {
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
  await db(TableName.AuthTokenSession).where({ userId }).del();
  await db(TableName.Users).where({ id: userId }).del();
};

// Secret access policies have no generic router of their own, so a caller can only reach
// the shared delete handler with one of their ids through another registered type's route.
const deletePolicyThroughGenericEndpoint = (policyId: string, token: string) =>
  testServer.inject({
    method: "DELETE",
    url: `/api/v1/approval-policies/pam-access/${policyId}`,
    headers: {
      authorization: `Bearer ${token}`
    }
  });

describe("Access approval policy router", async () => {
  beforeAll(async () => {
    initLogger();
    await initEnvConfig(testHsmService, testKmsRootConfigDAL, testSuperAdminDAL, logger);
  });

  afterEach(async () => {
    const ids = createdPolicyIds.splice(0);
    await Promise.all(ids.map(deletePolicy));
  });

  test("Create policy", async () => {
    const policy = await createPolicy({
      secretPath: "/",
      approvals: 1,
      approvers: [{ id: seedData1.id, type: ApproverType.User }],
      name: "test-access-policy"
    });

    expect(policy.name).toBe("test-access-policy");
  });

  test("Create policy fails when group approver is not a member of the project", async () => {
    // A group id that has no membership row for the project must be rejected.
    const nonMemberGroupId = crypto.randomUUID();

    const res = await createPolicyWithGroupApprover({
      name: "test-access-policy-group-not-in-project",
      groupId: nonMemberGroupId,
      secretPath: "/group-not-member"
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("Some groups are not members of the project");
    expect(res.json().message).toContain(nonMemberGroupId);
  });

  test("Create policy succeeds when group approver is a member of the project", async () => {
    const db = getDb();
    const group = await seedGroup(db, { slug: "aap-group-in-project", addToProject: true });

    try {
      const res = await createPolicyWithGroupApprover({
        name: "test-access-policy-group-in-project",
        groupId: group.id,
        secretPath: "/group-member"
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().approval.name).toBe("test-access-policy-group-in-project");
    } finally {
      await cleanupGroup(db, group.id);
    }
  });

  test("Update policy fails when group approver is not a member of the project", async () => {
    const db = getDb();
    const group = await seedGroup(db, { slug: "aap-group-update", addToProject: true });
    const nonMemberGroupId = crypto.randomUUID();

    try {
      const createRes = await createPolicyWithGroupApprover({
        name: "test-access-policy-update",
        groupId: group.id,
        secretPath: "/group-update"
      });
      expect(createRes.statusCode).toBe(200);
      const policyId = createRes.json().approval.id;

      const updateRes = await testServer.inject({
        method: "PATCH",
        url: `/api/v1/access-approvals/policies/${policyId}`,
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          approvers: [{ id: nonMemberGroupId, type: ApproverType.Group }],
          approvals: 1
        }
      });

      expect(updateRes.statusCode).toBe(400);
      expect(updateRes.json().message).toContain("Some groups are not members of the project");
      expect(updateRes.json().message).toContain(nonMemberGroupId);
    } finally {
      await cleanupGroup(db, group.id);
    }
  });

  test("Generic delete endpoint checks permission before revealing the policy type", async () => {
    const db = getDb();
    const member = await seedProjectMember(db);

    try {
      const policy = await createPolicy({
        secretPath: "/generic-delete",
        approvals: 1,
        approvers: [{ id: seedData1.id, type: ApproverType.User }],
        name: "test-access-policy-generic-delete"
      });

      const asMember = await deletePolicyThroughGenericEndpoint(policy.id, member.token);
      expect(asMember.statusCode).toBe(403);
      expect(asMember.json().message).not.toContain("secret-access");

      const asAdmin = await deletePolicyThroughGenericEndpoint(policy.id, jwtAuthToken);
      expect(asAdmin.statusCode).toBe(400);
      expect(asAdmin.json().message).toContain("expected pam-access, got secret-access");

      const stillThere = await db(TableName.ApprovalPolicies).where({ id: policy.id }).first();
      expect(stillThere).toBeDefined();
    } finally {
      await cleanupProjectMember(db, member.userId);
    }
  });
});
