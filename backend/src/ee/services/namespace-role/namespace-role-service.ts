import { ForbiddenError, MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule, packRules, unpackRules } from "@casl/ability/extra";

import { TableName } from "@app/db/schemas";
import { TNamespaceDALFactory } from "@app/ee/services/namespace/namespace-dal";
import {
  NamespacePermissionActions,
  NamespacePermissionSet,
  NamespacePermissionSubjects
} from "@app/ee/services/permission/namespace-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { validateHandlebarTemplate } from "@app/lib/template/validate-handlebars";
import { UnpackedPermissionSchema } from "@app/server/routes/sanitizedSchema/permission";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";

import { TNamespaceRoleDALFactory } from "./namespace-role-dal";
import { getPredefinedRoles } from "./namespace-role-fns";
import {
  TCreateNamespaceRoleDTO,
  TDeleteNamespaceRoleDTO,
  TGetNamespaceRoleDetailsDTO,
  TListNamespaceRolesDTO,
  TUpdateNamespaceRoleDTO
} from "./namespace-role-types";

type TNamespaceRoleServiceFactoryDep = {
  namespaceRoleDAL: TNamespaceRoleDALFactory;
  namespaceDAL: Pick<TNamespaceDALFactory, "findOne">;
  permissionService: Pick<TPermissionServiceFactory, "getNamespacePermission">;
};

export type TNamespaceRoleServiceFactory = ReturnType<typeof namespaceRoleServiceFactory>;

const unpackPermissions = (permissions: unknown) =>
  UnpackedPermissionSchema.array().parse(
    unpackRules((permissions || []) as PackRule<RawRuleOf<MongoAbility<NamespacePermissionSet>>>[])
  );

export const namespaceRoleServiceFactory = ({
  namespaceRoleDAL,
  namespaceDAL,
  permissionService
}: TNamespaceRoleServiceFactoryDep) => {
  const createRole = async ({
    data,
    namespaceName,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TCreateNamespaceRoleDTO) => {
    const namespace = await namespaceDAL.findOne({ name: namespaceName, orgId: actorOrgId });
    if (!namespace) throw new NotFoundError({ message: "Namespace not found" });

    const { permission } = await permissionService.getNamespacePermission({
      actor,
      actorId,
      namespaceId: namespace.id,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(NamespacePermissionActions.Create, NamespacePermissionSubjects.Role);

    const existingRole = await namespaceRoleDAL.findOne({ slug: data.slug, namespaceId: namespace.id });
    if (existingRole) {
      throw new BadRequestError({ name: "Create Role", message: "Namespace role with same slug already exists" });
    }

    validateHandlebarTemplate("Namespace Role Create", JSON.stringify(data.permissions || []), {
      allowedExpressions: (val) => val.includes("identity.")
    });

    const role = await namespaceRoleDAL.create({
      ...data,
      namespaceId: namespace.id
    });

    return { ...role, permissions: unpackPermissions(role.permissions) };
  };

  const getRoleBySlug = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    roleName,
    namespaceName
  }: TGetNamespaceRoleDetailsDTO) => {
    const namespace = await namespaceDAL.findOne({ name: namespaceName, orgId: actorOrgId });
    if (!namespace) throw new NotFoundError({ message: "Namespace not found" });

    const { permission } = await permissionService.getNamespacePermission({
      actor,
      actorId,
      namespaceId: namespace.id,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(NamespacePermissionActions.Read, NamespacePermissionSubjects.Role);

    const predefinedRoles = getPredefinedRoles(namespace.id);
    const selectedPredefinedRole = predefinedRoles.find((el) => el.slug === roleName);
    if (selectedPredefinedRole) {
      return {
        ...selectedPredefinedRole,
        permissions: UnpackedPermissionSchema.array().parse(selectedPredefinedRole.permissions)
      };
    }

    const role = await namespaceRoleDAL.findOne({ slug: roleName, namespaceId: namespace.id });
    if (!role) throw new NotFoundError({ message: `Namespace role with slug '${roleName}' not found` });

    return { ...role, permissions: unpackPermissions(role.permissions) };
  };

  const updateRole = async ({ roleId, data, actor, actorId, actorAuthMethod, actorOrgId }: TUpdateNamespaceRoleDTO) => {
    const namespaceRole = await namespaceRoleDAL.findById(roleId);
    if (!namespaceRole) throw new NotFoundError({ message: "Namespace role not found", name: "Update role" });

    const { permission } = await permissionService.getNamespacePermission({
      actor,
      actorId,
      namespaceId: namespaceRole.namespaceId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(NamespacePermissionActions.Edit, NamespacePermissionSubjects.Role);

    if (data?.slug) {
      const existingRole = await namespaceRoleDAL.findOne({ slug: data.slug, namespaceId: namespaceRole.namespaceId });
      if (existingRole && existingRole.id !== roleId)
        throw new BadRequestError({ name: "Update Role", message: "Namespace role with the same slug already exists" });
    }

    validateHandlebarTemplate("Namespace Role Update", JSON.stringify(data.permissions || []), {
      allowedExpressions: (val) => val.includes("identity.")
    });

    const updatedRole = await namespaceRoleDAL.updateById(namespaceRole.id, {
      ...data,
      permissions: data.permissions ? data.permissions : undefined
    });
    if (!updatedRole) throw new NotFoundError({ message: "Namespace role not found", name: "Update role" });

    return { ...updatedRole, permissions: unpackPermissions(updatedRole.permissions) };
  };

  const deleteRole = async ({ roleId, actor, actorId, actorAuthMethod, actorOrgId }: TDeleteNamespaceRoleDTO) => {
    const namespaceRole = await namespaceRoleDAL.findById(roleId);
    if (!namespaceRole) throw new NotFoundError({ message: "Namespace role not found", name: "Delete role" });

    const { permission } = await permissionService.getNamespacePermission({
      actor,
      actorId,
      namespaceId: namespaceRole.namespaceId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(NamespacePermissionActions.Delete, NamespacePermissionSubjects.Role);

    const deletedRole = await namespaceRoleDAL.deleteById(roleId);
    if (!deletedRole) throw new NotFoundError({ message: "Namespace role not found", name: "Delete role" });

    return { ...deletedRole, permissions: unpackPermissions(deletedRole.permissions) };
  };

  const listRoles = async ({
    namespaceName,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    limit = 50,
    offset = 0,
    search
  }: TListNamespaceRolesDTO) => {
    const namespace = await namespaceDAL.findOne({ name: namespaceName, orgId: actorOrgId });
    if (!namespace) throw new NotFoundError({ message: "Namespace not found" });

    const { permission } = await permissionService.getNamespacePermission({
      actor,
      actorId,
      namespaceId: namespace.id,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(NamespacePermissionActions.Read, NamespacePermissionSubjects.Role);

    const customRoles = await namespaceRoleDAL.find(
      {
        namespaceId: namespace.id,
        $search: {
          name: search
        }
      },
      { sort: [[`${TableName.NamespaceRole}.name` as "name", "asc"]], count: true, limit, offset }
    );

    const predefinedRoles = getPredefinedRoles(namespace.id);
    const roles = [...predefinedRoles, ...(customRoles || [])];

    return { roles, totalCount: predefinedRoles.length + Number(customRoles?.[0]?.count || 0) };
  };

  const getUserPermission = async (
    userId: string,
    namespaceName: string,
    actorAuthMethod: ActorAuthMethod,
    actorOrgId: string
  ) => {
    const namespace = await namespaceDAL.findOne({ name: namespaceName, orgId: actorOrgId });
    if (!namespace) throw new NotFoundError({ message: "Namespace not found" });

    const { permission, membership } = await permissionService.getNamespacePermission({
      actor: ActorType.USER,
      actorId: userId,
      namespaceId: namespace.id,
      actorAuthMethod,
      actorOrgId
    });

    return { permissions: packRules(permission.rules), membership };
  };

  return {
    createRole,
    updateRole,
    deleteRole,
    listRoles,
    getRoleBySlug,
    getUserPermission
  };
};
