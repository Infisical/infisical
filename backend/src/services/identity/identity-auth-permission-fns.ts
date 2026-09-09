import { AccessScope, ActionProjectType, OrganizationActionScope } from "@app/db/schemas";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { assertRoleSetBoundary } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { resolveMembershipRoleSlugs } from "@app/services/membership/membership-fns";
import { TMembershipIdentityDALFactory } from "@app/services/membership-identity/membership-identity-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";

const PROJECT_ACTION_BY_ORG_ACTION = {
  [OrgPermissionIdentityActions.EditAuth]: ProjectPermissionIdentityActions.EditAuth,
  [OrgPermissionIdentityActions.RevokeAuth]: ProjectPermissionIdentityActions.RevokeAuth
} as const;

type TIdentityAuthPermissionDeps = {
  permissionService: Pick<
    TPermissionServiceFactory,
    "getOrgPermission" | "getProjectPermission" | "getOrgPermissionByRoles" | "getProjectPermissionByRoles"
  >;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "getIdentityById">;
};

type TAssertIdentityAuthMutationAllowedDTO = {
  identityId: string;
  orgId: string;
  projectId?: string | null;
  action: keyof typeof PROJECT_ACTION_BY_ORG_ACTION;
  baseMessage: string;
  actor: ActorType;
  actorId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
};

// Repointing an identity's auth trust lets you authenticate as that identity, so the actor has to
// out-rank every role the target holds. Only bites on the legacy privilege system: on the new one
// `assertRoleSetBoundary` reduces to the action check the caller already ran.
export const assertIdentityAuthMutationAllowed = async (
  { permissionService, orgDAL, membershipIdentityDAL }: TIdentityAuthPermissionDeps,
  {
    identityId,
    orgId,
    projectId,
    action,
    baseMessage,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TAssertIdentityAuthMutationAllowedDTO
) => {
  const { shouldUseNewPrivilegeSystem } = await requestMemoize(requestMemoKeys.orgFindById(orgId), () =>
    orgDAL.findById(orgId)
  );

  const resolveTargetPermissions = async () => {
    if (shouldUseNewPrivilegeSystem) return [];

    const targetMembership = await membershipIdentityDAL.getIdentityById({
      scopeData: projectId
        ? { scope: AccessScope.Project, orgId, projectId }
        : { scope: AccessScope.Organization, orgId },
      identityId
    });
    const targetRoles = targetMembership ? resolveMembershipRoleSlugs(targetMembership.roles) : [];

    const rolePermissions = projectId
      ? await permissionService.getProjectPermissionByRoles(targetRoles, projectId, { ignoreUnresolvedRoles: true })
      : await permissionService.getOrgPermissionByRoles(targetRoles, orgId, { ignoreUnresolvedRoles: true });

    return rolePermissions.map(({ permission: rolePermission }) => ({ permission: rolePermission }));
  };

  if (projectId) {
    const { permission } = await permissionService.getProjectPermission({
      actionProjectType: ActionProjectType.Any,
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });

    assertRoleSetBoundary({
      shouldUseNewPrivilegeSystem,
      opActions: PROJECT_ACTION_BY_ORG_ACTION[action],
      opSubject: ProjectPermissionSub.Identity,
      actorPermission: permission,
      targetPermissions: await resolveTargetPermissions(),
      baseMessage,
      subjectFields: { identityId }
    });
    return;
  }

  const { permission } = await permissionService.getOrgPermission({
    scope: OrganizationActionScope.Any,
    actor,
    actorId,
    orgId,
    actorAuthMethod,
    actorOrgId
  });

  assertRoleSetBoundary({
    shouldUseNewPrivilegeSystem,
    opActions: action,
    opSubject: OrgPermissionSubjects.Identity,
    actorPermission: permission,
    targetPermissions: await resolveTargetPermissions(),
    baseMessage
  });
};
