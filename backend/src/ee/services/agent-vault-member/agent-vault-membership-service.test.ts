import { createMongoAbility, ForbiddenError, MongoAbility, RawRuleOf } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { AccessScope, ProjectMembershipRole } from "@app/db/schemas";
import { AgentVaultMemberType } from "@app/ee/services/agent-vault/agent-vault-enums";
import { agentVaultMemberTestRules } from "@app/ee/services/agent-vault/testing/agent-vault-test-roles";
import { agentVaultProjectAdminPermissions } from "@app/ee/services/permission/default-roles";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { ActorType } from "@app/services/auth/auth-type";
import { lockMembershipsById } from "@app/services/membership/membership-dal";

import { agentVaultMembershipServiceFactory } from "./agent-vault-membership-service";

// The real lock queries the database. Here only when the removal takes it matters.
vi.mock("@app/services/membership/membership-dal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/services/membership/membership-dal")>()),
  lockMembershipsById: vi.fn(async () => [])
}));

const ORG_ID = "org-1";
const PROJECT_ID = "project-1";
const OTHER_PROJECT_ID = "project-2";
const ACTOR_ID = "actor-1";
const IDENTITY_ID = "identity-1";
const GROUP_ID = "group-1";
const OTHER_USER_ID = "user-2";
const THIRD_USER_ID = "user-3";
const INSERTED_AT = new Date("2026-01-01T00:00:00Z");

const addIds = { userIds: [], groupIds: [], machineIdentityIds: [IDENTITY_ID], emails: [] };

const ctx = {
  actor: ActorType.USER,
  actorId: ACTOR_ID,
  actorOrgId: ORG_ID,
  actorAuthMethod: undefined
} as unknown as Parameters<ReturnType<typeof agentVaultMembershipServiceFactory>["addProductMembers"]>[0]["ctx"];

const buildTx = (adminCount: number) => {
  const chain: Record<string, unknown> = {};
  ["join", "where", "orWhere", "whereNotIn", "whereIn", "countDistinct"].forEach((method) => {
    chain[method] = vi.fn((arg: unknown) => {
      if (typeof arg === "function") (arg as (qb: unknown) => void)(chain);
      return chain;
    });
  });
  chain.first = vi
    .fn()
    .mockResolvedValueOnce({ count: String(adminCount) })
    .mockResolvedValue({ count: "1" });

  const tx = vi.fn(() => chain) as unknown as { raw: ReturnType<typeof vi.fn>; chain: typeof chain };
  tx.raw = vi.fn();
  tx.chain = chain;
  return tx;
};

// Only the collaborators these three guards touch; everything else is left undefined so a guard that
// fails to short-circuit shows up as a crash rather than a silent pass. findActorsWithActiveOrgAccess
// follows the org read, and groupReachableIds fakes actors that reach the org only through a group.
const buildService = ({
  identityProjectId = null as string | null,
  productMemberships = [] as ({ id: string } & Record<string, string | null>)[],
  adminMembershipIds = [] as string[],
  groupReachableIds = [] as string[],
  // A role of its own, in place of Agent Vault admin.
  rules = agentVaultProjectAdminPermissions as RawRuleOf<MongoAbility>[],
  // Off is the legacy system, where the boundary compares rule sets instead of checking assign-role.
  shouldUseNewPrivilegeSystem = false
} = {}) => {
  const txs: ReturnType<typeof buildTx>[] = [];
  const deps = {
    permissionService: {
      getProjectPermissionByRoles: vi.fn(async (roles: string[]) =>
        roles.map((role) => ({
          permission: createMongoAbility(
            (role === ProjectMembershipRole.Admin
              ? agentVaultProjectAdminPermissions
              : agentVaultMemberTestRules()) as RawRuleOf<MongoAbility>[]
          ),
          role: { name: role, slug: role }
        }))
      ),
      getProjectPermission: vi.fn().mockResolvedValue({
        permission: createMongoAbility(rules),
        // Admin is a role, not a rule set: only the built-in rules stand for holding it.
        hasRole: (role: string) => role === ProjectMembershipRole.Admin && rules === agentVaultProjectAdminPermissions
      })
    },
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
    orgDAL: {
      findById: vi.fn().mockResolvedValue({ id: ORG_ID, rootOrgId: null, shouldUseNewPrivilegeSystem }),
      lockActorsForOrgAccess: vi.fn().mockResolvedValue(undefined),
      findActorsWithActiveOrgAccess: vi.fn(
        async ({ userIds, identityIds }: { userIds: string[]; identityIds: string[] }) => {
          const active = async (column: "actorUserId" | "actorIdentityId", ids: string[]) => {
            if (!ids.length) return new Set<string>();
            const rows = (await deps.membershipDAL.find({
              scope: AccessScope.Organization,
              $in: { [column]: ids }
            })) as Record<string, unknown>[];
            const direct = rows.filter((row) => ids.includes(row[column] as string));
            const withRow = new Set(direct.map((row) => row[column] as string));
            return new Set([
              ...direct.filter((row) => row.isActive).map((row) => row[column] as string),
              ...ids.filter((id) => groupReachableIds.includes(id) && !withRow.has(id))
            ]);
          };
          return {
            userIds: await active("actorUserId", userIds),
            identityIds: await active("actorIdentityId", identityIds)
          };
        }
      )
    },
    membershipDAL: {
      // The organization read is how an actor is judged to exist here, so it answers for whatever it is
      // asked about. That is what an org holds for every actor it reaches, including one it does not own
      // itself and one another product scoped to its own project.
      find: vi.fn(({ scope, $in }: { scope: string; $in?: Record<string, string[] | undefined> }) =>
        Promise.resolve(
          scope === AccessScope.Project
            ? productMemberships.map((row) => ({ actorIdentityId: IDENTITY_ID, createdAt: INSERTED_AT, ...row }))
            : Object.entries($in ?? {}).flatMap(([column, ids]) =>
                (ids ?? []).map((id) => ({ id: `org-${id}`, [column]: id, isActive: true }))
              )
        )
      ),
      // assertWillRetainProjectAdmin takes an advisory lock through tx.raw, then counts live admins
      // with a query built off tx() itself. The chain answers with the fixture's admin count, so
      // adminMembershipIds still decides whether the guard lets the write through.
      transaction: vi.fn((cb: (tx: unknown) => unknown) => {
        const tx = buildTx(adminMembershipIds.length);
        txs.push(tx);
        return Promise.resolve(cb(tx));
      }),
      insertMany: vi.fn((rows: Record<string, unknown>[]) =>
        Promise.resolve(rows.map((row) => ({ ...row, id: "mem-new", createdAt: INSERTED_AT })))
      ),
      delete: vi.fn().mockResolvedValue(undefined)
    },
    membershipRoleDAL: {
      find: vi
        .fn()
        .mockResolvedValue(adminMembershipIds.map((id) => ({ membershipId: id, role: ProjectMembershipRole.Admin }))),
      findRolesByMembershipIds: vi
        .fn()
        .mockResolvedValue(adminMembershipIds.map((id) => ({ membershipId: id, role: ProjectMembershipRole.Admin }))),
      insertMany: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined)
    },
    // The project's Member role, which `member` names, found by the id derived from the project. A lookup of custom roles
    // by slug finds none.
    roleDAL: {
      find: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue({ id: "role-member", slug: "member-role" })
    },
    projectAccessRequestDAL: { delete: vi.fn().mockResolvedValue(undefined) },
    agentVaultAccessBundleDAL: { find: vi.fn().mockResolvedValue([]) },
    agentVaultPersonalValueDAL: { deleteForActorsOutsideProject: vi.fn().mockResolvedValue(0) },
    agentVaultMemberDAL: { findAvailableActors: vi.fn().mockResolvedValue({ members: [], totalCount: 0 }) },
    userGroupMembershipDAL: { find: vi.fn().mockResolvedValue([]) },
    identityGroupMembershipDAL: { find: vi.fn().mockResolvedValue([]) }
  };

  const service = agentVaultMembershipServiceFactory(
    deps as unknown as Parameters<typeof agentVaultMembershipServiceFactory>[0]
  );
  return { service, deps, txs };
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
        roles: [ProjectMembershipRole.Member],
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
      roles: [ProjectMembershipRole.Member],
      ctx
    });

    expect(members[0]).toMatchObject({
      type: AgentVaultMemberType.MachineIdentity,
      id: IDENTITY_ID,
      addedAt: INSERTED_AT
    });
  });

  test("accepts an identity created inside Agent Vault itself", async () => {
    const { service } = buildService({ identityProjectId: PROJECT_ID });

    const { members } = await service.addProductMembers({
      projectId: PROJECT_ID,
      ...addIds,
      roles: [ProjectMembershipRole.Member],
      ctx
    });

    expect(members[0]).toMatchObject({
      type: AgentVaultMemberType.MachineIdentity,
      id: IDENTITY_ID,
      addedAt: INSERTED_AT
    });
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

    vi.mocked(lockMembershipsById).mockClear();
    await service.revokeProductMembers({ projectId: PROJECT_ID, ...addIds, ctx });

    expect(deps.membershipDAL.delete).toHaveBeenCalledWith({ $in: { id: ["mem-1"] } }, expect.anything());
    // Locked in id order before anything is deleted, the order a delegation save takes them in.
    expect(lockMembershipsById).toHaveBeenCalledWith(["mem-1"], expect.anything());
    expect(vi.mocked(lockMembershipsById).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deps.membershipDAL.delete).mock.invocationCallOrder[0]
    );
    // Leaving the project clears what the identity saved in it.
    expect(deps.agentVaultPersonalValueDAL.deleteForActorsOutsideProject).toHaveBeenCalledWith(
      { projectId: PROJECT_ID, userIds: [], identityIds: [IDENTITY_ID] },
      expect.anything()
    );
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
      roles: [ProjectMembershipRole.Member],
      ctx
    });

    expect(members[0]).toMatchObject({ type: AgentVaultMemberType.Group, id: GROUP_ID, addedAt: INSERTED_AT });
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
        roles: [ProjectMembershipRole.Member],
        ctx
      })
    ).rejects.toThrow("not found");

    expect(deps.membershipDAL.insertMany).not.toHaveBeenCalled();
  });

  // Reaching the organization through a group is how a sub-org is given a parent group's members. They
  // reach Agent Vault the same way, by the group being a member, so neither is individually assignable.
  // Authentication resolves them through the group and is deliberately untouched by this.
  test("accepts an actor whose organization access comes only from a group", async () => {
    const { service, deps } = buildService({ groupReachableIds: [OTHER_USER_ID] });
    deps.membershipDAL.find.mockResolvedValue([]);

    await service.addProductMembers({
      projectId: PROJECT_ID,
      userIds: [OTHER_USER_ID],
      machineIdentityIds: [],
      groupIds: [],
      emails: [],
      roles: [ProjectMembershipRole.Member],
      ctx
    });

    expect(deps.membershipDAL.insertMany).toHaveBeenCalledWith(
      [expect.objectContaining({ actorUserId: OTHER_USER_ID })],
      expect.anything()
    );
  });

  test("refuses an actor the organization does not reach at all", async () => {
    const { service, deps } = buildService();
    deps.membershipDAL.find.mockResolvedValue([]);

    await expect(
      service.addProductMembers({
        projectId: PROJECT_ID,
        userIds: [OTHER_USER_ID],
        machineIdentityIds: [],
        groupIds: [],
        emails: [],
        roles: [ProjectMembershipRole.Member],
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
        roles: [ProjectMembershipRole.Member],
        ctx
      })
      // Named as deactivated rather than missing, because reactivating is the remedy, not inviting.
    ).rejects.toThrow("is deactivated in this organization");

    expect(deps.membershipDAL.insertMany).not.toHaveBeenCalled();
  });

  // A batch holding both kinds names both, so fixing one and retrying is not how you discover the other.
  test("names the deactivated and the non-member in one refusal", async () => {
    const { service, deps } = buildService();
    deps.membershipDAL.find.mockResolvedValue([{ id: "org-mem", actorUserId: OTHER_USER_ID, isActive: false }]);

    await expect(
      service.addProductMembers({
        projectId: PROJECT_ID,
        userIds: [OTHER_USER_ID, THIRD_USER_ID],
        machineIdentityIds: [],
        groupIds: [],
        emails: [],
        roles: [ProjectMembershipRole.Member],
        ctx
      })
    ).rejects.toThrow(/is deactivated in this organization[\s\S]*is not a member of this organization/);

    expect(deps.membershipDAL.insertMany).not.toHaveBeenCalled();
  });

  // The name lookup is not org-scoped, so resolving an outsider would hand back another tenant's email and
  // tell a real id apart from a made-up one. Only the deactivated, who are in this org, get a name.
  test("never names an actor from outside the organization", async () => {
    const { service, deps } = buildService();
    deps.membershipDAL.find.mockResolvedValue([]);
    deps.userDAL.find.mockResolvedValue([{ id: OTHER_USER_ID, username: "sam@othercompany.com" }]);

    const refusal = service.addProductMembers({
      projectId: PROJECT_ID,
      userIds: [OTHER_USER_ID],
      machineIdentityIds: [],
      groupIds: [],
      emails: [],
      roles: [ProjectMembershipRole.Member],
      ctx
    });

    await expect(refusal).rejects.toThrow(`'${OTHER_USER_ID}' is not a member of this organization`);
    await expect(refusal).rejects.not.toThrow("sam@othercompany.com");
  });

  test("names a deactivated member, who is in this organization", async () => {
    const { service, deps } = buildService();
    deps.membershipDAL.find.mockResolvedValue([{ id: "org-mem", actorUserId: OTHER_USER_ID, isActive: false }]);
    deps.userDAL.find.mockResolvedValue([{ id: OTHER_USER_ID, username: "bob@test.local" }]);

    await expect(
      service.addProductMembers({
        projectId: PROJECT_ID,
        userIds: [OTHER_USER_ID],
        machineIdentityIds: [],
        groupIds: [],
        emails: [],
        roles: [ProjectMembershipRole.Member],
        ctx
      })
    ).rejects.toThrow("'bob@test.local' is deactivated in this organization");
  });

  test("reads correctly for several outsiders", async () => {
    const { service, deps } = buildService();
    deps.membershipDAL.find.mockResolvedValue([]);

    await expect(
      service.addProductMembers({
        projectId: PROJECT_ID,
        userIds: [OTHER_USER_ID, THIRD_USER_ID],
        machineIdentityIds: [],
        groupIds: [],
        emails: [],
        roles: [ProjectMembershipRole.Member],
        ctx
      })
    ).rejects.toThrow("are not members of this organization. Invite them to the organization first.");
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
        roles: [ProjectMembershipRole.Member],
        ctx
      })
    ).rejects.toThrow("not found");

    expect(deps.membershipDAL.insertMany).not.toHaveBeenCalled();
  });

  test("refuses to change your own role", async () => {
    const { service, deps } = buildService();

    await expect(
      service.updateProductMemberRoles({
        projectId: PROJECT_ID,
        userIds: [OTHER_USER_ID, ACTOR_ID],
        groupIds: [],
        machineIdentityIds: [],
        roles: [ProjectMembershipRole.Member],
        ctx
      })
    ).rejects.toThrow("your own role");

    expect(deps.membershipRoleDAL.insertMany).not.toHaveBeenCalled();
  });

  test("still changes someone else's role", async () => {
    const { service, deps } = buildService({
      productMemberships: [{ id: "mem-1" }],
      adminMembershipIds: ["mem-other"]
    });

    const { members, skipped } = await service.updateProductMemberRoles({
      projectId: PROJECT_ID,
      userIds: [],
      groupIds: [],
      machineIdentityIds: [IDENTITY_ID],
      roles: [ProjectMembershipRole.Member],
      ctx
    });

    // member names the project's Member role.
    expect(members).toMatchObject([{ type: AgentVaultMemberType.MachineIdentity, roles: ["member-role"] }]);
    expect(skipped).toEqual([]);
    expect(deps.membershipRoleDAL.insertMany).toHaveBeenCalledWith(
      [{ membershipId: "mem-1", role: ProjectMembershipRole.Custom, customRoleId: "role-member" }],
      expect.anything()
    );
    // Losing a role keeps what the member saved; only leaving the project clears it.
    expect(deps.agentVaultPersonalValueDAL.deleteForActorsOutsideProject).not.toHaveBeenCalled();
  });

  test("skips a member who already has the role instead of rewriting it", async () => {
    const { service, deps } = buildService({
      productMemberships: [{ id: "mem-other" }],
      adminMembershipIds: ["mem-other"]
    });

    const { members, skipped } = await service.updateProductMemberRoles({
      projectId: PROJECT_ID,
      userIds: [],
      groupIds: [],
      machineIdentityIds: [IDENTITY_ID],
      roles: [ProjectMembershipRole.Admin],
      ctx
    });

    expect(members).toEqual([]);
    expect(skipped).toMatchObject([{ type: AgentVaultMemberType.MachineIdentity, id: IDENTITY_ID }]);
    expect(deps.membershipRoleDAL.delete).not.toHaveBeenCalled();
  });

  test("a batch changes the members it can and reports the rest as skipped", async () => {
    const { service, deps } = buildService({
      productMemberships: [{ id: "mem-identity" }, { id: "mem-group", actorIdentityId: null, actorGroupId: GROUP_ID }],
      adminMembershipIds: ["mem-group"]
    });
    vi.mocked(deps.membershipRoleDAL.find).mockResolvedValue([
      { id: "row-identity", membershipId: "mem-identity", role: ProjectMembershipRole.Custom, customRoleId: "role-x" },
      { id: "row-group", membershipId: "mem-group", role: ProjectMembershipRole.Admin }
    ] as never);

    const { members, skipped } = await service.updateProductMemberRoles({
      projectId: PROJECT_ID,
      userIds: [OTHER_USER_ID],
      groupIds: [GROUP_ID],
      machineIdentityIds: [IDENTITY_ID],
      roles: [ProjectMembershipRole.Admin],
      ctx
    });

    expect(members).toEqual([
      expect.objectContaining({ type: AgentVaultMemberType.MachineIdentity, id: IDENTITY_ID, roles: ["admin"] })
    ]);
    expect(skipped).toHaveLength(2);
    expect(skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: AgentVaultMemberType.User, id: OTHER_USER_ID }),
        expect.objectContaining({ type: AgentVaultMemberType.Group, id: GROUP_ID })
      ])
    );
    expect(deps.membershipRoleDAL.delete).toHaveBeenCalledWith({ $in: { id: ["row-identity"] } }, expect.anything());
    expect(deps.membershipRoleDAL.insertMany).toHaveBeenCalledWith(
      [{ membershipId: "mem-identity", role: ProjectMembershipRole.Admin }],
      expect.anything()
    );
    expect(deps.agentVaultPersonalValueDAL.deleteForActorsOutsideProject).not.toHaveBeenCalled();
  });

  test("the deprecated role keeps the roles a member holds for access bundles", async () => {
    const { service, deps } = buildService({
      productMemberships: [{ id: "mem-identity" }],
      adminMembershipIds: ["mem-other-admin"]
    });
    vi.mocked(deps.membershipRoleDAL.find).mockResolvedValue([
      { id: "row-member", membershipId: "mem-identity", role: ProjectMembershipRole.Custom, customRoleId: "role-x" },
      {
        id: "row-bundle",
        membershipId: "mem-identity",
        role: ProjectMembershipRole.Custom,
        customRoleId: "role-bundle"
      }
    ] as never);
    vi.mocked(deps.agentVaultAccessBundleDAL.find).mockResolvedValue([{ grantRoleId: "role-bundle" }] as never);
    vi.mocked(deps.roleDAL.find).mockResolvedValue([{ id: "role-bundle", slug: "github-users" }] as never);

    const { members } = await service.updateProductMemberRoles({
      projectId: PROJECT_ID,
      userIds: [],
      groupIds: [],
      machineIdentityIds: [IDENTITY_ID],
      roles: [ProjectMembershipRole.Admin],
      keepBundleRoles: true,
      ctx
    });

    expect(members).toEqual([expect.objectContaining({ id: IDENTITY_ID, roles: ["admin", "github-users"] })]);
    expect(deps.membershipRoleDAL.delete).toHaveBeenCalledWith({ $in: { id: ["row-member"] } }, expect.anything());
    expect(deps.membershipRoleDAL.insertMany).toHaveBeenCalledWith(
      [{ membershipId: "mem-identity", role: ProjectMembershipRole.Admin }],
      expect.anything()
    );
  });

  test("the deprecated role counts the access bundle roles it keeps toward the limit", async () => {
    const { service, deps } = buildService({
      productMemberships: [{ id: "mem-identity" }],
      adminMembershipIds: ["mem-other-admin"]
    });
    const bundleRoleIds = Array.from({ length: 10 }, (_, index) => `role-bundle-${index}`);
    vi.mocked(deps.membershipRoleDAL.find).mockResolvedValue(
      bundleRoleIds.map((customRoleId) => ({
        id: `row-${customRoleId}`,
        membershipId: "mem-identity",
        role: ProjectMembershipRole.Custom,
        customRoleId
      })) as never
    );
    vi.mocked(deps.agentVaultAccessBundleDAL.find).mockResolvedValue(
      bundleRoleIds.map((grantRoleId) => ({ grantRoleId })) as never
    );
    vi.mocked(deps.roleDAL.find).mockResolvedValue(bundleRoleIds.map((id) => ({ id, slug: `${id}-users` })) as never);

    await expect(
      service.updateProductMemberRoles({
        projectId: PROJECT_ID,
        userIds: [],
        groupIds: [],
        machineIdentityIds: [IDENTITY_ID],
        roles: [ProjectMembershipRole.Member],
        keepBundleRoles: true,
        ctx
      })
    ).rejects.toThrow("A member can have at most 10 roles.");

    expect(deps.membershipRoleDAL.delete).not.toHaveBeenCalled();
    expect(deps.membershipRoleDAL.insertMany).not.toHaveBeenCalled();
  });

  test("a role whose time limit has ended is given afresh when named again", async () => {
    const { service, deps } = buildService({
      productMemberships: [{ id: "mem-identity" }],
      adminMembershipIds: ["mem-other-admin"]
    });
    vi.mocked(deps.membershipRoleDAL.find).mockResolvedValue([
      {
        id: "row-ended",
        membershipId: "mem-identity",
        role: ProjectMembershipRole.Custom,
        customRoleId: "role-member",
        isTemporary: true,
        temporaryAccessEndTime: new Date(Date.now() - 60_000)
      }
    ] as never);

    const { members, skipped } = await service.updateProductMemberRoles({
      projectId: PROJECT_ID,
      userIds: [],
      groupIds: [],
      machineIdentityIds: [IDENTITY_ID],
      roles: [ProjectMembershipRole.Member],
      ctx
    });

    expect(skipped).toEqual([]);
    expect(members).toMatchObject([{ id: IDENTITY_ID, roles: ["member-role"] }]);
    expect(deps.membershipRoleDAL.delete).toHaveBeenCalledWith({ $in: { id: ["row-ended"] } }, expect.anything());
    expect(deps.membershipRoleDAL.insertMany).toHaveBeenCalledWith(
      [{ membershipId: "mem-identity", role: ProjectMembershipRole.Custom, customRoleId: "role-member" }],
      expect.anything()
    );
  });

  test("a time-limited role named again keeps its row and its time limit", async () => {
    const { service, deps } = buildService({
      productMemberships: [{ id: "mem-identity" }],
      adminMembershipIds: ["mem-other-admin"]
    });
    vi.mocked(deps.membershipRoleDAL.find).mockResolvedValue([
      {
        id: "row-live",
        membershipId: "mem-identity",
        role: ProjectMembershipRole.Custom,
        customRoleId: "role-member",
        isTemporary: true,
        temporaryAccessEndTime: new Date(Date.now() + 3_600_000)
      }
    ] as never);

    await service.updateProductMemberRoles({
      projectId: PROJECT_ID,
      userIds: [],
      groupIds: [],
      machineIdentityIds: [IDENTITY_ID],
      roles: [ProjectMembershipRole.Member, ProjectMembershipRole.Admin],
      ctx
    });

    expect(deps.membershipRoleDAL.delete).not.toHaveBeenCalled();
    expect(deps.membershipRoleDAL.insertMany).toHaveBeenCalledWith(
      [{ membershipId: "mem-identity", role: ProjectMembershipRole.Admin }],
      expect.anything()
    );
  });

  test("reads the members' roles on the primary before the write's transaction too", async () => {
    const { service, deps, txs } = buildService({
      productMemberships: [{ id: "mem-identity" }],
      adminMembershipIds: ["mem-other-admin"]
    });

    await service.updateProductMemberRoles({
      projectId: PROJECT_ID,
      userIds: [],
      groupIds: [],
      machineIdentityIds: [IDENTITY_ID],
      roles: [ProjectMembershipRole.Member],
      ctx
    });
    await service.revokeProductMembers({ projectId: PROJECT_ID, ...addIds, ctx });

    // Only a read without a tx goes to a replica.
    const { calls } = vi.mocked(deps.membershipRoleDAL.findRolesByMembershipIds).mock;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    calls.forEach(([, tx]) => expect(txs).toContain(tx));
  });

  test("refuses one batch that would demote every remaining admin", async () => {
    const { service, deps, txs } = buildService({
      productMemberships: [{ id: "mem-identity" }, { id: "mem-group", actorIdentityId: null, actorGroupId: GROUP_ID }]
    });

    await expect(
      service.updateProductMemberRoles({
        projectId: PROJECT_ID,
        userIds: [],
        groupIds: [GROUP_ID],
        machineIdentityIds: [IDENTITY_ID],
        roles: [ProjectMembershipRole.Member],
        ctx
      })
    ).rejects.toThrow("must keep at least one admin");

    // The last transaction is the write's; the first only read the members' roles.
    expect(txs.at(-1)!.chain.whereNotIn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(["mem-identity", "mem-group"])
    );
    expect(deps.membershipRoleDAL.delete).not.toHaveBeenCalled();
    expect(deps.membershipRoleDAL.insertMany).not.toHaveBeenCalled();
  });
});

describe("member changes take the action on each kind they name", () => {
  // Can manage machine identities and read users, but can't add, change or remove users or groups.
  const identityManager = [
    ...[
      ProjectPermissionIdentityActions.Read,
      ProjectPermissionIdentityActions.Create,
      ProjectPermissionIdentityActions.Edit,
      ProjectPermissionIdentityActions.Delete
    ].map((action) => ({ action, subject: ProjectPermissionSub.Identity })),
    { action: ProjectPermissionMemberActions.Read, subject: ProjectPermissionSub.Member }
  ];
  const withoutIdentity = { userIds: [], groupIds: [], machineIdentityIds: [] };

  const identityRoleAssigner = [
    ...identityManager,
    { action: ProjectPermissionIdentityActions.AssignRole, subject: ProjectPermissionSub.Identity }
  ];

  test("adds, re-roles and removes an identity with the identity actions and assign-role", async () => {
    const { service, deps } = buildService({
      productMemberships: [{ id: "mem-1" }],
      adminMembershipIds: ["mem-other"],
      rules: identityRoleAssigner,
      shouldUseNewPrivilegeSystem: true
    });

    await service.addProductMembers({ projectId: PROJECT_ID, ...addIds, roles: [ProjectMembershipRole.Member], ctx });
    await service.updateProductMemberRoles({
      projectId: PROJECT_ID,
      ...addIds,
      roles: [ProjectMembershipRole.NoAccess],
      ctx
    });
    await service.revokeProductMembers({ projectId: PROJECT_ID, ...addIds, ctx });
    expect(deps.membershipDAL.delete).toHaveBeenCalled();
  });

  test.each([
    ["a user by id", { ...withoutIdentity, userIds: [OTHER_USER_ID] }],
    ["a user by email", { ...withoutIdentity, emails: ["someone@example.com"] }],
    ["a group", { ...withoutIdentity, groupIds: [GROUP_ID] }],
    ["an identity alongside a user", { ...addIds, userIds: [OTHER_USER_ID] }]
  ])("refuses to add %s without that kind's create", async (_label, ids) => {
    const { service, deps } = buildService({ rules: identityManager });

    await expect(
      service.addProductMembers({
        projectId: PROJECT_ID,
        emails: [],
        ...ids,
        roles: [ProjectMembershipRole.Member],
        ctx
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(deps.membershipDAL.insertMany).not.toHaveBeenCalled();
  });

  test("refuses to re-role or remove a user without the user actions", async () => {
    const { service, deps } = buildService({ rules: identityManager });
    const users = { ...withoutIdentity, userIds: [OTHER_USER_ID] };

    await expect(
      service.updateProductMemberRoles({ projectId: PROJECT_ID, ...users, roles: [ProjectMembershipRole.Admin], ctx })
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.revokeProductMembers({ projectId: PROJECT_ID, ...users, ctx })).rejects.toBeInstanceOf(
      ForbiddenError
    );
    expect(deps.membershipDAL.delete).not.toHaveBeenCalled();
  });

  test("lists as addable only the kinds the caller can both read and add", async () => {
    const { service, deps } = buildService({ rules: identityManager });

    await service.listAvailableProductMembers({ projectId: PROJECT_ID, limit: 10, offset: 0, ctx });
    expect(deps.agentVaultMemberDAL.findAvailableActors).toHaveBeenCalledWith(
      expect.objectContaining({ actorTypes: [AgentVaultMemberType.MachineIdentity] })
    );

    await expect(
      service.listAvailableProductMembers({
        projectId: PROJECT_ID,
        actorType: AgentVaultMemberType.User,
        limit: 10,
        offset: 0,
        ctx
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("assigning a role is bounded like Secrets Management's membership routes", () => {
  const identityManager = [
    ProjectPermissionIdentityActions.Read,
    ProjectPermissionIdentityActions.Create,
    ProjectPermissionIdentityActions.Edit,
    ProjectPermissionIdentityActions.Delete
  ].map((action) => ({ action, subject: ProjectPermissionSub.Identity }));

  test.each([true, false])(
    "without assign-role, a role that manages identities can't add one, or give it a role (new system: %s)",
    async (shouldUseNewPrivilegeSystem) => {
      const { service, deps } = buildService({
        productMemberships: [{ id: "mem-1" }],
        adminMembershipIds: ["mem-other"],
        rules: identityManager,
        shouldUseNewPrivilegeSystem
      });

      await expect(
        service.addProductMembers({ projectId: PROJECT_ID, ...addIds, roles: [ProjectMembershipRole.Member], ctx })
      ).rejects.toThrow("Failed to add the member with this role");
      await expect(
        service.updateProductMemberRoles({
          projectId: PROJECT_ID,
          ...addIds,
          roles: [ProjectMembershipRole.Member],
          ctx
        })
      ).rejects.toThrow(
        // The new system checks assign-role on the member before the role it gives; the legacy one compares the role.
        shouldUseNewPrivilegeSystem
          ? "Failed to change the role of a more privileged member"
          : "Failed to give the member this role"
      );
      expect(deps.membershipDAL.insertMany).not.toHaveBeenCalled();
      expect(deps.membershipRoleDAL.insertMany).not.toHaveBeenCalled();
    }
  );

  test("only an admin gives the admin role, or changes or removes an admin, whatever else a role can do", async () => {
    const { service, deps } = buildService({
      productMemberships: [{ id: "mem-1" }],
      adminMembershipIds: ["mem-1", "mem-other"],
      rules: [
        ...identityManager,
        { action: ProjectPermissionIdentityActions.AssignRole, subject: ProjectPermissionSub.Identity }
      ],
      shouldUseNewPrivilegeSystem: true
    });

    await expect(
      service.addProductMembers({ projectId: PROJECT_ID, ...addIds, roles: [ProjectMembershipRole.Admin], ctx })
    ).rejects.toThrow("Only an Agent Vault admin can give the admin role.");
    await expect(
      service.updateProductMemberRoles({
        projectId: PROJECT_ID,
        ...addIds,
        roles: [ProjectMembershipRole.NoAccess],
        ctx
      })
    ).rejects.toThrow("Only an Agent Vault admin can change or remove another admin.");
    await expect(service.revokeProductMembers({ projectId: PROJECT_ID, ...addIds, ctx })).rejects.toThrow(
      "Only an Agent Vault admin can change or remove another admin."
    );
    expect(deps.membershipDAL.insertMany).not.toHaveBeenCalled();
    expect(deps.membershipDAL.delete).not.toHaveBeenCalled();
  });

  test("No Access can't sit beside another role, and an unknown role is refused", async () => {
    const { service } = buildService();

    await expect(
      service.addProductMembers({
        projectId: PROJECT_ID,
        ...addIds,
        roles: [ProjectMembershipRole.NoAccess, ProjectMembershipRole.Admin],
        ctx
      })
    ).rejects.toThrow("No Access can't be given together with another role.");
    await expect(service.addProductMembers({ projectId: PROJECT_ID, ...addIds, roles: ["nope"], ctx })).rejects.toThrow(
      "This project has no role 'nope'."
    );
  });

  test.each([true, false])(
    "an Agent Vault admin still promotes (new system: %s)",
    async (shouldUseNewPrivilegeSystem) => {
      const { service, deps } = buildService({
        productMemberships: [{ id: "mem-1" }],
        adminMembershipIds: ["mem-other"],
        shouldUseNewPrivilegeSystem
      });
      await service.updateProductMemberRoles({
        projectId: PROJECT_ID,
        ...addIds,
        roles: [ProjectMembershipRole.Admin],
        ctx
      });
      expect(deps.membershipRoleDAL.insertMany).toHaveBeenCalled();
    }
  );
});
