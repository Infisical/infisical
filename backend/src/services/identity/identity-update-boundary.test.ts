import { createMongoAbility, MongoAbility } from "@casl/ability";
import { vi } from "vitest";

import { OrgMembershipRole } from "@app/db/schemas";
import {
  orgAdminPermissions,
  orgMemberPermissions,
  orgNoAccessPermissions,
  OrgPermissionIdentityActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { PermissionBoundaryError } from "@app/lib/errors";

import { identityServiceFactory } from "./identity-service";

// Reaches for the instance server config, which has nothing to do with the boundary under test.
vi.mock("../super-admin/super-admin-fns", () => ({
  validateIdentityUpdateForSuperAdminPrivileges: vi.fn()
}));

// updateIdentity bounds the change against the role coming in, and deleteIdentity bounded nothing at
// all. On the legacy system the incoming NoAccess role resolves to an empty rule set, so that first
// comparison is vacuous -- which left `identity:edit` alone enough to strip an Admin identity.

const ORG_ID = "org-id";
const IDENTITY_ID = "identity-id";
const MEMBERSHIP_ID = "identity-membership-id";

const admin = createMongoAbility<MongoAbility>(orgAdminPermissions);
const member = createMongoAbility<MongoAbility>(orgMemberPermissions);
const noAccess = createMongoAbility<MongoAbility>(orgNoAccessPermissions);

// Exactly what the guards' throwUnlessCan demands, plus the grant they need on the new system.
const identityEditorOnly = createMongoAbility<MongoAbility>([
  {
    action: [
      OrgPermissionIdentityActions.Read,
      OrgPermissionIdentityActions.Edit,
      OrgPermissionIdentityActions.Delete,
      OrgPermissionIdentityActions.GrantPrivileges
    ],
    subject: OrgPermissionSubjects.Identity
  }
]);

const abilityByRole: Record<string, MongoAbility> = {
  [OrgMembershipRole.Admin]: admin,
  [OrgMembershipRole.Member]: member,
  [OrgMembershipRole.NoAccess]: noAccess
};

const createService = ({
  actorPermission,
  shouldUseNewPrivilegeSystem,
  currentRole = OrgMembershipRole.Admin
}: {
  actorPermission: MongoAbility;
  shouldUseNewPrivilegeSystem: boolean;
  currentRole?: string;
}) => {
  const membershipRoleDAL = {
    create: vi.fn(),
    delete: vi.fn(),
    findRolesByMembershipIds: vi.fn().mockResolvedValue([{ membershipId: MEMBERSHIP_ID, role: currentRole }])
  };
  const identityDAL = {
    findById: vi.fn().mockResolvedValue({ id: IDENTITY_ID, orgId: ORG_ID, projectId: null }),
    deleteById: vi.fn().mockResolvedValue({ id: IDENTITY_ID, orgId: ORG_ID }),
    updateById: vi.fn().mockResolvedValue({ id: IDENTITY_ID, orgId: ORG_ID }),
    transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => cb({}))
  };

  const service = identityServiceFactory({
    permissionService: {
      getOrgPermission: vi.fn().mockResolvedValue({ permission: actorPermission }),
      getOrgPermissionByRoles: vi
        .fn()
        .mockImplementation((roles: string[]) => roles.map((role) => ({ permission: abilityByRole[role] })))
    } as never,
    licenseService: { getPlan: vi.fn().mockResolvedValue({ rbac: true }) } as never,
    orgDAL: {
      findById: vi.fn().mockResolvedValue({ id: ORG_ID, shouldUseNewPrivilegeSystem }),
      findEffectiveOrgMembership: vi.fn().mockResolvedValue({ id: MEMBERSHIP_ID, scopeOrgId: ORG_ID })
    } as never,
    membershipIdentityDAL: {
      getIdentityById: vi.fn().mockResolvedValue({
        id: MEMBERSHIP_ID,
        scopeOrgId: ORG_ID,
        roles: [{ role: currentRole }],
        identity: { id: IDENTITY_ID, orgId: ORG_ID, projectId: null, hasDeleteProtection: false }
      })
    } as never,
    membershipRoleDAL: membershipRoleDAL as never,
    identityDAL: identityDAL as never
  } as never);

  const actor = { actor: "user", actorId: "actor-id", actorAuthMethod: "email", actorOrgId: ORG_ID };

  return {
    update: (role: string) => service.updateIdentity({ id: IDENTITY_ID, role, ...actor } as never),
    remove: () => service.deleteIdentity({ id: IDENTITY_ID, ...actor } as never),
    membershipRoleDAL,
    identityDAL
  };
};

describe("identity service privilege boundary", () => {
  test("the actor holds identity:edit and identity:delete, so the plain permission check is not what rejects it", () => {
    expect(identityEditorOnly.can(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity)).toBe(true);
    expect(identityEditorOnly.can(OrgPermissionIdentityActions.Delete, OrgPermissionSubjects.Identity)).toBe(true);
  });

  test("on the legacy system, a weaker actor cannot strip an Admin identity to no-access", async () => {
    const { update, membershipRoleDAL } = createService({
      actorPermission: identityEditorOnly,
      shouldUseNewPrivilegeSystem: false
    });

    await expect(update(OrgMembershipRole.NoAccess)).rejects.toThrow(PermissionBoundaryError);
    expect(membershipRoleDAL.create).not.toHaveBeenCalled();
  });

  test("assigning a role the actor may grant is still bounded by what the identity holds", async () => {
    const { update } = createService({
      actorPermission: identityEditorOnly,
      shouldUseNewPrivilegeSystem: false
    });

    await expect(update(OrgMembershipRole.Member)).rejects.toThrow(PermissionBoundaryError);
  });

  test("on the legacy system, a weaker actor cannot delete an Admin identity", async () => {
    const { remove, identityDAL } = createService({
      actorPermission: identityEditorOnly,
      shouldUseNewPrivilegeSystem: false
    });

    await expect(remove()).rejects.toThrow(PermissionBoundaryError);
    expect(identityDAL.deleteById).not.toHaveBeenCalled();
  });

  test("nothing outranks the actor, so an ordinary no-access identity is let through", async () => {
    const { update } = createService({
      actorPermission: identityEditorOnly,
      shouldUseNewPrivilegeSystem: false,
      currentRole: OrgMembershipRole.NoAccess
    });

    await expect(update(OrgMembershipRole.NoAccess)).resolves.toBeDefined();
  });
});
