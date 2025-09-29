import { ForbiddenError } from "@casl/ability";

import { AccessScope, ActionProjectType, ProjectMembershipRole } from "@app/db/schemas";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  isCustomProjectRole,
  ProjectPermissionIdentityActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, InternalServerError, PermissionBoundaryError } from "@app/lib/errors";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { TMembershipIdentityDALFactory } from "../membership-identity-dal";
import { TMembershipIdentityScopeFactory } from "../membership-identity-types";

type TProjectMembershipIdentityScopeFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getProjectPermissionByRoles">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "findOne">;
};

export const newProjectMembershipIdentityFactory = ({
  permissionService,
  orgDAL,
  membershipIdentityDAL
}: TProjectMembershipIdentityScopeFactoryDep): TMembershipIdentityScopeFactory => {
  const getScopeField: TMembershipIdentityScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Project) {
      return { key: "projectId" as const, value: dto.projectId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the project factory" });
  };

  const getScopeDatabaseFields: TMembershipIdentityScopeFactory["getScopeDatabaseFields"] = (dto) => {
    if (dto.scope === AccessScope.Project) {
      return { scopeOrgId: dto.orgId, scopeProjectId: dto.projectId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the project factory" });
  };

  const isCustomRole: TMembershipIdentityScopeFactory["isCustomRole"] = (role) => isCustomProjectRole(role);

  const onCreateMembershipIdentityGuard: TMembershipIdentityScopeFactory["onCreateMembershipIdentityGuard"] = async (
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
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Create,
      ProjectPermissionSub.Identity
    );
    const orgMembership = await membershipIdentityDAL.findOne({
      actorIdentityId: dto.data.identityId,
      scopeOrgId: dto.permission.orgId,
      scope: AccessScope.Organization
    });
    if (!orgMembership)
      throw new BadRequestError({ message: `Identity ${dto.data.identityId} is missing organization membership` });

    const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(dto.permission.orgId);
    const permissionRoles = await permissionService.getProjectPermissionByRoles(
      dto.data.roles.map((el) => el.role),
      scope.value
    );
    for (const permissionRole of permissionRoles) {
      if (permissionRole?.role?.name !== ProjectMembershipRole.NoAccess) {
        const permissionBoundary = validatePrivilegeChangeOperation(
          shouldUseNewPrivilegeSystem,
          ProjectPermissionIdentityActions.GrantPrivileges,
          ProjectPermissionSub.Identity,
          permission,
          permissionRole.permission
        );
        if (!permissionBoundary.isValid)
          throw new PermissionBoundaryError({
            message: constructPermissionErrorMessage(
              "Failed to create identity project membership",
              shouldUseNewPrivilegeSystem,
              ProjectPermissionIdentityActions.GrantPrivileges,
              ProjectPermissionSub.Identity
            ),
            details: { missingPermissions: permissionBoundary.missingPermissions }
          });
      }
    }
  };

  const onUpdateMembershipIdentityGuard: TMembershipIdentityScopeFactory["onUpdateMembershipIdentityGuard"] = async (
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
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Edit,
      ProjectPermissionSub.Identity
    );

    const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(dto.permission.orgId);
    const permissionRoles = await permissionService.getProjectPermissionByRoles(
      dto.data.roles.map((el) => el.role),
      scope.value
    );
    for (const permissionRole of permissionRoles) {
      if (permissionRole?.role?.name !== ProjectMembershipRole.NoAccess) {
        const permissionBoundary = validatePrivilegeChangeOperation(
          shouldUseNewPrivilegeSystem,
          ProjectPermissionIdentityActions.GrantPrivileges,
          ProjectPermissionSub.Identity,
          permission,
          permissionRole.permission
        );
        if (!permissionBoundary.isValid)
          throw new PermissionBoundaryError({
            message: constructPermissionErrorMessage(
              "Failed to create identity project membership",
              shouldUseNewPrivilegeSystem,
              ProjectPermissionIdentityActions.GrantPrivileges,
              ProjectPermissionSub.Identity
            ),
            details: { missingPermissions: permissionBoundary.missingPermissions }
          });
      }
    }
  };

  const onDeleteMembershipIdentityGuard: TMembershipIdentityScopeFactory["onDeleteMembershipIdentityGuard"] = async (
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

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Delete,
      ProjectPermissionSub.Identity
    );
  };

  const onListMembershipIdentityGuard: TMembershipIdentityScopeFactory["onListMembershipIdentityGuard"] = async (
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

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Read,
      ProjectPermissionSub.Identity
    );
  };

  const onGetMembershipIdentityByIdentityIdGuard: TMembershipIdentityScopeFactory["onGetMembershipIdentityByIdentityIdGuard"] =
    async (dto) => {
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
    };

  return {
    onCreateMembershipIdentityGuard,
    onUpdateMembershipIdentityGuard,
    onDeleteMembershipIdentityGuard,
    onListMembershipIdentityGuard,
    onGetMembershipIdentityByIdentityIdGuard,
    getScopeField,
    getScopeDatabaseFields,
    isCustomRole
  };
};
