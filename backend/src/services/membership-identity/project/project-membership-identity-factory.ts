import { ForbiddenError, subject } from "@casl/ability";

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
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { ActorType } from "../../auth/auth-type";
import { TMembershipIdentityDALFactory } from "../membership-identity-dal";
import { TMembershipIdentityScopeFactory } from "../membership-identity-types";

type TProjectMembershipIdentityScopeFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getProjectPermissionByRoles">;

  identityDAL: Pick<TIdentityDALFactory, "findById">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "findEffectiveOrgMembership">;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "findOne">;
};

export const newProjectMembershipIdentityFactory = ({
  permissionService,
  orgDAL,
  identityDAL
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
    const orgMembership = await orgDAL.findEffectiveOrgMembership({
      actorType: ActorType.IDENTITY,
      actorId: dto.data.identityId,
      orgId: dto.permission.orgId
    });

    if (!orgMembership)
      throw new BadRequestError({ message: `Identity ${dto.data.identityId} is missing organization membership` });

    const identityDetails = await identityDAL.findById(dto.data.identityId);
    if (identityDetails.projectId) {
      throw new BadRequestError({ message: "Failed to create project membership for a project scoped identity" });
    }

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
      subject(ProjectPermissionSub.Identity, { identityId: dto.selector.identityId })
    );

    const identityDetails = await identityDAL.findById(dto.selector.identityId);
    if (identityDetails.projectId && identityDetails.projectId !== scope.value) {
      throw new BadRequestError({ message: "Failed to update project membership for a project scoped identity" });
    }

    const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(dto.permission.orgId);
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
      subject(ProjectPermissionSub.Identity, { identityId: dto.selector.identityId })
    );

    const identityDetails = await identityDAL.findById(dto.selector.identityId);
    if (identityDetails.projectId) {
      throw new BadRequestError({ message: "Failed to delete project membership for a project scoped identity" });
    }
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

    return (arg) =>
      permission.can(
        ProjectPermissionIdentityActions.Read,
        subject(ProjectPermissionSub.Identity, { identityId: arg.identityId })
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
        subject(ProjectPermissionSub.Identity, { identityId: dto.selector.identityId })
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
