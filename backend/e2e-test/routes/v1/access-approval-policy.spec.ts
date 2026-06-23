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
  return res.json().approval;
};

const createPolicyWithGroupApprover = (dto: { name: string; groupId: string; secretPath: string }) =>
  testServer.inject({
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

describe("Access approval policy router", async () => {
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

    let policyId: string | undefined;
    try {
      const createRes = await createPolicyWithGroupApprover({
        name: "test-access-policy-update",
        groupId: group.id,
        secretPath: "/group-update"
      });
      expect(createRes.statusCode).toBe(200);
      policyId = createRes.json().approval.id;

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
      if (policyId) {
        await db(TableName.AccessApprovalPolicyApprover).where({ policyId }).del();
        await db(TableName.AccessApprovalPolicyEnvironment).where({ policyId }).del();
        await db(TableName.AccessApprovalPolicy).where({ id: policyId }).del();
      }
      await cleanupGroup(db, group.id);
    }
  });
});
