import { ForbiddenError, subject } from "@casl/ability";

import { AccessScope, ActionProjectType } from "@app/db/schemas";
import { assertRoleSetBoundary } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { InternalServerError } from "@app/lib/errors";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { resolveMembershipRoleSlugs } from "@app/services/membership/membership-fns";
import { TMembershipIdentityDALFactory } from "@app/services/membership-identity/membership-identity-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { TIdentityV2Factory } from "../identity-types";

type TProjectIdentityFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getProjectPermissionByRoles">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "getIdentityById">;
};

export const newProjectIdentityFactory = ({
  permissionService,
  orgDAL,
  membershipIdentityDAL
}: TProjectIdentityFactoryDep): TIdentityV2Factory => {
  const getScopeField: TIdentityV2Factory["getScopeField"] = (scopeData) => {
    if (scopeData.scope === AccessScope.Project) {
      return { key: "projectId" as const, value: scopeData.projectId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the project factory" });
  };

  const onCreateIdentityGuard: TIdentityV2Factory["onCreateIdentityGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Create,
      ProjectPermissionSub.Identity
    );
  };

  const onUpdateIdentityGuard: TIdentityV2Factory["onUpdateIdentityGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Edit,
      subject(ProjectPermissionSub.Identity, { identityId: dto.selector.identityId })
    );
  };

  const onDeleteIdentityGuard: TIdentityV2Factory["onDeleteIdentityGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Delete,
      subject(ProjectPermissionSub.Identity, { identityId: dto.selector.identityId })
    );

    const targetMembership = await membershipIdentityDAL.getIdentityById({
      scopeData: dto.scopeData,
      identityId: dto.selector.identityId
    });
    const targetRoles = targetMembership ? resolveMembershipRoleSlugs(targetMembership.roles) : [];
    const targetPermissions = await permissionService.getProjectPermissionByRoles(targetRoles, scope.value, {
      ignoreUnresolvedRoles: true
    });
    const { shouldUseNewPrivilegeSystem } = await requestMemoize(
      requestMemoKeys.orgFindById(dto.permission.orgId),
      () => orgDAL.findById(dto.permission.orgId)
    );

    assertRoleSetBoundary({
      shouldUseNewPrivilegeSystem,
      opActions: ProjectPermissionIdentityActions.Delete,
      opSubject: ProjectPermissionSub.Identity,
      actorPermission: permission,
      targetPermissions,
      baseMessage: "Failed to remove a more privileged identity from the project",
      subjectFields: { identityId: dto.selector.identityId }
    });
  };

  const onListIdentityGuard: TIdentityV2Factory["onListIdentityGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Read,
      ProjectPermissionSub.Identity
    );

    return (arg) =>
      permission.can(
        ProjectPermissionIdentityActions.Read,
        subject(ProjectPermissionSub.Identity, { identityId: arg.identityId })
      );
  };

  const onGetIdentityByIdGuard: TIdentityV2Factory["onGetIdentityByIdGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Read,
      subject(ProjectPermissionSub.Identity, { identityId: dto.selector.identityId })
    );
  };

  return {
    onCreateIdentityGuard,
    onUpdateIdentityGuard,
    onDeleteIdentityGuard,
    onListIdentityGuard,
    onGetIdentityByIdGuard,
    getScopeField
  };
};
