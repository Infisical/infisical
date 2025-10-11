import { AccessScope, NamespaceMembershipRole } from "@app/db/schemas";
import { BadRequestError, InternalServerError, PermissionBoundaryError } from "@app/lib/errors";

import { TMembershipIdentityScopeFactory } from "../membership-identity-types";
import {
  NamespacePermissionIdentityActions,
  NamespacePermissionSubjects,
  isCustomNamespaceRole
} from "@app/ee/services/permission/namespace-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ForbiddenError } from "@casl/ability";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TMembershipIdentityDALFactory } from "../membership-identity-dal";

type TNamespaceMembershipIdentityScopeFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getNamespacePermission" | "getNamespacePermissionByRoles">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "findOne">;
};

export const newNamespaceMembershipIdentityFactory = ({
  permissionService,
  licenseService,
  membershipIdentityDAL
}: TNamespaceMembershipIdentityScopeFactoryDep): TMembershipIdentityScopeFactory => {
  const getScopeField: TMembershipIdentityScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Namespace) {
      return { key: "namespaceId" as const, value: dto.namespaceId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the namespace factory" });
  };

  const getScopeDatabaseFields: TMembershipIdentityScopeFactory["getScopeDatabaseFields"] = (dto) => {
    if (dto.scope === AccessScope.Namespace) {
      return { scopeOrgId: dto.orgId, scopeNamespaceId: dto.namespaceId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the namespace factory" });
  };

  const isCustomRole: TMembershipIdentityScopeFactory["isCustomRole"] = (role) => isCustomNamespaceRole(role);

  const onCreateMembershipIdentityGuard: TMembershipIdentityScopeFactory["onCreateMembershipIdentityGuard"] = async (
    dto
  ) => {
    const scope = getScopeField(dto.scopeData);
    const { permission, memberships } = await permissionService.getNamespacePermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actorAuthMethod: dto.permission.authMethod,
      namespaceId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      NamespacePermissionIdentityActions.Create,
      NamespacePermissionSubjects.Identity
    );

    const plan = await licenseService.getPlan(dto.permission.orgId);
    if (!plan.namespace) {
      throw new BadRequestError({
        message: "Failed to add identity to namespace. Upgrade plan to use namespace."
      });
    }

    const orgMembership = await membershipIdentityDAL.findOne({
      actorIdentityId: dto.data.identityId,
      scopeOrgId: dto.permission.orgId,
      scope: AccessScope.Organization
    });
    if (!orgMembership)
      throw new BadRequestError({ message: `Identity ${dto.data.identityId} is missing organization membership` });

    const shouldUseNewPrivilegeSystem = Boolean(memberships?.[0]?.shouldUseNewPrivilegeSystem);
    const permissionRoles = await permissionService.getNamespacePermissionByRoles(
      dto.data.roles.map((el) => el.role),
      scope.value
    );
    for (const permissionRole of permissionRoles) {
      if (permissionRole?.role?.name !== NamespaceMembershipRole.NoAccess) {
        const permissionBoundary = validatePrivilegeChangeOperation(
          shouldUseNewPrivilegeSystem,
          NamespacePermissionIdentityActions.GrantPrivileges,
          NamespacePermissionSubjects.Identity,
          permission,
          permissionRole.permission
        );
        if (!permissionBoundary.isValid)
          throw new PermissionBoundaryError({
            message: constructPermissionErrorMessage(
              "Failed to create identity namespace membership",
              shouldUseNewPrivilegeSystem,
              NamespacePermissionIdentityActions.GrantPrivileges,
              NamespacePermissionSubjects.Identity
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
    const { permission, memberships } = await permissionService.getNamespacePermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actorAuthMethod: dto.permission.authMethod,
      namespaceId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      NamespacePermissionIdentityActions.Edit,
      NamespacePermissionSubjects.Identity
    );

    const plan = await licenseService.getPlan(dto.permission.orgId);
    if (!plan.namespace) {
      throw new BadRequestError({
        message: "Failed to add identity to namespace. Upgrade plan to use namespace."
      });
    }
    const shouldUseNewPrivilegeSystem = Boolean(memberships?.[0]?.shouldUseNewPrivilegeSystem);
    const permissionRoles = await permissionService.getNamespacePermissionByRoles(
      dto.data.roles.map((el) => el.role),
      scope.value
    );

    for (const permissionRole of permissionRoles) {
      if (permissionRole?.role?.name !== NamespaceMembershipRole.NoAccess) {
        const permissionBoundary = validatePrivilegeChangeOperation(
          shouldUseNewPrivilegeSystem,
          NamespacePermissionIdentityActions.GrantPrivileges,
          NamespacePermissionSubjects.Identity,
          permission,
          permissionRole.permission
        );
        if (!permissionBoundary.isValid)
          throw new PermissionBoundaryError({
            message: constructPermissionErrorMessage(
              "Failed to update identity namespace membership",
              shouldUseNewPrivilegeSystem,
              NamespacePermissionIdentityActions.GrantPrivileges,
              NamespacePermissionSubjects.Identity
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
    const { permission } = await permissionService.getNamespacePermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actorAuthMethod: dto.permission.authMethod,
      namespaceId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      NamespacePermissionIdentityActions.Edit,
      NamespacePermissionSubjects.Identity
    );
  };

  const onListMembershipIdentityGuard: TMembershipIdentityScopeFactory["onListMembershipIdentityGuard"] = async (
    dto
  ) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getNamespacePermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actorAuthMethod: dto.permission.authMethod,
      namespaceId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      NamespacePermissionIdentityActions.Read,
      NamespacePermissionSubjects.Identity
    );
  };

  const onGetMembershipIdentityByIdentityIdGuard: TMembershipIdentityScopeFactory["onGetMembershipIdentityByIdentityIdGuard"] =
    async (dto) => {
      const scope = getScopeField(dto.scopeData);
      const { permission } = await permissionService.getNamespacePermission({
        actor: dto.permission.type,
        actorId: dto.permission.id,
        actorAuthMethod: dto.permission.authMethod,
        namespaceId: scope.value,
        actorOrgId: dto.permission.orgId
      });
      ForbiddenError.from(permission).throwUnlessCan(
        NamespacePermissionIdentityActions.Read,
        NamespacePermissionSubjects.Identity
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
