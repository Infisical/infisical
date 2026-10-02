import { createMongoAbility, MongoAbility } from "@casl/ability";
import { vi } from "vitest";

import { AccessScope, ProjectMembershipRole } from "@app/db/schemas";
import {
  projectAdminPermissions,
  projectMemberPermissions,
  projectNoAccessPermissions
} from "@app/ee/services/permission/default-roles";
import { ProjectPermissionGroupActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { conditionsMatcher } from "@app/lib/casl";
import { PermissionBoundaryError } from "@app/lib/errors";

import { newProjectMembershipGroupFactory } from "./project-membership-group-factory";

// The loop that bounds the incoming roles skips NoAccess, so without a check against the roles the
// target already holds, downgrading a privileged group to no-access is the one role change nothing
// bounds -- and it strips the group's access as completely as removing it would.

const ORG_ID = "org-id";
const PROJECT_ID = "project-id";
const GROUP_ID = "group-id";

const admin = createMongoAbility<MongoAbility>(projectAdminPermissions);
const member = createMongoAbility<MongoAbility>(projectMemberPermissions);

// Exactly the grant the guard's throwUnlessCan demands, and nothing more.
const groupEditorOnly = createMongoAbility<MongoAbility>([
  {
    action: [ProjectPermissionGroupActions.Read, ProjectPermissionGroupActions.Edit],
    subject: ProjectPermissionSub.Groups
  }
]);

// Outranks the Member role, so the loop over the incoming roles has nothing to object to; only the
// roles the target already holds can reject this actor.
const memberWithGroupEdit = createMongoAbility<MongoAbility>([
  ...projectMemberPermissions,
  {
    action: [ProjectPermissionGroupActions.Read, ProjectPermissionGroupActions.Edit],
    subject: ProjectPermissionSub.Groups
  }
] as never);

// Holds groups:edit outright, but may only assign roles to groups whose name the glob reaches --
// "the-group" is outside it.
const contractorScopedEditor = createMongoAbility<MongoAbility>(
  [
    {
      action: [ProjectPermissionGroupActions.Read, ProjectPermissionGroupActions.Edit],
      subject: ProjectPermissionSub.Groups
    },
    {
      action: ProjectPermissionGroupActions.AssignRole,
      subject: ProjectPermissionSub.Groups,
      conditions: { groupName: { $glob: "contractor-*" } }
    }
  ] as never,
  { conditionsMatcher }
);

const createGuard = ({
  actorPermission,
  shouldUseNewPrivilegeSystem,
  targetRole = ProjectMembershipRole.Admin,
  incomingRole = ProjectMembershipRole.NoAccess
}: {
  actorPermission: MongoAbility;
  shouldUseNewPrivilegeSystem: boolean;
  targetRole?: string;
  incomingRole?: string;
}) => {
  const abilityByRole: Record<string, MongoAbility> = {
    [ProjectMembershipRole.Admin]: admin,
    [ProjectMembershipRole.Member]: member,
    [ProjectMembershipRole.NoAccess]: createMongoAbility<MongoAbility>(projectNoAccessPermissions)
  };

  const factory = newProjectMembershipGroupFactory({
    permissionService: {
      getProjectPermission: vi.fn().mockResolvedValue({ permission: actorPermission }),
      getProjectPermissionByRoles: vi.fn().mockImplementation((roles: string[]) =>
        roles.map((role) => ({
          permission: abilityByRole[role],
          role: { name: role, slug: role }
        }))
      )
    } as never,
    orgDAL: { findById: vi.fn().mockResolvedValue({ id: ORG_ID, shouldUseNewPrivilegeSystem }) } as never,
    projectDAL: { findById: vi.fn().mockResolvedValue({ id: PROJECT_ID, type: "secret-manager" }) } as never,
    groupDAL: { findById: vi.fn().mockResolvedValue({ id: GROUP_ID, name: "the-group" }) } as never,
    membershipGroupDAL: {
      findOne: vi.fn().mockResolvedValue({ id: "org-membership-id" }),
      getGroupById: vi.fn().mockResolvedValue({ roles: [{ role: targetRole }] })
    } as never
  });

  return () =>
    factory.onUpdateMembershipGroupGuard({
      permission: { type: "user", id: "actor-id", orgId: ORG_ID, authMethod: "email" },
      scopeData: { scope: AccessScope.Project, orgId: ORG_ID, projectId: PROJECT_ID },
      selector: { groupId: GROUP_ID },
      data: { roles: [{ role: incomingRole, isTemporary: false }] }
    } as never);
};

describe("onUpdateMembershipGroupGuard privilege boundary", () => {
  test("the actor holds groups:edit, so the plain permission check is not what rejects it", () => {
    expect(groupEditorOnly.can(ProjectPermissionGroupActions.Edit, ProjectPermissionSub.Groups)).toBe(true);
  });

  test("on the legacy system, a weaker actor cannot downgrade an Admin group to no-access", async () => {
    const guard = createGuard({ actorPermission: groupEditorOnly, shouldUseNewPrivilegeSystem: false });

    await expect(guard()).rejects.toThrow(PermissionBoundaryError);
  });

  test("downgrading to a role the actor may grant is still bounded by what the target holds", async () => {
    const guard = createGuard({
      actorPermission: memberWithGroupEdit,
      shouldUseNewPrivilegeSystem: false,
      incomingRole: ProjectMembershipRole.Member
    });

    await expect(guard()).rejects.toThrow(PermissionBoundaryError);
  });

  test("an admin can still downgrade an Admin group on either system", async () => {
    await expect(createGuard({ actorPermission: admin, shouldUseNewPrivilegeSystem: false })()).resolves.toMatchObject({
      group: { id: GROUP_ID }
    });
    await expect(createGuard({ actorPermission: admin, shouldUseNewPrivilegeSystem: true })()).resolves.toMatchObject({
      group: { id: GROUP_ID }
    });
  });

  test("a groupName-scoped actor cannot strip an out-of-scope Admin group down to no-access", async () => {
    const guard = createGuard({ actorPermission: contractorScopedEditor, shouldUseNewPrivilegeSystem: true });

    await expect(guard()).rejects.toThrow(PermissionBoundaryError);
  });

  test("nothing outranks the actor, so an ordinary downgrade is let through", async () => {
    const guard = createGuard({
      actorPermission: groupEditorOnly,
      shouldUseNewPrivilegeSystem: false,
      targetRole: ProjectMembershipRole.NoAccess,
      incomingRole: ProjectMembershipRole.NoAccess
    });

    await expect(guard()).resolves.toMatchObject({ group: { id: GROUP_ID } });
  });
});
