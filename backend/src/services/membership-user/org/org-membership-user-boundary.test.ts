import { createMongoAbility, MongoAbility } from "@casl/ability";
import { vi } from "vitest";

import { AccessScope } from "@app/db/schemas";
import {
  orgAdminPermissions,
  orgMemberPermissions,
  orgNoAccessPermissions,
  OrgPermissionMemberActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { PermissionBoundaryError } from "@app/lib/errors";

import { newOrgMembershipUserFactory } from "./org-membership-user-factory";

// The org update guard bounds a role change against the roles the target already holds, because a
// downgrade strips privileges as effectively as a removal does. Both privilege systems reject, but
// for different reasons: the legacy system compares privilege levels, while the new system asks for
// member:grant-privileges, which is deliberately not implied by the member:edit that the guard's own
// throwUnlessCan requires.

const ORG_ID = "org-id";
const TARGET_USER_ID = "target-user-id";

const admin = createMongoAbility<MongoAbility>(orgAdminPermissions);
const member = createMongoAbility<MongoAbility>(orgMemberPermissions);

// Exactly the grant the guard's throwUnlessCan demands, and nothing more: weaker than the target,
// so the boundary is the only thing left that can reject it.
const memberEditorOnly = createMongoAbility<MongoAbility>([
  { action: [OrgPermissionMemberActions.Read, OrgPermissionMemberActions.Edit], subject: OrgPermissionSubjects.Member }
]);

// Still weaker than an Admin target, but now holding the action the new system asks for. This is the
// pair that separates the two systems: the privilege comparison still rejects it, the action does not.
const memberPrivilegeGranter = createMongoAbility<MongoAbility>([
  {
    action: [
      OrgPermissionMemberActions.Read,
      OrgPermissionMemberActions.Edit,
      OrgPermissionMemberActions.GrantPrivileges
    ],
    subject: OrgPermissionSubjects.Member
  }
]);

// Holds the action that describes changing a member's activation, but not the one for assigning
// roles. The pair with memberPrivilegeGranter is what pins each operation to its own action.
const memberDeleter = createMongoAbility<MongoAbility>([
  {
    action: [OrgPermissionMemberActions.Read, OrgPermissionMemberActions.Edit, OrgPermissionMemberActions.Delete],
    subject: OrgPermissionSubjects.Member
  }
]);

const createGuard = ({
  actorPermission,
  shouldUseNewPrivilegeSystem,
  targetRole = "admin",
  incomingRole = "member",
  data
}: {
  actorPermission: MongoAbility;
  shouldUseNewPrivilegeSystem: boolean;
  targetRole?: string;
  incomingRole?: string;
  data?: Record<string, unknown>;
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
      data: data ?? { roles: [{ role: incomingRole, isTemporary: false }] }
    } as never);
};

describe("onUpdateMembershipUserGuard privilege boundary", () => {
  test("the actor holds member:edit, so the plain permission check is not what rejects it", () => {
    expect(memberEditorOnly.can(OrgPermissionMemberActions.Edit, OrgPermissionSubjects.Member)).toBe(true);
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

  test("member:grant-privileges is what the new system keys on, and only the new system", async () => {
    // Same actor on both runs. The new system accepts it because it holds the action; the legacy
    // system still rejects it because holding an action says nothing about out-ranking an Admin.
    await expect(
      createGuard({ actorPermission: memberPrivilegeGranter, shouldUseNewPrivilegeSystem: true })()
    ).resolves.toBeUndefined();

    await expect(
      createGuard({ actorPermission: memberPrivilegeGranter, shouldUseNewPrivilegeSystem: false })()
    ).rejects.toThrow(PermissionBoundaryError);
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

  // The guard ran one boundary keyed on member:grant-privileges for every field on the route, so a
  // deactivation was gated on a role-assignment permission. Each operation now keys on the action
  // that describes it, which for metadata is still grant-privileges: it feeds ABAC.
  describe("gating follows the operation being performed", () => {
    test("a metadata-only edit is bounded, because metadata drives ABAC", async () => {
      // Org member metadata is the {{identity.metadata.*}} attribute source that project policies
      // interpolate, so rewriting an Admin's metadata rewrites what their roles grant. member:edit
      // alone must not reach it.
      const metadataOnly = { roles: [], metadata: [{ key: "team", value: "platform" }] };

      await expect(
        createGuard({ actorPermission: memberEditorOnly, shouldUseNewPrivilegeSystem: false, data: metadataOnly })()
      ).rejects.toThrow(PermissionBoundaryError);

      await expect(
        createGuard({ actorPermission: memberEditorOnly, shouldUseNewPrivilegeSystem: true, data: metadataOnly })()
      ).rejects.toThrow(PermissionBoundaryError);

      // grant-privileges is the action that reaches it, and only on the new system.
      await expect(
        createGuard({
          actorPermission: memberPrivilegeGranter,
          shouldUseNewPrivilegeSystem: true,
          data: metadataOnly
        })()
      ).resolves.toBeUndefined();

      // member:delete does not: deactivating a member and rewriting their attributes are different
      // operations gated on different actions.
      await expect(
        createGuard({ actorPermission: memberDeleter, shouldUseNewPrivilegeSystem: true, data: metadataOnly })()
      ).rejects.toThrow(PermissionBoundaryError);
    });

    test("deactivation keys on member:delete, not member:grant-privileges", async () => {
      const deactivate = { roles: [], isActive: false };

      // Holds grant-privileges but not delete: it can assign roles, and that says nothing about
      // being allowed to cut off an Admin's access.
      await expect(
        createGuard({ actorPermission: memberPrivilegeGranter, shouldUseNewPrivilegeSystem: true, data: deactivate })()
      ).rejects.toThrow(PermissionBoundaryError);

      await expect(
        createGuard({ actorPermission: memberDeleter, shouldUseNewPrivilegeSystem: true, data: deactivate })()
      ).resolves.toBeUndefined();
    });

    test("reactivating a privileged member is bounded the same way", async () => {
      // Restoring an Admin's access is as much a privilege change as removing it, so it cannot be
      // the ungated direction of the same field.
      const reactivate = { roles: [], isActive: true };

      await expect(
        createGuard({ actorPermission: memberPrivilegeGranter, shouldUseNewPrivilegeSystem: true, data: reactivate })()
      ).rejects.toThrow(PermissionBoundaryError);

      await expect(
        createGuard({ actorPermission: memberDeleter, shouldUseNewPrivilegeSystem: true, data: reactivate })()
      ).resolves.toBeUndefined();
    });

    test("the legacy system still compares privilege levels, whatever the operation", async () => {
      // memberDeleter holds the action, which buys it nothing here: it is still weaker than an Admin.
      await expect(
        createGuard({
          actorPermission: memberDeleter,
          shouldUseNewPrivilegeSystem: false,
          data: { roles: [], isActive: false }
        })()
      ).rejects.toThrow(PermissionBoundaryError);
    });

    test("a role change and a deactivation in one request need both actions", async () => {
      const both = { roles: [{ role: "member", isTemporary: false }], isActive: false };

      // Each holds exactly one of the two actions, so neither can do both at once.
      await expect(
        createGuard({ actorPermission: memberPrivilegeGranter, shouldUseNewPrivilegeSystem: true, data: both })()
      ).rejects.toThrow(PermissionBoundaryError);

      await expect(
        createGuard({ actorPermission: memberDeleter, shouldUseNewPrivilegeSystem: true, data: both })()
      ).rejects.toThrow(PermissionBoundaryError);
    });
  });
});
