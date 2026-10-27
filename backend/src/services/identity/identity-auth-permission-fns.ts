import { ForbiddenError, subject } from "@casl/ability";

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

// repointing an identity's auth or minting it a credential lets you log in as it, and listing its
// credentials shows what to attack. so you need the action, and on the legacy system you also have to
// out-rank every grant the target holds. the action check lives here because the legacy boundary alone
// passes for any target you cover, no-access identities included
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

  if (projectId) {
    const { permission } = await permissionService.getProjectPermission({
      actionProjectType: ActionProjectType.Any,
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      PROJECT_ACTION_BY_ORG_ACTION[action],
      subject(ProjectPermissionSub.Identity, { identityId })
    );
    if (shouldUseNewPrivilegeSystem) return;

    assertRoleSetBoundary({
      shouldUseNewPrivilegeSystem,
      opActions: PROJECT_ACTION_BY_ORG_ACTION[action],
      opSubject: ProjectPermissionSub.Identity,
      actorPermission: permission,
      targetPermissions: await permissionService.getActorGrantAbilities({
        scopeData: { scope: AccessScope.Project, orgId, projectId },
        actorId: identityId,
        actorType: ActorType.IDENTITY
      }),
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

  ForbiddenError.from(permission).throwUnlessCan(action, OrgPermissionSubjects.Identity);
  if (shouldUseNewPrivilegeSystem) return;

  assertRoleSetBoundary({
    shouldUseNewPrivilegeSystem,
    opActions: action,
    opSubject: OrgPermissionSubjects.Identity,
    actorPermission: permission,
    targetPermissions: await permissionService.getActorGrantAbilities({
      scopeData: { scope: AccessScope.Organization, orgId },
      actorId: identityId,
      actorType: ActorType.IDENTITY
    }),
    baseMessage
  });
};
