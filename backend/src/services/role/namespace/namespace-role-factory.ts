import { ForbiddenError } from "@casl/ability";

import { AccessScope } from "@app/db/schemas";
import {
  isCustomNamespaceRole,
  namespaceAdminPermissions,
  namespaceMemberPermissions,
  namespaceNoAccessPermissions,
  NamespacePermissionActions,
  NamespacePermissionSubjects
} from "@app/ee/services/permission/namespace-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError } from "@app/lib/errors";

import { TRoleScopeFactory } from "../role-types";

type TNamespaceRoleScopeFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getNamespacePermission">;
};

export const newNamespaceRoleFactory = ({ permissionService }: TNamespaceRoleScopeFactoryDep): TRoleScopeFactory => {
  const getScopeField: TRoleScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Namespace) {
      return { key: "namespaceId" as const, value: dto.namespaceId };
    }
    throw new BadRequestError({ message: "Invalid scope provided for the factory" });
  };
  const isCustomRole: TRoleScopeFactory["isCustomRole"] = (role) => isCustomNamespaceRole(role);

  const onCreateRoleGuard: TRoleScopeFactory["onCreateRoleGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getNamespacePermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actorAuthMethod: dto.permission.authMethod,
      namespaceId: scope.value,
      actorOrgId: dto.permission.orgId
    });

    ForbiddenError.from(permission).throwUnlessCan(NamespacePermissionActions.Create, NamespacePermissionSubjects.Role);
  };

  const onUpdateRoleGuard: TRoleScopeFactory["onUpdateRoleGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getNamespacePermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actorAuthMethod: dto.permission.authMethod,
      namespaceId: scope.value,
      actorOrgId: dto.permission.orgId
    });

    ForbiddenError.from(permission).throwUnlessCan(NamespacePermissionActions.Edit, NamespacePermissionSubjects.Role);
  };

  const onDeleteRoleGuard: TRoleScopeFactory["onDeleteRoleGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getNamespacePermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actorAuthMethod: dto.permission.authMethod,
      namespaceId: scope.value,
      actorOrgId: dto.permission.orgId
    });

    ForbiddenError.from(permission).throwUnlessCan(NamespacePermissionActions.Delete, NamespacePermissionSubjects.Role);
  };

  const onListRoleGuard: TRoleScopeFactory["onListRoleGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getNamespacePermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actorAuthMethod: dto.permission.authMethod,
      namespaceId: scope.value,
      actorOrgId: dto.permission.orgId
    });

    ForbiddenError.from(permission).throwUnlessCan(NamespacePermissionActions.Read, NamespacePermissionSubjects.Role);
  };

  const onGetRoleByIdGuard: TRoleScopeFactory["onGetRoleByIdGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getNamespacePermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actorAuthMethod: dto.permission.authMethod,
      namespaceId: scope.value,
      actorOrgId: dto.permission.orgId
    });

    ForbiddenError.from(permission).throwUnlessCan(NamespacePermissionActions.Read, NamespacePermissionSubjects.Role);
  };

  const onGetRoleBySlugGuard: TRoleScopeFactory["onGetRoleBySlugGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getNamespacePermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actorAuthMethod: dto.permission.authMethod,
      namespaceId: scope.value,
      actorOrgId: dto.permission.orgId
    });

    ForbiddenError.from(permission).throwUnlessCan(NamespacePermissionActions.Read, NamespacePermissionSubjects.Role);
  };

  const getPredefinedRoles: TRoleScopeFactory["getPredefinedRoles"] = async (scopeData) => {
    const scopeField = getScopeField(scopeData);
    return [
      {
        id: "b11b49a9-09a9-4443-916a-4246f9ff2c69", // dummy userid
        name: "Admin",
        slug: "admin",
        namespaceId: scopeField.value,
        description: "Complete administration access over the namespace",
        permissions: namespaceAdminPermissions,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "b11b49a9-09a9-4443-916a-4246f9ff2c70", // dummy user for zod validation in response
        name: "Member",
        slug: "member",
        orgId: scopeField.value,
        description: "Non-administrative role in an namespace",
        permissions: namespaceMemberPermissions,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "b10d49a9-09a9-4443-916a-4246f9ff2c72", // dummy user for zod validation in response
        name: "No Access",
        slug: "no-access",
        orgId: scopeField.value,
        description: "No access to any resources in the namespace",
        permissions: namespaceNoAccessPermissions,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
  };

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
