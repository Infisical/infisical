import { ForbiddenError } from "@casl/ability";

import { AccessScope } from "@app/db/schemas";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError } from "@app/lib/errors";

import { TRoleScopeFactory } from "../role-types";

type TOrgRoleScopeFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export const newOrgRoleFactory = ({ permissionService }: TOrgRoleScopeFactoryDep): TRoleScopeFactory => {
  const getScopeField: TRoleScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Organization) {
      return { key: "orgId" as const, value: dto.orgId };
    }
    throw new BadRequestError({ message: "Invalid scope provided for the factory" });
  };

  const onCreateRoleGuard: TRoleScopeFactory["onCreateRoleGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission(
      dto.permission.type,
      dto.permission.id,
      dto.permission.orgId,
      dto.permission.authMethod,
      dto.permission.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Role);
  };

  const onUpdateRoleGuard: TRoleScopeFactory["onUpdateRoleGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission(
      dto.permission.type,
      dto.permission.id,
      dto.permission.orgId,
      dto.permission.authMethod,
      dto.permission.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Role);
  };

  const onDeleteRoleGuard: TRoleScopeFactory["onDeleteRoleGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission(
      dto.permission.type,
      dto.permission.id,
      dto.permission.orgId,
      dto.permission.authMethod,
      dto.permission.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Role);
  };

  const onListRoleGuard: TRoleScopeFactory["onListRoleGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission(
      dto.permission.type,
      dto.permission.id,
      dto.permission.orgId,
      dto.permission.authMethod,
      dto.permission.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Role);
  };

  const onGetRoleByIdGuard: TRoleScopeFactory["onGetRoleByIdGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission(
      dto.permission.type,
      dto.permission.id,
      dto.permission.orgId,
      dto.permission.authMethod,
      dto.permission.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Role);
  };

  const onGetRoleBySlugGuard: TRoleScopeFactory["onGetRoleBySlugGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission(
      dto.permission.type,
      dto.permission.id,
      dto.permission.orgId,
      dto.permission.authMethod,
      dto.permission.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Role);
  };

  return {
    onCreateRoleGuard,
    onUpdateRoleGuard,
    onDeleteRoleGuard,
    onListRoleGuard,
    onGetRoleByIdGuard,
    onGetRoleBySlugGuard,
    getScopeField
  };
};
