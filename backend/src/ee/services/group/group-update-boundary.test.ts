import { createMongoAbility, MongoAbility } from "@casl/ability";
import { vi } from "vitest";

import { OrgMembershipRole } from "@app/db/schemas";
import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import {
  orgAdminPermissions,
  orgMemberPermissions,
  orgNoAccessPermissions,
  OrgPermissionGroupActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { PermissionBoundaryError } from "@app/lib/errors";

import { groupServiceFactory } from "./group-service";

// updateGroup bounds the change against the role coming in, never the role the group already holds.
// On the legacy system the incoming NoAccess role resolves to an empty rule set, so that comparison
// is vacuous -- which left `groups:edit` alone enough to strip an Admin group of its access.

const ORG_ID = "org-id";
const GROUP_ID = "group-id";
const MEMBERSHIP_ID = "group-membership-id";

const admin = createMongoAbility<MongoAbility>(orgAdminPermissions);
const member = createMongoAbility<MongoAbility>(orgMemberPermissions);
const noAccess = createMongoAbility<MongoAbility>(orgNoAccessPermissions);

// Exactly what the guard's throwUnlessCan demands, plus the grant it needs on the new system.
const groupEditorOnly = createMongoAbility<MongoAbility>([
  {
    action: [OrgPermissionGroupActions.Read, OrgPermissionGroupActions.Edit, OrgPermissionGroupActions.GrantPrivileges],
    subject: OrgPermissionSubjects.Groups
  }
]);

// deleteGroup's own throwUnlessCan demands Delete, which the editor ability above deliberately lacks.
const groupDeleterOnly = createMongoAbility<MongoAbility>([
  {
    action: [
      OrgPermissionGroupActions.Read,
      OrgPermissionGroupActions.Edit,
      OrgPermissionGroupActions.Delete,
      OrgPermissionGroupActions.GrantPrivileges
    ],
    subject: OrgPermissionSubjects.Groups
  }
]);

const groupRenamerOnly = createMongoAbility<MongoAbility>([
  {
    action: [OrgPermissionGroupActions.Read, OrgPermissionGroupActions.Edit, OrgPermissionGroupActions.AddMembers],
    subject: OrgPermissionSubjects.Groups
  }
]);

const CURRENT_NAME = "the-group";

const createUpdate = ({
  actorPermission,
  shouldUseNewPrivilegeSystem,
  currentRole = OrgMembershipRole.Admin,
  incomingRole = OrgMembershipRole.NoAccess
}: {
  actorPermission: MongoAbility;
  shouldUseNewPrivilegeSystem: boolean;
  currentRole?: string;
  incomingRole?: string;
}) => {
  const abilityByRole: Record<string, MongoAbility> = {
    [OrgMembershipRole.Admin]: admin,
    [OrgMembershipRole.Member]: member,
    [OrgMembershipRole.NoAccess]: noAccess
  };

  const membershipRoleDAL = { create: vi.fn(), delete: vi.fn() };
  const groupDAL = {
    transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => cb({})),
    update: vi
      .fn()
      .mockImplementation(async (_filter: unknown, data: { name?: string }) => [
        { id: GROUP_ID, orgId: ORG_ID, name: data.name ?? CURRENT_NAME }
      ])
  };

  const service = groupServiceFactory({
    permissionService: {
      getOrgPermission: vi.fn().mockResolvedValue({ permission: actorPermission }),
      getOrgPermissionByRoles: vi
        .fn()
        .mockImplementation((roles: string[]) => roles.map((role) => ({ permission: abilityByRole[role] })))
    } as never,
    licenseService: new FakeLicenseService().setPlan(ORG_ID, { groups: true }),
    orgDAL: { findById: vi.fn().mockResolvedValue({ id: ORG_ID, shouldUseNewPrivilegeSystem }) } as never,
    groupDAL: groupDAL as never,
    membershipGroupDAL: {
      getGroupById: vi.fn().mockResolvedValue({
        group: { id: GROUP_ID, orgId: ORG_ID, name: CURRENT_NAME },
        roles: [{ role: currentRole }]
      }),
      findOne: vi.fn().mockResolvedValue({ id: MEMBERSHIP_ID })
    } as never,
    membershipRoleDAL: membershipRoleDAL as never
  } as never);

  const actor = { actor: "user", actorId: "actor-id", actorAuthMethod: "email", actorOrgId: ORG_ID };

  const edit = (fields: { name?: string; slug?: string; role?: string }) =>
    service.updateGroup({ id: GROUP_ID, ...fields, ...actor } as never);
  const run = () => edit({ role: incomingRole });
  const remove = () => service.deleteGroup({ id: GROUP_ID, ...actor } as never);

  return { run, remove, edit, membershipRoleDAL, groupDAL };
};

// deleteGroup runs on past the boundary into the teardown this harness does not stand up, so the
// pass-through cases assert only that the boundary is not what stopped them.
const expectNoBoundaryError = async (fn: () => Promise<unknown>) => {
  await fn().catch((err: unknown) => {
    expect(err).not.toBeInstanceOf(PermissionBoundaryError);
  });
};

describe("updateGroup privilege boundary", () => {
  test("the actor holds groups:edit, so the plain permission check is not what rejects it", () => {
    expect(groupEditorOnly.can(OrgPermissionGroupActions.Edit, OrgPermissionSubjects.Groups)).toBe(true);
  });

  test("on the legacy system, a weaker actor cannot strip an Admin group to no-access", async () => {
    const { run, membershipRoleDAL } = createUpdate({
      actorPermission: groupEditorOnly,
      shouldUseNewPrivilegeSystem: false
    });

    await expect(run()).rejects.toThrow(PermissionBoundaryError);
    expect(membershipRoleDAL.create).not.toHaveBeenCalled();
  });

  test("downgrading to a role the actor may grant is still bounded by what the group holds", async () => {
    const { run } = createUpdate({
      actorPermission: groupEditorOnly,
      shouldUseNewPrivilegeSystem: false,
      incomingRole: OrgMembershipRole.Member
    });

    await expect(run()).rejects.toThrow(PermissionBoundaryError);
  });

  test("an admin can still change an Admin group's role on either system", async () => {
    await expect(createUpdate({ actorPermission: admin, shouldUseNewPrivilegeSystem: false }).run()).resolves.toEqual(
      expect.objectContaining({ id: GROUP_ID })
    );
    await expect(createUpdate({ actorPermission: admin, shouldUseNewPrivilegeSystem: true }).run()).resolves.toEqual(
      expect.objectContaining({ id: GROUP_ID })
    );
  });

  test("on the legacy system, a weaker actor cannot delete an Admin-role group", async () => {
    const { remove } = createUpdate({ actorPermission: groupDeleterOnly, shouldUseNewPrivilegeSystem: false });

    await expect(remove()).rejects.toThrow(PermissionBoundaryError);
  });

  test("deleting a group nothing outranks the actor on clears the boundary", async () => {
    const { remove } = createUpdate({
      actorPermission: groupDeleterOnly,
      shouldUseNewPrivilegeSystem: false,
      currentRole: OrgMembershipRole.NoAccess
    });

    await expectNoBoundaryError(remove);
  });

  test("an admin actor clears the delete boundary", async () => {
    const { remove } = createUpdate({ actorPermission: admin, shouldUseNewPrivilegeSystem: false });

    await expectNoBoundaryError(remove);
  });

  test("nothing outranks the actor, so an ordinary no-access group is let through", async () => {
    const { run } = createUpdate({
      actorPermission: groupEditorOnly,
      shouldUseNewPrivilegeSystem: false,
      currentRole: OrgMembershipRole.NoAccess
    });

    await expect(run()).resolves.toEqual(expect.objectContaining({ id: GROUP_ID }));
  });
});

describe("updateGroup rename boundary", () => {
  test("on the new system, renaming without add-members is rejected", async () => {
    const { edit, groupDAL } = createUpdate({ actorPermission: groupEditorOnly, shouldUseNewPrivilegeSystem: true });

    await expect(edit({ name: "Admins" })).rejects.toThrow(PermissionBoundaryError);
    expect(groupDAL.update).not.toHaveBeenCalled();
  });

  test("on the new system, add-members lets the rename through", async () => {
    const { edit, groupDAL } = createUpdate({ actorPermission: groupRenamerOnly, shouldUseNewPrivilegeSystem: true });

    await expect(edit({ name: "Admins" })).resolves.toEqual(expect.objectContaining({ name: "Admins" }));
    expect(groupDAL.update).toHaveBeenCalled();
  });

  test("on the legacy system, a weaker actor cannot rename an Admin group", async () => {
    const { edit, groupDAL } = createUpdate({ actorPermission: groupEditorOnly, shouldUseNewPrivilegeSystem: false });

    await expect(edit({ name: "Admins" })).rejects.toThrow(PermissionBoundaryError);
    expect(groupDAL.update).not.toHaveBeenCalled();
  });

  test("a role change that resends the current name is not treated as a rename", async () => {
    const { edit, membershipRoleDAL } = createUpdate({
      actorPermission: groupEditorOnly,
      shouldUseNewPrivilegeSystem: true
    });

    await expect(
      edit({ name: CURRENT_NAME, slug: "the-group", role: OrgMembershipRole.Member })
    ).resolves.toBeDefined();
    expect(membershipRoleDAL.create).toHaveBeenCalled();
  });

  test("a slug-only change is not bounded, since sync matches on name", async () => {
    const { edit, groupDAL } = createUpdate({ actorPermission: groupEditorOnly, shouldUseNewPrivilegeSystem: true });

    await expect(edit({ slug: "new-slug" })).resolves.toBeDefined();
    expect(groupDAL.update).toHaveBeenCalled();
  });
});
