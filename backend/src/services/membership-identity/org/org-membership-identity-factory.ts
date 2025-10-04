import { ForbiddenError } from "@casl/ability";

import { AccessScope, OrgMembershipRole } from "@app/db/schemas";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, InternalServerError, PermissionBoundaryError } from "@app/lib/errors";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { isCustomOrgRole } from "@app/services/org/org-role-fns";

import { TMembershipIdentityScopeFactory } from "../membership-identity-types";

type TOrgMembershipIdentityScopeFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getOrgPermissionByRoles">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
};

export const newOrgMembershipIdentityFactory = ({
  permissionService,
  orgDAL
}: TOrgMembershipIdentityScopeFactoryDep): TMembershipIdentityScopeFactory => {
  const getScopeField: TMembershipIdentityScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Organization) {
      return { key: "orgId" as const, value: dto.orgId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the org factory" });
  };

  const getScopeDatabaseFields: TMembershipIdentityScopeFactory["getScopeDatabaseFields"] = (dto) => {
    if (dto.scope === AccessScope.Organization) {
      return { scopeOrgId: dto.orgId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the org factory" });
  };

  const isCustomRole: TMembershipIdentityScopeFactory["isCustomRole"] = (role: string) => isCustomOrgRole(role);

  const onCreateMembershipIdentityGuard: TMembershipIdentityScopeFactory["onCreateMembershipIdentityGuard"] =
    async () => {
      throw new BadRequestError({
        message: "Organizatin membership cannot be created for organization scoped identity"
      });
    };

  const onUpdateMembershipIdentityGuard: TMembershipIdentityScopeFactory["onUpdateMembershipIdentityGuard"] = async (
    dto
  ) => {
    const { permission } = await permissionService.getOrgPermission(
      dto.permission.type,
      dto.permission.id,
      dto.permission.orgId,
      dto.permission.authMethod,
      dto.permission.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);
    const permissionRoles = await permissionService.getOrgPermissionByRoles(
      dto.data.roles.map((el) => el.role),
      dto.permission.orgId
    );

    const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(dto.permission.orgId);
    for (const permissionRole of permissionRoles) {
      if (permissionRole?.role?.name !== OrgMembershipRole.NoAccess) {
        const permissionBoundary = validatePrivilegeChangeOperation(
          shouldUseNewPrivilegeSystem,
          OrgPermissionIdentityActions.GrantPrivileges,
          OrgPermissionSubjects.Identity,
          permission,
          permissionRole.permission
        );
        if (!permissionBoundary.isValid)
          throw new PermissionBoundaryError({
            message: constructPermissionErrorMessage(
              "Failed to create identity org membership",
              shouldUseNewPrivilegeSystem,
              OrgPermissionIdentityActions.GrantPrivileges,
              OrgPermissionSubjects.Identity
            ),
            details: { missingPermissions: permissionBoundary.missingPermissions }
          });
      }
    }
  };

  const onDeleteMembershipIdentityGuard: TMembershipIdentityScopeFactory["onDeleteMembershipIdentityGuard"] =
    async () => {
      throw new BadRequestError({
        message: "Organizatin membership cannot be created for organization scoped identity"
      });
    };

  const onListMembershipIdentityGuard: TMembershipIdentityScopeFactory["onListMembershipIdentityGuard"] = async (
    dto
  ) => {
    const { permission } = await permissionService.getOrgPermission(
      dto.permission.type,
      dto.permission.id,
      dto.permission.orgId,
      dto.permission.authMethod,
      dto.permission.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);
  };

  const onGetMembershipIdentityByIdentityIdGuard: TMembershipIdentityScopeFactory["onGetMembershipIdentityByIdentityIdGuard"] =
    async (dto) => {
      const { permission } = await permissionService.getOrgPermission(
        dto.permission.type,
        dto.permission.id,
        dto.permission.orgId,
        dto.permission.authMethod,
        dto.permission.orgId
      );
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);
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
