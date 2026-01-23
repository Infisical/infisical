import { AccessScope } from "@app/db/schemas/models";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError } from "@app/lib/errors";

import { TRoleScopeFactory } from "../role-types";

type TNamespaceRoleScopeFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const newNamespaceRoleFactory = (_dto: TNamespaceRoleScopeFactoryDep): TRoleScopeFactory => {
  const onCreateRoleGuard: TRoleScopeFactory["onCreateRoleGuard"] = async () => {};

  const onUpdateRoleGuard: TRoleScopeFactory["onUpdateRoleGuard"] = async () => {};

  const onDeleteRoleGuard: TRoleScopeFactory["onDeleteRoleGuard"] = async () => {};

  const onListRoleGuard: TRoleScopeFactory["onListRoleGuard"] = async () => {};

  const onGetRoleByIdGuard: TRoleScopeFactory["onGetRoleByIdGuard"] = async () => {};

  const onGetRoleBySlugGuard: TRoleScopeFactory["onGetRoleBySlugGuard"] = async () => {};

  const getScopeField: TRoleScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Namespace) {
      return { key: "namespaceId" as const, value: dto.namespaceId };
    }
    throw new BadRequestError({ message: "Invalid scope provided for the factory" });
  };

  const isCustomRole: TRoleScopeFactory["isCustomRole"] = () => false;

  const getPredefinedRoles: TRoleScopeFactory["getPredefinedRoles"] = async () => [];

  return {
    onCreateRoleGuard,
    onUpdateRoleGuard,
    onDeleteRoleGuard,
    onListRoleGuard,
    onGetRoleByIdGuard,
    onGetRoleBySlugGuard,
    getScopeField,
    isCustomRole,
    getPredefinedRoles
  };
};
