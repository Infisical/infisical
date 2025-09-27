import { AccessScope, TableName } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { validateHandlebarTemplate } from "@app/lib/template/validate-handlebars";

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

type TRoleServiceFactoryDep = {
  roleDAL: TRoleDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
};

export type TRoleServiceFactory = ReturnType<typeof roleServiceFactory>;

export const roleServiceFactory = ({ roleDAL, permissionService }: TRoleServiceFactoryDep) => {
  const orgRoleFactory = newOrgRoleFactory({
    permissionService
  });
  const projectRoleFactory = newProjectRoleFactory({
    permissionService
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

    validateHandlebarTemplate("Role Creation", JSON.stringify(data.permissions || []), {
      allowedExpressions: (val) => val.includes("identity.")
    });

    const scope = factory.getScopeField(scopeData);
    const role = await roleDAL.create({
      name: data.name,
      description: data.description,
      slug: data.slug,
      permissions: data.permissions,
      [scope.key]: scope.value
    });

    return { ...role, [scope.key]: scope.value };
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

    return { ...role, [scope.key]: scope.value };
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

    return { ...role, [scope.key]: scope.value };
  };

  const listRoles = async (dto: TListRoleDTO) => {
    const { scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onListRoleGuard(dto);

    const scope = factory.getScopeField(scopeData);
    const roles = await roleDAL.find(
      {
        [scope.key]: scope.value
      },
      { limit: dto.data.limit, offset: dto.data.offset, sort: [[`${TableName.Role}.slug` as "slug", "asc"]] }
    );

    return { roles };
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

    return { ...role, [scope.key]: scope.value };
  };

  const getRoleBySlug = async (dto: TGetRoleBySlugDTO) => {
    const { scopeData, selector } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onGetRoleBySlugGuard(dto);

    const scope = factory.getScopeField(scopeData);
    const role = await roleDAL.findOne({
      slug: selector.slug,
      [scope.key]: scope.value
    });
    if (!role) throw new NotFoundError({ message: `Role with slug ${dto.selector.slug} not found` });

    return { ...role, [scope.key]: scope.value };
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
