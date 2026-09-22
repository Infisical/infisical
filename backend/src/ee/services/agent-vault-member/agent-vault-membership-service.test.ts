import { describe, expect, test, vi } from "vitest";

import { AccessScope, ProjectMembershipRole } from "@app/db/schemas";
import { AgentVaultMemberType } from "@app/ee/services/agent-vault/agent-vault-enums";
import { ActorType } from "@app/services/auth/auth-type";

import { agentVaultMembershipServiceFactory } from "./agent-vault-membership-service";

const ORG_ID = "org-1";
const PROJECT_ID = "project-1";
const OTHER_PROJECT_ID = "project-2";
const ACTOR_ID = "actor-1";
const IDENTITY_ID = "identity-1";
const GROUP_ID = "group-1";
const OTHER_USER_ID = "user-2";

const addIds = { userIds: [], groupIds: [], machineIdentityIds: [IDENTITY_ID], emails: [] };

const ctx = {
  actor: ActorType.USER,
  actorId: ACTOR_ID,
  actorOrgId: ORG_ID,
  actorAuthMethod: undefined
} as unknown as Parameters<ReturnType<typeof agentVaultMembershipServiceFactory>["addProductMembers"]>[0]["ctx"];

const buildTx = (adminCount: number) => {
  const chain: Record<string, unknown> = {};
  ["join", "where", "orWhere", "whereNotIn", "countDistinct"].forEach((method) => {
    chain[method] = vi.fn((arg: unknown) => {
      if (typeof arg === "function") (arg as (qb: unknown) => void)(chain);
      return chain;
    });
  });
  chain.first = vi.fn().mockResolvedValue({ count: String(adminCount) });

  const tx = vi.fn(() => chain) as unknown as { raw: ReturnType<typeof vi.fn> };
  tx.raw = vi.fn();
  return tx;
};

// Only the collaborators these three guards touch; everything else is left undefined so a guard that
// fails to short-circuit shows up as a crash rather than a silent pass.
const buildService = ({
  identityProjectId = null as string | null,
  productMemberships = [] as { id: string }[],
  adminMembershipIds = [] as string[]
} = {}) => {
  const deps = {
    permissionService: { getProjectPermission: vi.fn().mockResolvedValue({ hasRole: () => true }) },
    identityDAL: {
      // Honours a projectId filter, because the ownership check pushes it into the query rather than
      // comparing in JS: a mock that ignored it would report every identity as Agent Vault's own.
      find: vi.fn(({ projectId }: { projectId?: string }) =>
        Promise.resolve(
          projectId && projectId !== identityProjectId
            ? []
            : [{ id: IDENTITY_ID, name: "agent", orgId: ORG_ID, projectId: identityProjectId }]
        )
      )
    },
    groupDAL: { find: vi.fn().mockResolvedValue([]) },
    userDAL: { find: vi.fn().mockResolvedValue([]) },
    userAliasDAL: { findBySsoExternalIds: vi.fn().mockResolvedValue([]) },
    orgDAL: { findById: vi.fn().mockResolvedValue({ id: ORG_ID, rootOrgId: null }) },
    membershipDAL: {
      // The organization read is how an actor is judged to exist here, so it answers for whatever it is
      // asked about. That is what an org holds for every actor it reaches, including one it does not own
      // itself and one another product scoped to its own project.
      find: vi.fn(({ scope, $in }: { scope: string; $in?: Record<string, string[] | undefined> }) =>
        Promise.resolve(
          scope === AccessScope.Project
            ? productMemberships.map((row) => ({ ...row, actorIdentityId: IDENTITY_ID, createdAt: new Date() }))
            : Object.entries($in ?? {}).flatMap(([column, ids]) =>
                (ids ?? []).map((id) => ({ id: `org-${id}`, [column]: id, isActive: true }))
              )
        )
      ),
      // assertWillRetainProjectAdmin takes an advisory lock through tx.raw, then counts live admins
      // with a query built off tx() itself. The chain answers with the fixture's admin count, so
      // adminMembershipIds still decides whether the guard lets the write through.
      transaction: vi.fn((cb: (tx: unknown) => unknown) => Promise.resolve(cb(buildTx(adminMembershipIds.length)))),
      insertMany: vi.fn((rows: Record<string, unknown>[]) =>
        Promise.resolve(rows.map((row) => ({ ...row, id: "mem-new", createdAt: new Date() })))
      ),
      delete: vi.fn().mockResolvedValue(undefined)
    },
    membershipRoleDAL: {
      find: vi
        .fn()
        .mockResolvedValue(adminMembershipIds.map((id) => ({ membershipId: id, role: ProjectMembershipRole.Admin }))),
      create: vi.fn(({ role }: { role: string }) => Promise.resolve({ role })),
      insertMany: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined)
    },
    projectAccessRequestDAL: { delete: vi.fn().mockResolvedValue(undefined) },
    usageMeteringService: { emitForProject: vi.fn() }
  };

  const service = agentVaultMembershipServiceFactory(
    deps as unknown as Parameters<typeof agentVaultMembershipServiceFactory>[0]
  );
  return { service, deps };
};

describe("agentVaultMembership guards", () => {
  // A project-scoped identity also carries an org-scope NoAccess membership, so the organization check
  // alone lets another product's identity in, and it could then mint Agent Vault sessions.
  test("refuses an identity scoped to another project", async () => {
    const { service, deps } = buildService({ identityProjectId: OTHER_PROJECT_ID });

    await expect(
      service.addProductMembers({
        projectId: PROJECT_ID,
        ...addIds,
        role: ProjectMembershipRole.Member,
        ctx
      })
    ).rejects.toThrow("belong to another project");

    expect(deps.membershipDAL.insertMany).not.toHaveBeenCalled();
  });

  test("accepts an identity that belongs to no project", async () => {
    const { service } = buildService({ identityProjectId: null });

    const { members } = await service.addProductMembers({
      projectId: PROJECT_ID,
      ...addIds,
      role: ProjectMembershipRole.Member,
      ctx
    });

    expect(members[0].id).toBe("mem-new");
  });

  test("accepts an identity created inside Agent Vault itself", async () => {
    const { service } = buildService({ identityProjectId: PROJECT_ID });

    const { members } = await service.addProductMembers({
      projectId: PROJECT_ID,
      ...addIds,
      role: ProjectMembershipRole.Member,
      ctx
    });

    expect(members[0].id).toBe("mem-new");
  });

  // Removing only the membership would leave the identity live but off every screen: this product's tab
  // lists by membership, and the organization list hides project-scoped identities.
  test("refuses to detach an identity Agent Vault owns, pointing at delete instead", async () => {
    const { service, deps } = buildService({ identityProjectId: PROJECT_ID });

    await expect(service.revokeProductMembers({ projectId: PROJECT_ID, ...addIds, ctx })).rejects.toThrow(
      "Delete the identity instead"
    );

    expect(deps.membershipDAL.delete).not.toHaveBeenCalled();
  });

  test("still detaches an identity the organization owns", async () => {
    const { service, deps } = buildService({
      identityProjectId: null,
      productMemberships: [{ id: "mem-1" }],
      adminMembershipIds: ["mem-other"]
    });

    await service.revokeProductMembers({ projectId: PROJECT_ID, ...addIds, ctx });

    expect(deps.membershipDAL.delete).toHaveBeenCalledWith({ $in: { id: ["mem-1"] } }, expect.anything());
  });

  // A sub-organization reaches one of its parent's groups through a membership of its own, and the group
  // row keeps pointing at the parent. Judging it by that row refused every linked group.
  test("accepts a group the organization reaches but does not own", async () => {
    const { service, deps } = buildService();

    const { members } = await service.addProductMembers({
      projectId: PROJECT_ID,
      userIds: [],
      machineIdentityIds: [],
      groupIds: [GROUP_ID],
      emails: [],
      role: ProjectMembershipRole.Member,
      ctx
    });

    expect(members[0].id).toBe("mem-new");
    expect(deps.membershipDAL.find).toHaveBeenCalledWith(
      expect.objectContaining({ scope: AccessScope.Organization, $in: { actorGroupId: [GROUP_ID] } })
    );
  });

  test("refuses a group the organization does not reach at all", async () => {
    const { service, deps } = buildService();
    deps.membershipDAL.find.mockResolvedValue([]);

    await expect(
      service.addProductMembers({
        projectId: PROJECT_ID,
        userIds: [],
        machineIdentityIds: [],
        groupIds: [GROUP_ID],
        emails: [],
        role: ProjectMembershipRole.Member,
        ctx
      })
    ).rejects.toThrow("not found");

    expect(deps.membershipDAL.insertMany).not.toHaveBeenCalled();
  });

  // Reaching the organization through a group is how a sub-org is given a parent group's members. They
  // reach Agent Vault the same way, by the group being a member, so neither is individually assignable.
  // Authentication resolves them through the group and is deliberately untouched by this.
  test("refuses an actor whose organization access comes only from a group", async () => {
    const { service, deps } = buildService();
    deps.membershipDAL.find.mockResolvedValue([]);

    await expect(
      service.addProductMembers({
        projectId: PROJECT_ID,
        userIds: [OTHER_USER_ID],
        machineIdentityIds: [],
        groupIds: [],
        emails: [],
        role: ProjectMembershipRole.Member,
        ctx
      })
    ).rejects.toThrow("is not a member of this organization");

    expect(deps.membershipDAL.insertMany).not.toHaveBeenCalled();
  });

  test("refuses an actor whose organization membership is deactivated", async () => {
    const { service, deps } = buildService();
    deps.membershipDAL.find.mockResolvedValue([{ id: "org-mem", actorUserId: OTHER_USER_ID, isActive: false }]);

    await expect(
      service.addProductMembers({
        projectId: PROJECT_ID,
        userIds: [OTHER_USER_ID],
        machineIdentityIds: [],
        groupIds: [],
        emails: [],
        role: ProjectMembershipRole.Member,
        ctx
      })
      // Named as deactivated rather than missing, because reactivating is the remedy, not inviting.
    ).rejects.toThrow("is deactivated in this organization");

    expect(deps.membershipDAL.insertMany).not.toHaveBeenCalled();
  });

  // A group whose organization membership was deactivated must not be restorable by adding it again.
  test("refuses a group whose organization membership is deactivated", async () => {
    const { service, deps } = buildService();
    deps.membershipDAL.find.mockResolvedValue([{ id: "org-mem", actorGroupId: GROUP_ID, isActive: false }]);

    await expect(
      service.addProductMembers({
        projectId: PROJECT_ID,
        userIds: [],
        machineIdentityIds: [],
        groupIds: [GROUP_ID],
        emails: [],
        role: ProjectMembershipRole.Member,
        ctx
      })
    ).rejects.toThrow("not found");

    expect(deps.membershipDAL.insertMany).not.toHaveBeenCalled();
  });

  test("refuses to change your own role", async () => {
    const { service, deps } = buildService();

    await expect(
      service.updateProductMemberRole({
        projectId: PROJECT_ID,
        actor: { type: AgentVaultMemberType.User, id: ACTOR_ID },
        role: ProjectMembershipRole.Member,
        ctx
      })
    ).rejects.toThrow("your own role");

    expect(deps.membershipRoleDAL.create).not.toHaveBeenCalled();
  });

  test("still changes someone else's role", async () => {
    const { service } = buildService({
      productMemberships: [{ id: "mem-1" }],
      adminMembershipIds: ["mem-other"]
    });

    const { member } = await service.updateProductMemberRole({
      projectId: PROJECT_ID,
      actor: { type: AgentVaultMemberType.MachineIdentity, id: IDENTITY_ID },
      role: ProjectMembershipRole.Member,
      ctx
    });

    expect(member.role).toBe(ProjectMembershipRole.Member);
  });
});
