import { ForbiddenError } from "@casl/ability";

import { AccessScope, OrganizationActionScope } from "@app/db/schemas";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { InternalServerError } from "@app/lib/errors";

import { TIdentityV2Factory } from "../identity-types";

type TOrgIdentityFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export const newOrgIdentityFactory = ({ permissionService }: TOrgIdentityFactoryDep): TIdentityV2Factory => {
  const getScopeField: TIdentityV2Factory["getScopeField"] = (scopeData) => {
    if (scopeData.scope === AccessScope.Organization) {
      return { key: "orgId" as const, value: scopeData.orgId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the org factory" });
  };

  const onCreateIdentityGuard: TIdentityV2Factory["onCreateIdentityGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      orgId: dto.permission.orgId,
      actorAuthMethod: dto.permission.authMethod,
      actorOrgId: dto.permission.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Create, OrgPermissionSubjects.Identity);
  };

  const onUpdateIdentityGuard: TIdentityV2Factory["onUpdateIdentityGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      orgId: dto.permission.orgId,
      actorAuthMethod: dto.permission.authMethod,
      actorOrgId: dto.permission.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);
  };

  const onDeleteIdentityGuard: TIdentityV2Factory["onDeleteIdentityGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      orgId: dto.permission.orgId,
      actorAuthMethod: dto.permission.authMethod,
      actorOrgId: dto.permission.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Delete, OrgPermissionSubjects.Identity);
  };

  const onListIdentityGuard: TIdentityV2Factory["onListIdentityGuard"] = async (dto) => {
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

  const onGetIdentityByIdGuard: TIdentityV2Factory["onGetIdentityByIdGuard"] = async (dto) => {
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
    onCreateIdentityGuard,
    onUpdateIdentityGuard,
    onDeleteIdentityGuard,
    onListIdentityGuard,
    onGetIdentityByIdGuard,
    getScopeField
  };
};
