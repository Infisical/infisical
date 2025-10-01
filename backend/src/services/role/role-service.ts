import { AccessScope, TableName } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { validateHandlebarTemplate } from "@app/lib/template/validate-handlebars";
import { unpackPermissions } from "@app/server/routes/sanitizedSchema/permission";

import { newNamespaceRoleFactory } from "./namespace/namespace-role-factory";
import { newOrgRoleFactory } from "./org/org-role-factory";
import { newProjectRoleFactory } from "./project/project-role-factory";
import { TRoleDALFactory } from "./role-dal";
import {
  TCreateRoleDTO,
  TDeleteRoleDTO,
  TGetRoleByIdDTO,
  TGetRoleBySlugDTO,
  TListRoleDTO,
  TUpdateRoleDTO
} from "./role-types";
import { TProjectDALFactory } from "../project/project-dal";

type TRoleServiceFactoryDep = {
  roleDAL: TRoleDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
};

export type TRoleServiceFactory = ReturnType<typeof roleServiceFactory>;

export const roleServiceFactory = ({ roleDAL, permissionService, projectDAL }: TRoleServiceFactoryDep) => {
  const orgRoleFactory = newOrgRoleFactory({
    permissionService
  });
  const projectRoleFactory = newProjectRoleFactory({
    permissionService,
    projectDAL
  });
  const namespaceRoleFactory = newNamespaceRoleFactory({
    permissionService
  });
  const scopeFactory = {
    [AccessScope.Organization]: orgRoleFactory,
    [AccessScope.Project]: projectRoleFactory,
    [AccessScope.Namespace]: namespaceRoleFactory
  };

  const createRole = async (dto: TCreateRoleDTO) => {
    const { data, scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];
    await factory.onCreateRoleGuard(dto);

    const scope = factory.getScopeField(scopeData);
    const existingRole = await roleDAL.findOne({
      slug: data.slug,
      [scope.key]: scope.value
    });
    if (existingRole) throw new NotFoundError({ message: `Role with ${data.slug} exist` });

    validateHandlebarTemplate("Role Creation", JSON.stringify(data.permissions || []), {
      allowedExpressions: (val) => val.includes("identity.")
    });

    const role = await roleDAL.create({
      name: data.name,
      description: data.description,
      slug: data.slug,
      permissions: data.permissions,
      [scope.key]: scope.value
    });

    return { ...role, [scope.key]: scope.value, permissions: unpackPermissions(role.permissions) };
  };

  const updateRole = async (dto: TUpdateRoleDTO) => {
    const { data, scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];
    const scope = factory.getScopeField(scopeData);

    await factory.onUpdateRoleGuard(dto);

    const existingRole = await roleDAL.findOne({
      id: dto.selector.id,
      [scope.key]: scope.value
    });
    if (!existingRole) throw new NotFoundError({ message: `Role with ${dto.selector.id} not found` });

    if (data.slug) {
      const existingSlug = await roleDAL.findOne({
        slug: data.slug,
        [scope.key]: scope.value
      });
      if (existingSlug && existingRole.id !== existingSlug.id)
        throw new BadRequestError({ message: `Role with ${data.slug} not found` });
    }

    validateHandlebarTemplate("Role Update", JSON.stringify(data.permissions || []), {
      allowedExpressions: (val) => val.includes("identity.")
    });

    const role = await roleDAL.updateById(existingRole.id, {
      name: data?.name,
      description: data?.description,
      slug: data?.slug,
      permissions: data?.permissions
    });

    return { ...role, [scope.key]: scope.value, permissions: unpackPermissions(role.permissions) };
  };

  const deleteRole = async (dto: TDeleteRoleDTO) => {
    const { scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];
    const scope = factory.getScopeField(scopeData);
    await factory.onDeleteRoleGuard(dto);

    const existingRole = await roleDAL.findOne({
      id: dto.selector.id,
      [scope.key]: scope.value
    });
    if (!existingRole) throw new NotFoundError({ message: `Role with ${dto.selector.id} not found` });

    const [role] = await roleDAL.delete({
      id: existingRole.id,
      [scope.key]: scope.value
    });

    return { ...role, [scope.key]: scope.value, permissions: unpackPermissions(role.permissions) };
  };

  const listRoles = async (dto: TListRoleDTO) => {
    const { scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onListRoleGuard(dto);

    const scope = factory.getScopeField(scopeData);
    const predefinedRoles = await factory.getPredefinedRoles(scopeData);
    const roles = await roleDAL.find(
      {
        [scope.key]: scope.value
      },
      { limit: dto.data.limit, offset: dto.data.offset, sort: [[`${TableName.Role}.slug` as "slug", "asc"]] }
    );

    return {
      roles: [...predefinedRoles, ...roles.map((el) => ({ ...el, permissions: unpackPermissions(el.permissions) }))]
    };
  };

  const getRoleById = async (dto: TGetRoleByIdDTO) => {
    const { scopeData, selector } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onGetRoleByIdGuard(dto);

    const scope = factory.getScopeField(scopeData);
    const role = await roleDAL.findOne({
      id: selector.id,
      [scope.key]: scope.value
    });
    if (!role) throw new NotFoundError({ message: `Role with id ${dto.selector.id} not found` });

    return { ...role, [scope.key]: scope.value, permissions: unpackPermissions(role.permissions) };
  };

  const getRoleBySlug = async (dto: TGetRoleBySlugDTO) => {
    const { scopeData, selector } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onGetRoleBySlugGuard(dto);

    const scope = factory.getScopeField(scopeData);
    const isCustomRole = factory.isCustomRole(dto.selector.slug);
    if (!isCustomRole) {
      const predefinedRole = await factory.getPredefinedRoles(scopeData);
      const selectedRole = predefinedRole.find((el) => el.slug === dto.selector.slug);
      if (!selectedRole) throw new BadRequestError({ message: `Role with slug ${dto.selector.slug} not found` });
      return selectedRole;
    }

    const role = await roleDAL.findOne({
      slug: selector.slug,
      [scope.key]: scope.value
    });
    if (!role) throw new NotFoundError({ message: `Role with slug ${dto.selector.slug} not found` });

    return { ...role, [scope.key]: scope.value, permissions: unpackPermissions(role.permissions) };
  };

  return {
    createRole,
    updateRole,
    deleteRole,
    listRoles,
    getRoleById,
    getRoleBySlug
  };
};
