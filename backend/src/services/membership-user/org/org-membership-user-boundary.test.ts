import { createMongoAbility, MongoAbility } from "@casl/ability";
import { vi } from "vitest";

import { AccessScope } from "@app/db/schemas";
import {
  orgAdminPermissions,
  orgMemberPermissions,
  orgNoAccessPermissions,
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { PermissionBoundaryError } from "@app/lib/errors";

import { newOrgMembershipUserFactory } from "./org-membership-user-factory";

// The org update guard bounds a role change against the roles the target already holds, because a
// downgrade strips privileges as effectively as a removal does. Unlike the identity and group
// surfaces, this boundary applies on both privilege systems: the new system replaces a superset
// check with a dedicated `grant-privileges` action, and OrgPermissionSubjects.Member has no such
// action. Routing it through validatePrivilegeChangeOperation would collapse it to the
// `can(edit, member)` the guard's own throwUnlessCan already required, leaving no check at all.

const ORG_ID = "org-id";
const TARGET_USER_ID = "target-user-id";

const admin = createMongoAbility<MongoAbility>(orgAdminPermissions);
const member = createMongoAbility<MongoAbility>(orgMemberPermissions);

// Exactly the grant the guard's throwUnlessCan demands, and nothing more: weaker than the target,
// so the boundary is the only thing left that can reject it.
const memberEditorOnly = createMongoAbility<MongoAbility>([
  { action: [OrgPermissionActions.Read, OrgPermissionActions.Edit], subject: OrgPermissionSubjects.Member }
]);

const createGuard = ({
  actorPermission,
  shouldUseNewPrivilegeSystem,
  targetRole = "admin",
  incomingRole = "member"
}: {
  actorPermission: MongoAbility;
  shouldUseNewPrivilegeSystem: boolean;
  targetRole?: string;
  incomingRole?: string;
}) => {
  const abilityByRole: Record<string, MongoAbility> = {
    admin,
    member,
    "no-access": createMongoAbility<MongoAbility>(orgNoAccessPermissions)
  };

  const factory = newOrgMembershipUserFactory({
    permissionService: {
      getOrgPermission: vi.fn().mockResolvedValue({ permission: actorPermission }),
      getOrgPermissionByRoles: vi
        .fn()
        .mockImplementation((roles: string[]) => roles.map((role) => ({ permission: abilityByRole[role] })))
    } as never,
    orgDAL: { findById: vi.fn().mockResolvedValue({ id: ORG_ID, shouldUseNewPrivilegeSystem }) } as never,
    membershipUserDAL: { getUserById: vi.fn().mockResolvedValue({ roles: [{ role: targetRole }] }) } as never,
    tokenService: {} as never,
    userDAL: {} as never,
    smtpService: {} as never,
    userGroupMembershipDAL: {} as never,
    licenseService: {} as never,
    emailDomainDAL: {} as never,
    oidcConfigDAL: {} as never,
    samlConfigDAL: {} as never
  });

  return () =>
    factory.onUpdateMembershipUserGuard({
      permission: { type: "user", id: "actor-id", orgId: ORG_ID, authMethod: "email" },
      scopeData: { scope: AccessScope.Organization, orgId: ORG_ID },
      selector: { userId: TARGET_USER_ID },
      data: { roles: [{ role: incomingRole, isTemporary: false }] }
    } as never);
};

describe("onUpdateMembershipUserGuard privilege boundary", () => {
  test("the actor holds member:edit, so the plain permission check is not what rejects it", () => {
    expect(memberEditorOnly.can(OrgPermissionActions.Edit, OrgPermissionSubjects.Member)).toBe(true);
  });

  test("on the legacy system, a weaker actor cannot downgrade an Admin member", async () => {
    const guard = createGuard({ actorPermission: memberEditorOnly, shouldUseNewPrivilegeSystem: false });

    await expect(guard()).rejects.toThrow(PermissionBoundaryError);
  });

  test("on the new privilege system, the same actor and target are rejected too", async () => {
    const guard = createGuard({ actorPermission: memberEditorOnly, shouldUseNewPrivilegeSystem: true });

    await expect(guard()).rejects.toThrow(PermissionBoundaryError);
  });

  test("granting a role above the actor is rejected on both systems", async () => {
    await expect(
      createGuard({
        actorPermission: memberEditorOnly,
        shouldUseNewPrivilegeSystem: false,
        targetRole: "no-access",
        incomingRole: "admin"
      })()
    ).rejects.toThrow(PermissionBoundaryError);

    await expect(
      createGuard({
        actorPermission: memberEditorOnly,
        shouldUseNewPrivilegeSystem: true,
        targetRole: "no-access",
        incomingRole: "admin"
      })()
    ).rejects.toThrow(PermissionBoundaryError);
  });

  test("an admin actor is unaffected on either system", async () => {
    await expect(
      createGuard({ actorPermission: admin, shouldUseNewPrivilegeSystem: false })()
    ).resolves.toBeUndefined();
    await expect(createGuard({ actorPermission: admin, shouldUseNewPrivilegeSystem: true })()).resolves.toBeUndefined();
  });

  test("it is the target's privileges that reject, not the actor being weak", async () => {
    // Same weak actor, but nothing on either side outranks it: no-access is filtered out of the
    // target set entirely, and grants nothing when requested. The guard has to let this through,
    // or it would block every role change a non-admin can legitimately make.
    const guard = createGuard({
      actorPermission: memberEditorOnly,
      shouldUseNewPrivilegeSystem: false,
      targetRole: "no-access",
      incomingRole: "no-access"
    });

    await expect(guard()).resolves.toBeUndefined();
  });
});
