import { ForbiddenError } from "@casl/ability";

import { AccessScope, ActionProjectType, ProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  isCustomProjectRole,
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getPredefinedRoles as buildPredefinedRoles } from "@app/services/project-role/project-role-fns";

import { TRoleScopeFactory } from "../role-types";

type TProjectRoleScopeFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
};

export const newProjectRoleFactory = ({
  permissionService,
  projectDAL
}: TProjectRoleScopeFactoryDep): TRoleScopeFactory => {
  const getScopeField: TRoleScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Project) {
      return { key: "projectId" as const, value: dto.projectId };
    }
    throw new BadRequestError({ message: "Invalid scope provided for the factory" });
  };

  const isCustomRole: TRoleScopeFactory["isCustomRole"] = (role: string) => isCustomProjectRole(role);

  const onCreateRoleGuard: TRoleScopeFactory["onCreateRoleGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Role);
  };

  const onUpdateRoleGuard: TRoleScopeFactory["onUpdateRoleGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Role);
  };

  const onDeleteRoleGuard: TRoleScopeFactory["onDeleteRoleGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Role);
  };

  const onListRoleGuard: TRoleScopeFactory["onListRoleGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
  };

  const onGetRoleByIdGuard: TRoleScopeFactory["onGetRoleByIdGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
  };

  const onGetRoleBySlugGuard: TRoleScopeFactory["onGetRoleBySlugGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
  };

  const getPredefinedRoles: TRoleScopeFactory["getPredefinedRoles"] = async (scopeData) => {
    const scope = getScopeField(scopeData);
    const project = await requestMemoize(requestMemoKeys.projectFindById(scope.value), () =>
      projectDAL.findById(scope.value)
    );
    if (!project) throw new BadRequestError({ message: "Project not found" });
    return buildPredefinedRoles({ projectId: project.id, projectType: project.type as ProjectType });
  };

  return {
    onCreateRoleGuard,
    onUpdateRoleGuard,
    onDeleteRoleGuard,
    onListRoleGuard,
    onGetRoleByIdGuard,
    onGetRoleBySlugGuard,
    getScopeField,
    getPredefinedRoles,
    isCustomRole
  };
};
