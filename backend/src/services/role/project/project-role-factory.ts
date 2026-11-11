import { AccessScope, ProjectType } from "@app/db/schemas";
import {
  isCustomProjectRole,
  ProjectPermissionActions,
  ProjectPermissionSub,
  TProjectsDomain
} from "@app/domains/platform/projects/ce/module";
import { BadRequestError } from "@app/lib/errors";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { getPredefinedRoles as buildPredefinedRoles } from "@app/services/project-role/project-role-fns";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TRoleScopeFactory } from "../role-types";

type TProjectRoleScopeFactoryDep = {
  projectsDomain: Pick<TProjectsDomain, "getProjectPermission">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
};

export const newProjectRoleFactory = ({
  projectsDomain,
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
    const permission = await projectsDomain.getProjectPermission({ actor: dto.actor, projectId: scope.value });
    permission.assert({ action: ProjectPermissionActions.Create, subject: ProjectPermissionSub.Role });
  };

  const onUpdateRoleGuard: TRoleScopeFactory["onUpdateRoleGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectsDomain.getProjectPermission({ actor: dto.actor, projectId: scope.value });
    permission.assert({ action: ProjectPermissionActions.Edit, subject: ProjectPermissionSub.Role });
  };

  const onDeleteRoleGuard: TRoleScopeFactory["onDeleteRoleGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectsDomain.getProjectPermission({ actor: dto.actor, projectId: scope.value });
    permission.assert({ action: ProjectPermissionActions.Delete, subject: ProjectPermissionSub.Role });
  };

  const onListRoleGuard: TRoleScopeFactory["onListRoleGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectsDomain.getProjectPermission({ actor: dto.actor, projectId: scope.value });
    permission.assert({ action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Role });
  };

  const onGetRoleByIdGuard: TRoleScopeFactory["onGetRoleByIdGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectsDomain.getProjectPermission({ actor: dto.actor, projectId: scope.value });
    permission.assert({ action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Role });
  };

  const onGetRoleBySlugGuard: TRoleScopeFactory["onGetRoleBySlugGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectsDomain.getProjectPermission({ actor: dto.actor, projectId: scope.value });
    permission.assert({ action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Role });
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
