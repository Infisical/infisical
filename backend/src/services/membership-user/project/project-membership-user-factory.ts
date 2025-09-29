import { ForbiddenError } from "@casl/ability";

import { AccessScope, ActionProjectType, ProjectMembershipRole } from "@app/db/schemas";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  isCustomProjectRole,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { InternalServerError, PermissionBoundaryError } from "@app/lib/errors";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { TMembershipUserScopeFactory } from "../membership-user-types";

type TProjectMembershipUserScopeFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getProjectPermissionByRoles">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
};

export const newProjectMembershipUserFactory = ({
  permissionService,
  orgDAL
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

    const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(dto.permission.orgId);
    const permissionRoles = await permissionService.getProjectPermissionByRoles(
      dto.data.roles.filter((el) => el.role !== ProjectMembershipRole.NoAccess).map((el) => el.role),
      scope.value
    );

    for (const permissionRole of permissionRoles) {
      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        ProjectPermissionMemberActions.GrantPrivileges,
        ProjectPermissionSub.Member,
        permission,
        permissionRole.permission
      );
      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to create user project membership",
            shouldUseNewPrivilegeSystem,
            ProjectPermissionMemberActions.GrantPrivileges,
            ProjectPermissionSub.Member
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }
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

    const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(dto.permission.orgId);
    const permissionRoles = await permissionService.getProjectPermissionByRoles(
      dto.data.roles.filter((el) => el.role !== ProjectMembershipRole.NoAccess).map((el) => el.role),
      scope.value
    );

    for (const permissionRole of permissionRoles) {
      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        ProjectPermissionMemberActions.GrantPrivileges,
        ProjectPermissionSub.Member,
        permission,
        permissionRole.permission
      );
      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to update user project membership",
            shouldUseNewPrivilegeSystem,
            ProjectPermissionMemberActions.GrantPrivileges,
            ProjectPermissionSub.Member
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }
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
