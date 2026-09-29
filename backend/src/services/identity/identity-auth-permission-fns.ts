import { AccessScope, ActionProjectType, OrganizationActionScope } from "@app/db/schemas";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { assertRoleSetBoundary } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { TOrgDALFactory } from "@app/services/org/org-dal";

const PROJECT_ACTION_BY_ORG_ACTION = {
  [OrgPermissionIdentityActions.EditAuth]: ProjectPermissionIdentityActions.EditAuth,
  [OrgPermissionIdentityActions.RevokeAuth]: ProjectPermissionIdentityActions.RevokeAuth,
  [OrgPermissionIdentityActions.CreateToken]: ProjectPermissionIdentityActions.CreateToken,
  [OrgPermissionIdentityActions.GetToken]: ProjectPermissionIdentityActions.GetToken,
  [OrgPermissionIdentityActions.DeleteToken]: ProjectPermissionIdentityActions.DeleteToken
} as const;

type TIdentityAuthPermissionDeps = {
  permissionService: Pick<
    TPermissionServiceFactory,
    "getOrgPermission" | "getProjectPermission" | "getActorGrantAbilities"
  >;
  orgDAL: Pick<TOrgDALFactory, "findById">;
};

type TAssertIdentityAuthAccessAllowedDTO = {
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

// Repointing an identity's auth trust or minting a credential for it lets you authenticate as that
// identity, and enumerating its credential records tells you what to attack, so the actor has to
// out-rank every role the target holds. Only bites on the legacy privilege system: on the new one
// `assertRoleSetBoundary` reduces to the action check the caller already ran.
export const assertIdentityAuthAccessAllowed = async (
  { permissionService, orgDAL }: TIdentityAuthPermissionDeps,
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
  }: TAssertIdentityAuthAccessAllowedDTO
) => {
  const { shouldUseNewPrivilegeSystem } = await requestMemoize(requestMemoKeys.orgFindById(orgId), () =>
    orgDAL.findById(orgId)
  );

  const resolveTargetPermissions = async () => {
    if (shouldUseNewPrivilegeSystem) return [];

    return permissionService.getActorGrantAbilities({
      scopeData: projectId
        ? { scope: AccessScope.Project, orgId, projectId }
        : { scope: AccessScope.Organization, orgId },
      actorId: identityId,
      actorType: ActorType.IDENTITY
    });
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
