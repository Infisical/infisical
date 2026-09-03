import { createMongoAbility, MongoAbility } from "@casl/ability";
import { vi } from "vitest";

import { AccessScope, ProjectMembershipRole } from "@app/db/schemas";
import {
  projectAdminPermissions,
  projectMemberPermissions,
  projectNoAccessPermissions
} from "@app/ee/services/permission/default-roles";
import { ProjectPermissionMemberActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { conditionsMatcher } from "@app/lib/casl";
import { PermissionBoundaryError } from "@app/lib/errors";

import { newProjectMembershipUserFactory } from "./project-membership-user-factory";

// The loop that bounds the incoming roles skips NoAccess, so downgrading a privileged member to
// no-access is the one role change it never sees. Checking the roles the target already holds closes
// that, and for a condition-scoped actor only if it gets the same subject fields that loop passes.

const ORG_ID = "org-id";
const PROJECT_ID = "project-id";
const USER_ID = "user-id";
const TARGET_EMAIL = "alice@corp.example";

const admin = createMongoAbility<MongoAbility>(projectAdminPermissions);
const member = createMongoAbility<MongoAbility>(projectMemberPermissions);

// Exactly the grant the guard's throwUnlessCan demands, plus an assign-role rule that reaches only
// contractors -- alice@corp.example is out of scope for it.
const contractorScopedEditor = createMongoAbility<MongoAbility>(
  [
    {
      action: [ProjectPermissionMemberActions.Read, ProjectPermissionMemberActions.Edit],
      subject: ProjectPermissionSub.Member
    },
    {
      action: ProjectPermissionMemberActions.AssignRole,
      subject: ProjectPermissionSub.Member,
      conditions: { userEmail: { $glob: "*@contractors.example" } }
    }
  ] as never,
  { conditionsMatcher }
);

const createGuard = ({
  actorPermission,
  shouldUseNewPrivilegeSystem,
  targetRole = ProjectMembershipRole.Admin,
  incomingRole = ProjectMembershipRole.NoAccess,
  targetEmail = TARGET_EMAIL
}: {
  actorPermission: MongoAbility;
  shouldUseNewPrivilegeSystem: boolean;
  targetRole?: string;
  incomingRole?: string;
  targetEmail?: string;
}) => {
  const abilityByRole: Record<string, MongoAbility> = {
    [ProjectMembershipRole.Admin]: admin,
    [ProjectMembershipRole.Member]: member,
    [ProjectMembershipRole.NoAccess]: createMongoAbility<MongoAbility>(projectNoAccessPermissions)
  };

  const factory = newProjectMembershipUserFactory({
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
    userDAL: { findById: vi.fn().mockResolvedValue({ id: USER_ID, email: targetEmail }) } as never,
    membershipUserDAL: {
      find: vi.fn().mockResolvedValue([]),
      getUserById: vi.fn().mockResolvedValue({ roles: [{ role: targetRole }] })
    } as never,
    smtpService: { sendMail: vi.fn() } as never,
    projectAccessRequestDAL: { delete: vi.fn() } as never
  });

  return () =>
    factory.onUpdateMembershipUserGuard({
      permission: { type: "user", id: "actor-id", orgId: ORG_ID, authMethod: "email" },
      scopeData: { scope: AccessScope.Project, orgId: ORG_ID, projectId: PROJECT_ID },
      selector: { userId: USER_ID },
      data: { roles: [{ role: incomingRole, isTemporary: false }] }
    } as never);
};

describe("onUpdateMembershipUserGuard privilege boundary", () => {
  test("the actor holds member:edit, so the plain permission check is not what rejects it", () => {
    expect(contractorScopedEditor.can(ProjectPermissionMemberActions.Edit, ProjectPermissionSub.Member)).toBe(true);
  });

  test("a userEmail-scoped actor cannot strip an out-of-scope Admin down to no-access", async () => {
    const guard = createGuard({ actorPermission: contractorScopedEditor, shouldUseNewPrivilegeSystem: true });

    await expect(guard()).rejects.toThrow(PermissionBoundaryError);
  });

  test("the same actor can still change a member who is inside its scope", async () => {
    const guard = createGuard({
      actorPermission: contractorScopedEditor,
      shouldUseNewPrivilegeSystem: true,
      targetRole: ProjectMembershipRole.Member,
      targetEmail: "bob@contractors.example"
    });

    await expect(guard()).resolves.not.toThrow();
  });

  test("an admin can still downgrade an Admin member on either system", async () => {
    await expect(createGuard({ actorPermission: admin, shouldUseNewPrivilegeSystem: false })()).resolves.not.toThrow();
    await expect(createGuard({ actorPermission: admin, shouldUseNewPrivilegeSystem: true })()).resolves.not.toThrow();
  });
});
