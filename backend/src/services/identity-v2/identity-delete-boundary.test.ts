import { createMongoAbility, MongoAbility } from "@casl/ability";
import { vi } from "vitest";

import { AccessScope, OrgMembershipRole, ProjectMembershipRole } from "@app/db/schemas";
import { projectAdminPermissions, projectNoAccessPermissions } from "@app/ee/services/permission/default-roles";
import {
  orgAdminPermissions,
  orgNoAccessPermissions,
  OrgPermissionIdentityActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { PermissionBoundaryError } from "@app/lib/errors";

import { newOrgIdentityFactory } from "./org/org-identity-factory";
import { newProjectIdentityFactory } from "./project/project-identity-factory";

// The v2 delete guards checked identity:delete and nothing else, so an actor holding that action
// could delete an identity that outranks it. The membership routes bound the same operation, so the
// v2 surface was the way around them.

const ORG_ID = "org-id";
const PROJECT_ID = "project-id";
const IDENTITY_ID = "identity-id";

const orgAbilityByRole: Record<string, MongoAbility> = {
  [OrgMembershipRole.Admin]: createMongoAbility<MongoAbility>(orgAdminPermissions),
  [OrgMembershipRole.NoAccess]: createMongoAbility<MongoAbility>(orgNoAccessPermissions)
};

const projectAbilityByRole: Record<string, MongoAbility> = {
  [ProjectMembershipRole.Admin]: createMongoAbility<MongoAbility>(projectAdminPermissions),
  [ProjectMembershipRole.NoAccess]: createMongoAbility<MongoAbility>(projectNoAccessPermissions)
};

// Exactly the grant each guard's throwUnlessCan demands, and nothing more.
const orgIdentityDeleter = createMongoAbility<MongoAbility>([
  {
    action: [OrgPermissionIdentityActions.Read, OrgPermissionIdentityActions.Delete],
    subject: OrgPermissionSubjects.Identity
  }
]);

const projectIdentityDeleter = createMongoAbility<MongoAbility>([
  {
    action: [ProjectPermissionIdentityActions.Read, ProjectPermissionIdentityActions.Delete],
    subject: ProjectPermissionSub.Identity
  }
]);

const createOrgGuard = ({
  actorPermission,
  shouldUseNewPrivilegeSystem,
  targetRole = OrgMembershipRole.Admin
}: {
  actorPermission: MongoAbility;
  shouldUseNewPrivilegeSystem: boolean;
  targetRole?: string;
}) => {
  const factory = newOrgIdentityFactory({
    permissionService: {
      getOrgPermission: vi.fn().mockResolvedValue({ permission: actorPermission }),
      getOrgPermissionByRoles: vi
        .fn()
        .mockImplementation((roles: string[]) => roles.map((role) => ({ permission: orgAbilityByRole[role] })))
    } as never,
    orgDAL: { findById: vi.fn().mockResolvedValue({ id: ORG_ID, shouldUseNewPrivilegeSystem }) } as never,
    membershipIdentityDAL: { getIdentityById: vi.fn().mockResolvedValue({ roles: [{ role: targetRole }] }) } as never
  });

  return () =>
    factory.onDeleteIdentityGuard({
      permission: { type: "user", id: "actor-id", orgId: ORG_ID, authMethod: "email" },
      scopeData: { scope: AccessScope.Organization, orgId: ORG_ID },
      selector: { identityId: IDENTITY_ID }
    } as never);
};

const createProjectGuard = ({
  actorPermission,
  shouldUseNewPrivilegeSystem,
  targetRole = ProjectMembershipRole.Admin
}: {
  actorPermission: MongoAbility;
  shouldUseNewPrivilegeSystem: boolean;
  targetRole?: string;
}) => {
  const factory = newProjectIdentityFactory({
    permissionService: {
      getProjectPermission: vi.fn().mockResolvedValue({ permission: actorPermission }),
      getProjectPermissionByRoles: vi
        .fn()
        .mockImplementation((roles: string[]) => roles.map((role) => ({ permission: projectAbilityByRole[role] })))
    } as never,
    orgDAL: { findById: vi.fn().mockResolvedValue({ id: ORG_ID, shouldUseNewPrivilegeSystem }) } as never,
    membershipIdentityDAL: { getIdentityById: vi.fn().mockResolvedValue({ roles: [{ role: targetRole }] }) } as never
  });

  return () =>
    factory.onDeleteIdentityGuard({
      permission: { type: "user", id: "actor-id", orgId: ORG_ID, authMethod: "email" },
      scopeData: { scope: AccessScope.Project, orgId: ORG_ID, projectId: PROJECT_ID },
      selector: { identityId: IDENTITY_ID }
    } as never);
};

describe("identity v2 delete guards privilege boundary", () => {
  test("the actor holds identity:delete, so the plain permission check is not what rejects it", () => {
    expect(orgIdentityDeleter.can(OrgPermissionIdentityActions.Delete, OrgPermissionSubjects.Identity)).toBe(true);
    expect(projectIdentityDeleter.can(ProjectPermissionIdentityActions.Delete, ProjectPermissionSub.Identity)).toBe(
      true
    );
  });

  test("on the legacy system, a weaker actor cannot delete an Admin identity", async () => {
    await expect(
      createOrgGuard({ actorPermission: orgIdentityDeleter, shouldUseNewPrivilegeSystem: false })()
    ).rejects.toThrow(PermissionBoundaryError);

    await expect(
      createProjectGuard({ actorPermission: projectIdentityDeleter, shouldUseNewPrivilegeSystem: false })()
    ).rejects.toThrow(PermissionBoundaryError);
  });

  test("an admin actor is unaffected", async () => {
    await expect(
      createOrgGuard({
        actorPermission: orgAbilityByRole[OrgMembershipRole.Admin],
        shouldUseNewPrivilegeSystem: false
      })()
    ).resolves.toBeUndefined();

    await expect(
      createProjectGuard({
        actorPermission: projectAbilityByRole[ProjectMembershipRole.Admin],
        shouldUseNewPrivilegeSystem: false
      })()
    ).resolves.toBeUndefined();
  });

  test("the new system keys on the action, so holding identity:delete is enough", async () => {
    await expect(
      createOrgGuard({ actorPermission: orgIdentityDeleter, shouldUseNewPrivilegeSystem: true })()
    ).resolves.toBeUndefined();

    await expect(
      createProjectGuard({ actorPermission: projectIdentityDeleter, shouldUseNewPrivilegeSystem: true })()
    ).resolves.toBeUndefined();
  });

  test("a target holding nothing that outranks the actor is let through on either system", async () => {
    await expect(
      createOrgGuard({
        actorPermission: orgIdentityDeleter,
        shouldUseNewPrivilegeSystem: false,
        targetRole: OrgMembershipRole.NoAccess
      })()
    ).resolves.toBeUndefined();

    await expect(
      createProjectGuard({
        actorPermission: projectIdentityDeleter,
        shouldUseNewPrivilegeSystem: false,
        targetRole: ProjectMembershipRole.NoAccess
      })()
    ).resolves.toBeUndefined();
  });
});
