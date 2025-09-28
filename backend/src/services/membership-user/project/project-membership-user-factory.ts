import { ForbiddenError } from "@casl/ability";

import { AccessScope, ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  isCustomProjectRole,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { InternalServerError } from "@app/lib/errors";

import { TMembershipUserScopeFactory } from "../membership-user-types";

type TProjectMembershipUserScopeFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getProjectPermissionByRole">;
};

export const newProjectMembershipUserFactory = ({
  permissionService
}: TProjectMembershipUserScopeFactoryDep): TMembershipUserScopeFactory => {
  const getScopeField: TMembershipUserScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Project) {
      return { key: "projectId" as const, value: dto.projectId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the project factory" });
  };

  const getScopeDatabaseFields: TMembershipUserScopeFactory["getScopeDatabaseFields"] = (dto) => {
    if (dto.scope === AccessScope.Project) {
      return { scopeOrgId: dto.orgId, scopeProjectId: dto.projectId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the project factory" });
  };

  const isCustomRole: TMembershipUserScopeFactory["isCustomRole"] = (role) => isCustomProjectRole(role);

  // TODO(simp): do rest of the shouldUsePrivilegeV2 check
  const onCreateMembershipUserGuard: TMembershipUserScopeFactory["onCreateMembershipUserGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Create, ProjectPermissionSub.Member);
  };

  const onCreateMembershipComplete: TMembershipUserScopeFactory["onCreateMembershipComplete"] = async () => {
    throw new InternalServerError({ message: "Project membership user create complete not implemented" });
  };

  const onUpdateMembershipUserGuard: TMembershipUserScopeFactory["onUpdateMembershipUserGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Edit, ProjectPermissionSub.Member);
  };

  const onDeleteMembershipUserGuard: TMembershipUserScopeFactory["onDeleteMembershipUserGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Delete, ProjectPermissionSub.Member);
    return { actorIdOfDeletor: dto.permission.id };
  };

  const onListMembershipUserGuard: TMembershipUserScopeFactory["onListMembershipUserGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member);
  };

  const onGetMembershipUserByUserIdGuard: TMembershipUserScopeFactory["onGetMembershipUserByUserIdGuard"] = async (
    dto
  ) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member);
  };

  return {
    onCreateMembershipUserGuard,
    onCreateMembershipComplete,
    onUpdateMembershipUserGuard,
    onDeleteMembershipUserGuard,
    onListMembershipUserGuard,
    onGetMembershipUserByUserIdGuard,
    getScopeField,
    getScopeDatabaseFields,
    isCustomRole
  };
};
