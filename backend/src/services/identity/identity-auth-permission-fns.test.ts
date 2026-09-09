import { createMongoAbility, MongoAbility } from "@casl/ability";

import { AccessScope } from "@app/db/schemas";
import { projectAdminPermissions, projectMemberPermissions } from "@app/ee/services/permission/default-roles";
import {
  orgAdminPermissions,
  orgMemberPermissions,
  OrgPermissionIdentityActions,
  OrgPermissionSet,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { PermissionBoundaryError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { assertIdentityAuthMutationAllowed } from "./identity-auth-permission-fns";

// Regression guard for the privilege boundary on identity auth-method mutations. Attach and update
// carried none, and revoke carried one only on its org branch, so on the legacy privilege system a
// principal holding `edit-auth` could repoint an identity that outranks it and authenticate as it.
// `orgEditAuthOnly` models the actor that made this reachable: a custom role with `edit-auth` but
// not full admin.

const orgAdmin = createMongoAbility<MongoAbility<OrgPermissionSet>>(orgAdminPermissions);
const orgMember = createMongoAbility<MongoAbility<OrgPermissionSet>>(orgMemberPermissions);
const orgEditAuthOnly = createMongoAbility<MongoAbility<OrgPermissionSet>>([
  { action: OrgPermissionIdentityActions.EditAuth, subject: OrgPermissionSubjects.Identity },
  { action: OrgPermissionIdentityActions.RevokeAuth, subject: OrgPermissionSubjects.Identity }
]);

const projectAdmin = createMongoAbility<MongoAbility<ProjectPermissionSet>>(projectAdminPermissions);
const projectMember = createMongoAbility<MongoAbility<ProjectPermissionSet>>(projectMemberPermissions);
const projectEditAuthOnly = createMongoAbility<MongoAbility<ProjectPermissionSet>>([
  { action: ProjectPermissionIdentityActions.EditAuth, subject: ProjectPermissionSub.Identity }
]);

type TScopeCall = { scope: AccessScope; orgId: string; projectId?: string };

const runBoundary = async ({
  shouldUseNewPrivilegeSystem = false,
  actorPermission,
  targetPermissions,
  projectId,
  scopeCalls = []
}: {
  shouldUseNewPrivilegeSystem?: boolean;
  actorPermission: MongoAbility;
  targetPermissions: MongoAbility[];
  projectId?: string;
  scopeCalls?: TScopeCall[];
}) => {
  const deps = {
    permissionService: {
      getOrgPermission: () => Promise.resolve({ permission: actorPermission }),
      getProjectPermission: () => Promise.resolve({ permission: actorPermission }),
      getOrgPermissionByRoles: () => Promise.resolve(targetPermissions.map((permission) => ({ permission }))),
      getProjectPermissionByRoles: () => Promise.resolve(targetPermissions.map((permission) => ({ permission })))
    },
    orgDAL: { findById: () => Promise.resolve({ shouldUseNewPrivilegeSystem }) },
    membershipIdentityDAL: {
      getIdentityById: ({ scopeData }: { scopeData: TScopeCall }) => {
        scopeCalls.push(scopeData);
        return Promise.resolve({ roles: [{ role: "member" }] });
      }
    }
  } as unknown as Parameters<typeof assertIdentityAuthMutationAllowed>[0];

  await assertIdentityAuthMutationAllowed(deps, {
    identityId: "identity-1",
    orgId: "org-1",
    projectId,
    action: OrgPermissionIdentityActions.EditAuth,
    baseMessage: "Failed to add token auth to identity with more privileged role",
    actor: ActorType.USER,
    actorId: "user-1",
    actorAuthMethod: null,
    actorOrgId: "org-1"
  });
};

describe("assertIdentityAuthMutationAllowed", () => {
  describe("organization-level identity", () => {
    test("an admin actor may configure a member identity's auth", async () => {
      await expect(runBoundary({ actorPermission: orgAdmin, targetPermissions: [orgMember] })).resolves.toBeUndefined();
    });

    test("an edit-auth-only actor may not configure an admin identity's auth", async () => {
      await expect(runBoundary({ actorPermission: orgEditAuthOnly, targetPermissions: [orgAdmin] })).rejects.toThrow(
        PermissionBoundaryError
      );
    });

    test("every role the target holds is bounded, not just the first", async () => {
      await expect(
        runBoundary({ actorPermission: orgAdmin, targetPermissions: [orgMember, orgAdmin] })
      ).resolves.toBeUndefined();
      await expect(
        runBoundary({ actorPermission: orgEditAuthOnly, targetPermissions: [orgEditAuthOnly, orgAdmin] })
      ).rejects.toThrow(PermissionBoundaryError);
    });

    test("the target's roles are resolved in organization scope", async () => {
      const scopeCalls: TScopeCall[] = [];
      await runBoundary({ actorPermission: orgAdmin, targetPermissions: [orgMember], scopeCalls });
      expect(scopeCalls).toEqual([{ scope: AccessScope.Organization, orgId: "org-1" }]);
    });

    test("holding the action is sufficient under the new privilege system", async () => {
      await expect(
        runBoundary({
          shouldUseNewPrivilegeSystem: true,
          actorPermission: orgEditAuthOnly,
          targetPermissions: [orgAdmin]
        })
      ).resolves.toBeUndefined();
      await expect(
        runBoundary({ shouldUseNewPrivilegeSystem: true, actorPermission: orgMember, targetPermissions: [orgMember] })
      ).rejects.toThrow(PermissionBoundaryError);
    });
  });

  describe("project-level identity", () => {
    test("an admin actor may configure a member identity's auth", async () => {
      await expect(
        runBoundary({ actorPermission: projectAdmin, targetPermissions: [projectMember], projectId: "project-1" })
      ).resolves.toBeUndefined();
    });

    test("an edit-auth-only actor may not configure an admin identity's auth", async () => {
      await expect(
        runBoundary({ actorPermission: projectEditAuthOnly, targetPermissions: [projectAdmin], projectId: "project-1" })
      ).rejects.toThrow(PermissionBoundaryError);
    });

    test("the target's roles are resolved in project scope", async () => {
      const scopeCalls: TScopeCall[] = [];
      await runBoundary({
        actorPermission: projectAdmin,
        targetPermissions: [projectMember],
        projectId: "project-1",
        scopeCalls
      });
      expect(scopeCalls).toEqual([{ scope: AccessScope.Project, orgId: "org-1", projectId: "project-1" }]);
    });

    test("holding the action is sufficient under the new privilege system", async () => {
      await expect(
        runBoundary({
          shouldUseNewPrivilegeSystem: true,
          actorPermission: projectEditAuthOnly,
          targetPermissions: [projectAdmin],
          projectId: "project-1"
        })
      ).resolves.toBeUndefined();
      await expect(
        runBoundary({
          shouldUseNewPrivilegeSystem: true,
          actorPermission: projectMember,
          targetPermissions: [projectMember],
          projectId: "project-1"
        })
      ).rejects.toThrow(PermissionBoundaryError);
    });
  });
});
