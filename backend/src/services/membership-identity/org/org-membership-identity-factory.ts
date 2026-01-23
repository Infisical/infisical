import { ForbiddenError } from "@casl/ability";

import { AccessScope, OrgMembershipRole, OrganizationActionScope } from "@app/db/schemas/models";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, InternalServerError, PermissionBoundaryError } from "@app/lib/errors";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { isCustomOrgRole } from "@app/services/org/org-role-fns";

import { TMembershipIdentityScopeFactory } from "../membership-identity-types";

type TOrgMembershipIdentityScopeFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getOrgPermissionByRoles">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
};

export const newOrgMembershipIdentityFactory = ({
  permissionService,
  orgDAL,
  identityDAL
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

  const onCreateMembershipIdentityGuard: TMembershipIdentityScopeFactory["onCreateMembershipIdentityGuard"] = async (
    dto
  ) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      orgId: dto.permission.orgId,
      actorAuthMethod: dto.permission.authMethod,
      actorOrgId: dto.permission.orgId,
      scope: OrganizationActionScope.ChildOrganization
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Create, OrgPermissionSubjects.Identity);

    const identityDetails = await identityDAL.findById(dto.data.identityId);
    if (identityDetails.orgId !== dto.permission.rootOrgId) {
      throw new BadRequestError({ message: "Only identities from parent organization can be invited" });
    }

    if (identityDetails.projectId) {
      throw new BadRequestError({ message: "Failed to create organization membership for a project scoped identity" });
    }

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
              "Failed to update identity org membership",
              shouldUseNewPrivilegeSystem,
              OrgPermissionIdentityActions.GrantPrivileges,
              OrgPermissionSubjects.Identity
            ),
            details: { missingPermissions: permissionBoundary.missingPermissions }
          });
      }
    }
  };

  const onUpdateMembershipIdentityGuard: TMembershipIdentityScopeFactory["onUpdateMembershipIdentityGuard"] = async (
    dto
  ) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      orgId: dto.permission.orgId,
      actorAuthMethod: dto.permission.authMethod,
      actorOrgId: dto.permission.orgId,
      scope: OrganizationActionScope.Any
    });

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
              "Failed to update identity org membership",
              shouldUseNewPrivilegeSystem,
              OrgPermissionIdentityActions.GrantPrivileges,
              OrgPermissionSubjects.Identity
            ),
            details: { missingPermissions: permissionBoundary.missingPermissions }
          });
      }
    }

    const identityDetails = await identityDAL.findById(dto.selector.identityId);
    if (identityDetails.projectId) {
      throw new BadRequestError({ message: "Failed to create organization membership for a project scoped identity" });
    }
  };

  const onDeleteMembershipIdentityGuard: TMembershipIdentityScopeFactory["onDeleteMembershipIdentityGuard"] = async (
    dto
  ) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      orgId: dto.permission.orgId,
      actorAuthMethod: dto.permission.authMethod,
      actorOrgId: dto.permission.orgId,
      scope: OrganizationActionScope.ChildOrganization
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Delete, OrgPermissionSubjects.Identity);

    const identityDetails = await identityDAL.findById(dto.selector.identityId);
    if (identityDetails.orgId !== dto.permission.rootOrgId) {
      throw new BadRequestError({ message: "Only identities from parent organization can do this operation" });
    }

    if (identityDetails.orgId === dto.permission.orgId) {
      throw new BadRequestError({ message: "Identity cannot exist as orphan" });
    }

    if (identityDetails.projectId) {
      throw new BadRequestError({ message: "Failed to create organization membership for a project scoped identity" });
    }
  };

  const onListMembershipIdentityGuard: TMembershipIdentityScopeFactory["onListMembershipIdentityGuard"] = async (
    dto
  ) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      orgId: dto.permission.orgId,
      actorAuthMethod: dto.permission.authMethod,
      actorOrgId: dto.permission.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);

    return () => true;
  };

  const onGetMembershipIdentityByIdentityIdGuard: TMembershipIdentityScopeFactory["onGetMembershipIdentityByIdentityIdGuard"] =
    async (dto) => {
      const { permission } = await permissionService.getOrgPermission({
        actor: dto.permission.type,
        actorId: dto.permission.id,
        orgId: dto.permission.orgId,
        actorAuthMethod: dto.permission.authMethod,
        actorOrgId: dto.permission.orgId,
        scope: OrganizationActionScope.Any
      });
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
