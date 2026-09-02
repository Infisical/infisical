import { createMongoAbility, MongoAbility } from "@casl/ability";
import { vi } from "vitest";

import { OrgMembershipRole } from "@app/db/schemas";
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

  const service = groupServiceFactory({
    permissionService: {
      getOrgPermission: vi.fn().mockResolvedValue({ permission: actorPermission }),
      getOrgPermissionByRoles: vi
        .fn()
        .mockImplementation((roles: string[]) => roles.map((role) => ({ permission: abilityByRole[role] })))
    } as never,
    licenseService: { getPlan: vi.fn().mockResolvedValue({ groups: true }) } as never,
    orgDAL: { findById: vi.fn().mockResolvedValue({ id: ORG_ID, shouldUseNewPrivilegeSystem }) } as never,
    groupDAL: {
      transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => cb({}))
    } as never,
    membershipGroupDAL: {
      getGroupById: vi.fn().mockResolvedValue({
        group: { id: GROUP_ID, orgId: ORG_ID, name: "the-group" },
        roles: [{ role: currentRole }]
      }),
      findOne: vi.fn().mockResolvedValue({ id: MEMBERSHIP_ID })
    } as never,
    membershipRoleDAL: membershipRoleDAL as never
  } as never);

  const run = () =>
    service.updateGroup({
      id: GROUP_ID,
      role: incomingRole,
      actor: "user",
      actorId: "actor-id",
      actorAuthMethod: "email",
      actorOrgId: ORG_ID
    } as never);

  return { run, membershipRoleDAL };
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

  test("nothing outranks the actor, so an ordinary no-access group is let through", async () => {
    const { run } = createUpdate({
      actorPermission: groupEditorOnly,
      shouldUseNewPrivilegeSystem: false,
      currentRole: OrgMembershipRole.NoAccess
    });

    await expect(run()).resolves.toEqual(expect.objectContaining({ id: GROUP_ID }));
  });
});
