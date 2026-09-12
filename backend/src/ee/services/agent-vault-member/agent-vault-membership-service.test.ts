import { describe, expect, test, vi } from "vitest";

import { AccessScope, ProjectMembershipRole } from "@app/db/schemas";
import { ActorType } from "@app/services/auth/auth-type";

import { agentVaultMembershipServiceFactory } from "./agent-vault-membership-service";

const ORG_ID = "org-1";
const PROJECT_ID = "project-1";
const OTHER_PROJECT_ID = "project-2";
const ACTOR_ID = "actor-1";
const IDENTITY_ID = "identity-1";

const ctx = {
  actor: ActorType.USER,
  actorId: ACTOR_ID,
  actorOrgId: ORG_ID,
  actorAuthMethod: undefined
} as unknown as Parameters<ReturnType<typeof agentVaultMembershipServiceFactory>["addProductMember"]>[0]["ctx"];

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
      find: vi.fn().mockResolvedValue([{ id: IDENTITY_ID, name: "agent", orgId: ORG_ID, projectId: identityProjectId }])
    },
    groupDAL: { find: vi.fn().mockResolvedValue([]) },
    userDAL: { find: vi.fn().mockResolvedValue([]) },
    userAliasDAL: { findBySsoExternalIds: vi.fn().mockResolvedValue([]) },
    orgDAL: {
      findById: vi.fn().mockResolvedValue({ id: ORG_ID, rootOrgId: null }),
      findEffectiveOrgMembership: vi.fn().mockResolvedValue({ isActive: true })
    },
    membershipDAL: {
      find: vi.fn(({ scope }: { scope: string }) =>
        Promise.resolve(scope === AccessScope.Project ? productMemberships : [])
      ),
      // assertWillRetainProjectAdmin takes an advisory lock through tx.raw, then counts live admins
      // with a query built off tx() itself. The chain answers with the fixture's admin count, so
      // adminMembershipIds still decides whether the guard lets the write through.
      transaction: vi.fn((cb: (tx: unknown) => unknown) => Promise.resolve(cb(buildTx(adminMembershipIds.length)))),
      create: vi.fn().mockResolvedValue({ id: "mem-new", createdAt: new Date() }),
      delete: vi.fn().mockResolvedValue(undefined),
      deleteById: vi.fn().mockResolvedValue(undefined)
    },
    membershipRoleDAL: {
      find: vi
        .fn()
        .mockResolvedValue(adminMembershipIds.map((id) => ({ membershipId: id, role: ProjectMembershipRole.Admin }))),
      create: vi.fn(({ role }: { role: string }) => Promise.resolve({ role })),
      delete: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined)
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
      service.addProductMember({
        projectId: PROJECT_ID,
        identityId: IDENTITY_ID,
        role: ProjectMembershipRole.Member,
        ctx
      })
    ).rejects.toThrow("belongs to another project");

    expect(deps.membershipDAL.create).not.toHaveBeenCalled();
  });

  test("accepts an identity that belongs to no project", async () => {
    const { service } = buildService({ identityProjectId: null });

    const added = await service.addProductMember({
      projectId: PROJECT_ID,
      identityId: IDENTITY_ID,
      role: ProjectMembershipRole.Member,
      ctx
    });

    expect(added.membershipId).toBe("mem-new");
  });

  test("accepts an identity created inside Agent Vault itself", async () => {
    const { service } = buildService({ identityProjectId: PROJECT_ID });

    const added = await service.addProductMember({
      projectId: PROJECT_ID,
      identityId: IDENTITY_ID,
      role: ProjectMembershipRole.Member,
      ctx
    });

    expect(added.membershipId).toBe("mem-new");
  });

  // Removing only the membership would leave the identity live but off every screen: this product's tab
  // lists by membership, and the organization list hides project-scoped identities.
  test("refuses to detach an identity Agent Vault owns, pointing at delete instead", async () => {
    const { service, deps } = buildService({ identityProjectId: PROJECT_ID });

    await expect(service.removeProductMember({ projectId: PROJECT_ID, identityId: IDENTITY_ID, ctx })).rejects.toThrow(
      "Delete the identity instead"
    );

    expect(deps.membershipDAL.deleteById).not.toHaveBeenCalled();
  });

  test("still detaches an identity the organization owns", async () => {
    const { service, deps } = buildService({
      identityProjectId: null,
      productMemberships: [{ id: "mem-1" }],
      adminMembershipIds: ["mem-other"]
    });

    await service.removeProductMember({ projectId: PROJECT_ID, identityId: IDENTITY_ID, ctx });

    expect(deps.membershipDAL.deleteById).toHaveBeenCalledWith("mem-1", expect.anything());
  });

  test("refuses to change your own role", async () => {
    const { service, deps } = buildService();

    await expect(
      service.updateProductMemberRole({
        projectId: PROJECT_ID,
        userId: ACTOR_ID,
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

    const updated = await service.updateProductMemberRole({
      projectId: PROJECT_ID,
      userId: "someone-else",
      role: ProjectMembershipRole.Member,
      ctx
    });

    expect(updated.role).toBe(ProjectMembershipRole.Member);
  });
});
