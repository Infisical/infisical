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
// not full admin. The target's role set comes from `getActorRoleSlugs`, which reads the same
// group-aware membership query the ability is built from, so a role held only through an identity
// group is bounded like a direct one.

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
const projectCreateTokenOnly = createMongoAbility<MongoAbility<ProjectPermissionSet>>([
  { action: ProjectPermissionIdentityActions.CreateToken, subject: ProjectPermissionSub.Identity }
]);

type TScopeCall = { scope: AccessScope; orgId: string; projectId?: string };
type TPrincipal = { actorId: string; actorType: ActorType };

const runBoundary = async ({
  shouldUseNewPrivilegeSystem = false,
  actorPermission,
  targetPermissions,
  projectId,
  action = OrgPermissionIdentityActions.EditAuth,
  scopeCalls = [],
  roleLookups = [],
  targetRoles = ["member"],
  resolvedRoles = [],
  principals = []
}: {
  shouldUseNewPrivilegeSystem?: boolean;
  actorPermission: MongoAbility;
  targetPermissions: MongoAbility[];
  projectId?: string;
  action?: OrgPermissionIdentityActions.EditAuth | OrgPermissionIdentityActions.CreateToken;
  scopeCalls?: TScopeCall[];
  roleLookups?: string[];
  targetRoles?: string[];
  resolvedRoles?: string[][];
  principals?: TPrincipal[];
}) => {
  const deps = {
    permissionService: {
      getOrgPermission: () => Promise.resolve({ permission: actorPermission }),
      getProjectPermission: () => Promise.resolve({ permission: actorPermission }),
      getOrgPermissionByRoles: (roles: string[]) => {
        roleLookups.push("org");
        resolvedRoles.push(roles);
        return Promise.resolve(targetPermissions.map((permission) => ({ permission })));
      },
      getProjectPermissionByRoles: (roles: string[]) => {
        roleLookups.push("project");
        resolvedRoles.push(roles);
        return Promise.resolve(targetPermissions.map((permission) => ({ permission })));
      },
      // Stands in for permissionDAL.getPermission, which returns direct and group-derived
      // memberships together, so a group-inherited role is indistinguishable from a direct one here.
      getActorRoleSlugs: ({ scopeData, actorId, actorType }: { scopeData: TScopeCall } & TPrincipal) => {
        scopeCalls.push(scopeData);
        principals.push({ actorId, actorType });
        return Promise.resolve(targetRoles);
      }
    },
    orgDAL: { findById: () => Promise.resolve({ shouldUseNewPrivilegeSystem }) }
  } as unknown as Parameters<typeof assertIdentityAuthMutationAllowed>[0];

  await assertIdentityAuthMutationAllowed(deps, {
    identityId: "identity-1",
    orgId: "org-1",
    projectId,
    action,
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

    // `actorId` in the DTO is the caller, so passing it here instead of the target would compare the
    // caller against itself and pass every time. Nothing else in this file would notice.
    test("the roles resolved are the target's, not the caller's", async () => {
      const principals: TPrincipal[] = [];
      await runBoundary({ actorPermission: orgAdmin, targetPermissions: [orgMember], principals });
      expect(principals).toEqual([{ actorId: "identity-1", actorType: ActorType.IDENTITY }]);
    });

    test("the whole effective role set is forwarded, group-inherited roles included", async () => {
      const resolvedRoles: string[][] = [];
      await expect(
        runBoundary({
          actorPermission: orgEditAuthOnly,
          targetPermissions: [orgAdmin],
          targetRoles: ["member", "admin"],
          resolvedRoles
        })
      ).rejects.toThrow(PermissionBoundaryError);
      expect(resolvedRoles).toEqual([["member", "admin"]]);
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

    test("the target is not looked up at all under the new privilege system", async () => {
      const scopeCalls: TScopeCall[] = [];
      const roleLookups: string[] = [];
      await runBoundary({
        shouldUseNewPrivilegeSystem: true,
        actorPermission: orgEditAuthOnly,
        targetPermissions: [orgAdmin],
        scopeCalls,
        roleLookups
      });
      expect(scopeCalls).toEqual([]);
      expect(roleLookups).toEqual([]);
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

    test("the roles resolved are the target's, not the caller's", async () => {
      const principals: TPrincipal[] = [];
      await runBoundary({
        actorPermission: projectAdmin,
        targetPermissions: [projectMember],
        projectId: "project-1",
        principals
      });
      expect(principals).toEqual([{ actorId: "identity-1", actorType: ActorType.IDENTITY }]);
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

    test("the target is not looked up at all under the new privilege system", async () => {
      const scopeCalls: TScopeCall[] = [];
      const roleLookups: string[] = [];
      await runBoundary({
        shouldUseNewPrivilegeSystem: true,
        actorPermission: projectEditAuthOnly,
        targetPermissions: [projectAdmin],
        projectId: "project-1",
        scopeCalls,
        roleLookups
      });
      expect(scopeCalls).toEqual([]);
      expect(roleLookups).toEqual([]);
    });
  });

  describe("credential issuance", () => {
    test("a create-token-only actor may not mint a credential for an admin identity", async () => {
      await expect(
        runBoundary({
          actorPermission: projectCreateTokenOnly,
          targetPermissions: [projectAdmin],
          projectId: "project-1",
          action: OrgPermissionIdentityActions.CreateToken
        })
      ).rejects.toThrow(PermissionBoundaryError);
      await expect(
        runBoundary({
          actorPermission: orgMember,
          targetPermissions: [orgAdmin],
          action: OrgPermissionIdentityActions.CreateToken
        })
      ).rejects.toThrow(PermissionBoundaryError);
    });

    test("an admin actor may mint a credential for a member identity", async () => {
      await expect(
        runBoundary({
          actorPermission: projectAdmin,
          targetPermissions: [projectMember],
          projectId: "project-1",
          action: OrgPermissionIdentityActions.CreateToken
        })
      ).resolves.toBeUndefined();
      await expect(
        runBoundary({
          actorPermission: orgAdmin,
          targetPermissions: [orgMember],
          action: OrgPermissionIdentityActions.CreateToken
        })
      ).resolves.toBeUndefined();
    });
  });
});
