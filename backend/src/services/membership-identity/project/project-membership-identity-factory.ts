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
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TMembershipIdentityDALFactory } from "../membership-identity-dal";
import { TMembershipIdentityScopeFactory } from "../membership-identity-types";

type TProjectMembershipIdentityScopeFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getProjectPermissionByRoles">;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "findOne">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
};

export const newProjectMembershipIdentityFactory = ({
  permissionService,
  membershipIdentityDAL,
  projectDAL
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
    const { permission, memberships } = await permissionService.getProjectPermission({
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

    const project = await projectDAL.findById(scope.value);
    if (project.namespaceId) {
      const namespaceMembership = await membershipIdentityDAL.findOne({
        actorIdentityId: dto.data.identityId,
        scopeOrgId: dto.permission.orgId,
        scopeNamespaceId: project.namespaceId,
        scope: AccessScope.Namespace
      });
      if (!namespaceMembership)
        throw new BadRequestError({ message: `Identity ${dto.data.identityId} is missing organization membership` });
    } else {
      const orgMembership = await membershipIdentityDAL.findOne({
        actorIdentityId: dto.data.identityId,
        scopeOrgId: dto.permission.orgId,
        scope: AccessScope.Organization
      });
      if (!orgMembership)
        throw new BadRequestError({ message: `Identity ${dto.data.identityId} is missing organization membership` });
    }
    // TODO(namespace): conditionally switch to namespace check
    const shouldUseNewPrivilegeSystem = Boolean(memberships?.[0]?.shouldUseNewPrivilegeSystem);
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
    const { permission, memberships } = await permissionService.getProjectPermission({
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

    const shouldUseNewPrivilegeSystem = Boolean(memberships?.[0]?.shouldUseNewPrivilegeSystem);
    const permissionRoles = await permissionService.getProjectPermissionByRoles(
      dto.data.roles.filter((el) => el.role !== ProjectMembershipRole.NoAccess).map((el) => el.role),
      scope.value
    );
    for (const permissionRole of permissionRoles) {
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
            "Failed to update identity project membership",
            shouldUseNewPrivilegeSystem,
            ProjectPermissionIdentityActions.GrantPrivileges,
            ProjectPermissionSub.Identity
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
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
