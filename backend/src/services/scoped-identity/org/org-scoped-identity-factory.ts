import { ForbiddenError } from "@casl/ability";

import { AccessScope } from "@app/db/schemas";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { InternalServerError } from "@app/lib/errors";

import { TIdentityScopeFactory } from "../scoped-identity-types";

type TOrgScopedIdentityFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export const newOrgScopedIdentityFactory = ({
  permissionService
}: TOrgScopedIdentityFactoryDep): TIdentityScopeFactory => {
  const getScopeField: TIdentityScopeFactory["getScopeField"] = (scopeData) => {
    if (scopeData.scope === AccessScope.Organization) {
      return { key: "orgId" as const, value: scopeData.orgId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the org factory" });
  };

  const onCreateIdentityGuard: TIdentityScopeFactory["onCreateIdentityGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission(
      dto.permission.type,
      dto.permission.id,
      dto.permission.orgId,
      dto.permission.authMethod,
      dto.permission.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Create, OrgPermissionSubjects.Identity);
  };

  const onCreateIdentityDBOperations: TIdentityScopeFactory["onCreateIdentityDBOperations"] = async () => ({
    membershipIds: []
  });

  const onUpdateIdentityGuard: TIdentityScopeFactory["onUpdateIdentityGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission(
      dto.permission.type,
      dto.permission.id,
      dto.permission.orgId,
      dto.permission.authMethod,
      dto.permission.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);
  };

  const onDeleteIdentityGuard: TIdentityScopeFactory["onDeleteIdentityGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission(
      dto.permission.type,
      dto.permission.id,
      dto.permission.orgId,
      dto.permission.authMethod,
      dto.permission.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Delete, OrgPermissionSubjects.Identity);
  };

  const onListIdentityGuard: TIdentityScopeFactory["onListIdentityGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission(
      dto.permission.type,
      dto.permission.id,
      dto.permission.orgId,
      dto.permission.authMethod,
      dto.permission.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);
  };

  const onGetIdentityByIdGuard: TIdentityScopeFactory["onGetIdentityByIdGuard"] = async (dto) => {
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
    onCreateIdentityGuard,
    onCreateIdentityDBOperations,
    onUpdateIdentityGuard,
    onDeleteIdentityGuard,
    onListIdentityGuard,
    onGetIdentityByIdGuard,
    getScopeField
  };
};
