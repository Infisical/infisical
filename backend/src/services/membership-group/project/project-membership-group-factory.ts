import { ForbiddenError } from "@casl/ability";

import { AccessScope, ActionProjectType, ProjectMembershipRole } from "@app/db/schemas/models";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  isCustomProjectRole,
  ProjectPermissionGroupActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, InternalServerError, PermissionBoundaryError } from "@app/lib/errors";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { TMembershipGroupDALFactory } from "../membership-group-dal";
import { TMembershipGroupScopeFactory } from "../membership-group-types";

type TProjectMembershipGroupScopeFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getProjectPermissionByRoles">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  membershipGroupDAL: Pick<TMembershipGroupDALFactory, "findOne">;
};

export const newProjectMembershipGroupFactory = ({
  permissionService,
  orgDAL,
  membershipGroupDAL
}: TProjectMembershipGroupScopeFactoryDep): TMembershipGroupScopeFactory => {
  const getScopeField: TMembershipGroupScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Project) {
      return { key: "projectId" as const, value: dto.projectId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the project factory" });
  };

  const getScopeDatabaseFields: TMembershipGroupScopeFactory["getScopeDatabaseFields"] = (dto) => {
    if (dto.scope === AccessScope.Project) {
      return { scopeOrgId: dto.orgId, scopeProjectId: dto.projectId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the project factory" });
  };

  const isCustomRole: TMembershipGroupScopeFactory["isCustomRole"] = (role) => isCustomProjectRole(role);

  const onCreateMembershipGroupGuard: TMembershipGroupScopeFactory["onCreateMembershipGroupGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionGroupActions.Create, ProjectPermissionSub.Groups);
    const orgMembership = await membershipGroupDAL.findOne({
      actorGroupId: dto.data.groupId,
      scopeOrgId: dto.permission.orgId,
      scope: AccessScope.Organization
    });
    if (!orgMembership)
      throw new BadRequestError({ message: `Group ${dto.data.groupId} is missing organization membership` });

    const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(dto.permission.orgId);
    const permissionRoles = await permissionService.getProjectPermissionByRoles(
      dto.data.roles.map((el) => el.role),
      scope.value
    );
    for (const permissionRole of permissionRoles) {
      if (permissionRole?.role?.name !== ProjectMembershipRole.NoAccess) {
        const permissionBoundary = validatePrivilegeChangeOperation(
          shouldUseNewPrivilegeSystem,
          ProjectPermissionGroupActions.GrantPrivileges,
          ProjectPermissionSub.Groups,
          permission,
          permissionRole.permission
        );
        if (!permissionBoundary.isValid)
          throw new PermissionBoundaryError({
            message: constructPermissionErrorMessage(
              "Failed to create group project membership",
              shouldUseNewPrivilegeSystem,
              ProjectPermissionGroupActions.GrantPrivileges,
              ProjectPermissionSub.Groups
            ),
            details: { missingPermissions: permissionBoundary.missingPermissions }
          });
      }
    }
  };

  const onUpdateMembershipGroupGuard: TMembershipGroupScopeFactory["onUpdateMembershipGroupGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionGroupActions.Edit, ProjectPermissionSub.Groups);

    const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(dto.permission.orgId);
    const permissionRoles = await permissionService.getProjectPermissionByRoles(
      dto.data.roles.map((el) => el.role),
      scope.value
    );
    for (const permissionRole of permissionRoles) {
      if (permissionRole?.role?.name !== ProjectMembershipRole.NoAccess) {
        const permissionBoundary = validatePrivilegeChangeOperation(
          shouldUseNewPrivilegeSystem,
          ProjectPermissionGroupActions.GrantPrivileges,
          ProjectPermissionSub.Groups,
          permission,
          permissionRole.permission
        );
        if (!permissionBoundary.isValid)
          throw new PermissionBoundaryError({
            message: constructPermissionErrorMessage(
              "Failed to update group project membership",
              shouldUseNewPrivilegeSystem,
              ProjectPermissionGroupActions.GrantPrivileges,
              ProjectPermissionSub.Groups
            ),
            details: { missingPermissions: permissionBoundary.missingPermissions }
          });
      }
    }
  };

  const onDeleteMembershipGroupGuard: TMembershipGroupScopeFactory["onDeleteMembershipGroupGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionGroupActions.Delete, ProjectPermissionSub.Groups);
  };

  const onListMembershipGroupGuard: TMembershipGroupScopeFactory["onListMembershipGroupGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionGroupActions.Read, ProjectPermissionSub.Groups);
  };

  const onGetMembershipGroupByGroupIdGuard: TMembershipGroupScopeFactory["onGetMembershipGroupByGroupIdGuard"] = async (
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

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionGroupActions.Read, ProjectPermissionSub.Groups);
  };

  return {
    onCreateMembershipGroupGuard,
    onUpdateMembershipGroupGuard,
    onDeleteMembershipGroupGuard,
    onListMembershipGroupGuard,
    onGetMembershipGroupByGroupIdGuard,
    getScopeField,
    getScopeDatabaseFields,
    isCustomRole
  };
};
