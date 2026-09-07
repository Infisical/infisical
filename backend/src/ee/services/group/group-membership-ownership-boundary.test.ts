import { createMongoAbility, MongoAbility } from "@casl/ability";
import { vi } from "vitest";

import { OrgMembershipRole } from "@app/db/schemas";
import { orgAdminPermissions } from "@app/ee/services/permission/org-permission";
import { ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

import { groupServiceFactory } from "./group-service";

// A group belongs to exactly one org. Linking it into a sub-org lends the sub-org the
// right to use the group, never the right to change who is in it, so every membership
// mutator has to compare groups.orgId against the actor's org. membershipGroupDAL
// filters on Membership.scopeOrgId and returns the group's real orgId untouched, which
// is what makes a linked group reachable here with a foreign orgId on it.

const ORG_ID = "org-id";
const PARENT_ORG_ID = "parent-org-id";
const GROUP_ID = "group-id";
const GROUP_SLUG = "the-group";
const USERNAME = "someone@example.com";
const IDENTITY_ID = "identity-id";

const OWNERSHIP_MESSAGE = /owned by a parent organization/;

const admin = createMongoAbility<MongoAbility>(orgAdminPermissions);

const createService = ({ groupOrgId }: { groupOrgId: string }) => {
  const userGroupMembershipDAL = {
    find: vi.fn().mockResolvedValue([]),
    filterProjectsByUserMembership: vi.fn().mockResolvedValue([]),
    insertMany: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue([])
  };
  const identityGroupMembershipDAL = {
    find: vi.fn().mockResolvedValue([]),
    insertMany: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue([])
  };
  const userDAL = { findOne: vi.fn().mockResolvedValue({ id: "user-id", username: USERNAME }) };
  const membershipDAL = { findOne: vi.fn().mockResolvedValue({ id: "identity-membership-id" }) };

  const service = groupServiceFactory({
    permissionService: {
      getOrgPermission: vi.fn().mockResolvedValue({ permission: admin }),
      getOrgPermissionByRoles: vi.fn().mockResolvedValue([{ permission: admin }])
    } as never,
    licenseService: { getPlan: vi.fn().mockResolvedValue({ groups: true }) } as never,
    orgDAL: {
      findById: vi.fn().mockResolvedValue({ id: ORG_ID, shouldUseNewPrivilegeSystem: false }),
      findMembership: vi.fn().mockResolvedValue([])
    } as never,
    groupDAL: {
      transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => cb({}))
    } as never,
    membershipGroupDAL: {
      getGroupById: vi.fn().mockResolvedValue({
        id: "group-membership-id",
        group: { id: GROUP_ID, orgId: groupOrgId, slug: GROUP_SLUG, name: GROUP_SLUG },
        roles: [{ role: OrgMembershipRole.Member }]
      }),
      transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => cb({}))
    } as never,
    membershipRoleDAL: { create: vi.fn(), delete: vi.fn() } as never,
    oidcConfigDAL: { findOne: vi.fn().mockResolvedValue(undefined) } as never,
    userDAL: userDAL as never,
    userGroupMembershipDAL: userGroupMembershipDAL as never,
    identityGroupMembershipDAL: identityGroupMembershipDAL as never,
    identityDAL: { find: vi.fn().mockResolvedValue([]) } as never,
    membershipDAL: membershipDAL as never,
    identityAccessTokenService: { bumpIdentityRevocationVersion: vi.fn() } as never,
    usageMeteringService: { emit: vi.fn() } as never,
    projectDAL: { find: vi.fn().mockResolvedValue([]) } as never,
    projectKeyDAL: { find: vi.fn().mockResolvedValue([]), delete: vi.fn() } as never,
    projectBotDAL: { findOne: vi.fn().mockResolvedValue(undefined) } as never,
    additionalPrivilegeDAL: { delete: vi.fn() } as never,
    alertChannelRecipientDAL: { delete: vi.fn() } as never
  } as never);

  const actor = { actor: "user", actorId: "actor-id", actorAuthMethod: "email", actorOrgId: ORG_ID };

  return {
    addUser: () => service.addUserToGroup({ id: GROUP_ID, username: USERNAME, ...actor } as never),
    removeUser: () => service.removeUserFromGroup({ id: GROUP_ID, username: USERNAME, ...actor } as never),
    addIdentity: () => service.addMachineIdentityToGroup({ id: GROUP_ID, identityId: IDENTITY_ID, ...actor } as never),
    removeIdentity: () =>
      service.removeMachineIdentityFromGroup({ id: GROUP_ID, identityId: IDENTITY_ID, ...actor } as never),
    userDAL,
    membershipDAL,
    userGroupMembershipDAL,
    identityGroupMembershipDAL
  };
};

// The locally owned cases run on past the ownership check into teardown this harness
// does not stand up, so they assert only that ownership is not what stopped them.
const expectNotBlockedByOwnership = async (fn: () => Promise<unknown>) => {
  await fn().catch((err: unknown) => {
    expect((err as Error).message).not.toMatch(OWNERSHIP_MESSAGE);
  });
};

describe("group membership ownership boundary", () => {
  describe.each([
    ["addUserToGroup", (s: ReturnType<typeof createService>) => s.addUser],
    ["removeUserFromGroup", (s: ReturnType<typeof createService>) => s.removeUser],
    ["addMachineIdentityToGroup", (s: ReturnType<typeof createService>) => s.addIdentity],
    ["removeMachineIdentityFromGroup", (s: ReturnType<typeof createService>) => s.removeIdentity]
  ])("%s", (_name, pick) => {
    test("refuses a group owned by another organization", async () => {
      const svc = createService({ groupOrgId: PARENT_ORG_ID });

      await expect(pick(svc)()).rejects.toThrow(ForbiddenRequestError);
      await expect(pick(svc)()).rejects.toThrow(OWNERSHIP_MESSAGE);
    });

    test("allows a group the actor's own organization owns", async () => {
      const svc = createService({ groupOrgId: ORG_ID });

      await expectNotBlockedByOwnership(pick(svc));
    });

    test("writes nothing when it refuses", async () => {
      const svc = createService({ groupOrgId: PARENT_ORG_ID });

      // Assert the refusal came from ownership first. Without it the DAL
      // expectations below hold for any early failure and prove nothing.
      const err = await pick(svc)().then(
        () => null,
        (e: unknown) => e
      );
      expect((err as Error | null)?.message).toMatch(OWNERSHIP_MESSAGE);

      expect(svc.userGroupMembershipDAL.insertMany).not.toHaveBeenCalled();
      expect(svc.userGroupMembershipDAL.delete).not.toHaveBeenCalled();
      expect(svc.identityGroupMembershipDAL.insertMany).not.toHaveBeenCalled();
      expect(svc.identityGroupMembershipDAL.delete).not.toHaveBeenCalled();
    });

    test("refuses before it resolves the subject, so ownership is checked first", async () => {
      const svc = createService({ groupOrgId: PARENT_ORG_ID });

      await pick(svc)().catch(() => undefined);

      expect(svc.userDAL.findOne).not.toHaveBeenCalled();
      expect(svc.membershipDAL.findOne).not.toHaveBeenCalled();
    });

    test("names the group so the caller can tell which one it was", async () => {
      const svc = createService({ groupOrgId: PARENT_ORG_ID });

      await expect(pick(svc)()).rejects.toThrow(new RegExp(GROUP_SLUG));
    });

    test("does not leak the owning organization's id", async () => {
      const svc = createService({ groupOrgId: PARENT_ORG_ID });

      const err = await pick(svc)().then(
        () => null,
        (e: unknown) => e
      );
      expect((err as Error | null)?.message).toMatch(OWNERSHIP_MESSAGE);
      expect((err as Error).message).not.toContain(PARENT_ORG_ID);
    });
  });

  // A group with no membership row in the actor's org must stay a 404: the ownership
  // check only ever runs on groups the caller can already legitimately see, so it
  // cannot be used to confirm that group ids exist in an org the caller cannot reach.
  test("a group the actor's org has no membership row for is still not found", async () => {
    const service = groupServiceFactory({
      permissionService: {
        getOrgPermission: vi.fn().mockResolvedValue({ permission: admin })
      } as never,
      membershipGroupDAL: { getGroupById: vi.fn().mockResolvedValue(undefined) } as never
    } as never);

    const actor = { actor: "user", actorId: "actor-id", actorAuthMethod: "email", actorOrgId: ORG_ID };

    await expect(service.addUserToGroup({ id: GROUP_ID, username: USERNAME, ...actor } as never)).rejects.toThrow(
      NotFoundError
    );
    await expect(service.removeUserFromGroup({ id: GROUP_ID, username: USERNAME, ...actor } as never)).rejects.toThrow(
      NotFoundError
    );
    await expect(
      service.addMachineIdentityToGroup({ id: GROUP_ID, identityId: IDENTITY_ID, ...actor } as never)
    ).rejects.toThrow(NotFoundError);
    await expect(
      service.removeMachineIdentityFromGroup({ id: GROUP_ID, identityId: IDENTITY_ID, ...actor } as never)
    ).rejects.toThrow(NotFoundError);
  });
});
