import { packRules } from "@casl/ability/extra";
import { requestContext } from "@fastify/request-context";

import { AccessScope, ActionProjectType, OrganizationActionScope, TableName } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { validateHandlebarTemplate } from "@app/lib/template/validate-handlebars";
import { UnpackedPermissionSchema, unpackPermissions } from "@app/server/routes/sanitizedSchema/permission";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";

import { ActorType } from "../auth/auth-type";
import { TExternalGroupOrgRoleMappingDALFactory } from "../external-group-org-role-mapping/external-group-org-role-mapping-dal";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TUserDALFactory } from "../user/user-dal";
import { newNamespaceRoleFactory } from "./namespace/namespace-role-factory";
import { newOrgRoleFactory } from "./org/org-role-factory";
import { newProjectRoleFactory } from "./project/project-role-factory";
import { TRoleDALFactory } from "./role-dal";
import {
  TCreateRoleDTO,
  TDeleteRoleDTO,
  TGetRoleByIdDTO,
  TGetRoleBySlugDTO,
  TGetUserPermissionDTO,
  TListRoleDTO,
  TUpdateRoleDTO
} from "./role-types";

type TRoleServiceFactoryDep = {
  roleDAL: TRoleDALFactory;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  userDAL: Pick<TUserDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  externalGroupOrgRoleMappingDAL: Pick<TExternalGroupOrgRoleMappingDALFactory, "findOne">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "find">;
};

export type TRoleServiceFactory = ReturnType<typeof roleServiceFactory>;

export const roleServiceFactory = ({
  roleDAL,
  permissionService,
  projectDAL,
  identityDAL,
  userDAL,
  externalGroupOrgRoleMappingDAL,
  membershipRoleDAL
}: TRoleServiceFactoryDep) => {
  const orgRoleFactory = newOrgRoleFactory({
    permissionService,
    externalGroupOrgRoleMappingDAL
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
    if (existingRole) throw new NotFoundError({ message: `Role with ${data.slug} exists` });

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
        throw new BadRequestError({ message: `Role with ${data.slug} already exists` });
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

    const [roleUsageData] = await membershipRoleDAL.find(
      {
        customRoleId: dto.selector.id
      },
      { count: true }
    );

    if (roleUsageData) {
      const count = Number.parseInt(roleUsageData.count, 10);
      if (count > 0) {
        const plural = count > 1 ? "s" : "";
        throw new BadRequestError({
          message: `Role is assigned to ${count} identity membership${plural}. Re-assign membership role${plural} to delete this role.`
        });
      }
    }

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

    const predefinedRole = await factory.getPredefinedRoles(scopeData);
    const selectedRole = predefinedRole.find((el) => el.id === dto.selector.id);
    if (selectedRole) {
      return { ...selectedRole, permissions: UnpackedPermissionSchema.array().parse(selectedRole.permissions) };
    }

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
      return { ...selectedRole, permissions: UnpackedPermissionSchema.array().parse(selectedRole.permissions) };
    }

    const role = await roleDAL.findOne({
      slug: selector.slug,
      [scope.key]: scope.value
    });
    if (!role) throw new NotFoundError({ message: `Role with slug ${dto.selector.slug} not found` });

    return { ...role, [scope.key]: scope.value, permissions: unpackPermissions(role.permissions) };
  };

  const getUserPermission = async (dto: TGetUserPermissionDTO) => {
    if (dto.scopeData.scope === AccessScope.Organization) {
      const { permission, memberships } = await permissionService.getOrgPermission({
        actorId: dto.permission.id,
        actor: dto.permission.type,
        orgId: dto.permission.orgId,
        actorOrgId: dto.permission.orgId,
        actorAuthMethod: dto.permission.authMethod,
        scope: OrganizationActionScope.Any
      });
      return { permissions: packRules(permission.rules), memberships, assumedPrivilegeDetails: undefined };
    }

    if (dto.scopeData.scope === AccessScope.Project) {
      const { permission, memberships } = await permissionService.getProjectPermission({
        actor: dto.permission.type,
        actorId: dto.permission.id,
        actionProjectType: ActionProjectType.Any,
        actorAuthMethod: dto.permission.authMethod,
        projectId: dto.scopeData.projectId,
        actorOrgId: dto.permission.orgId
      });

      const assumedPrivilegeDetailsCtx = requestContext.get("assumedPrivilegeDetails");
      const isAssumingPrivilege = assumedPrivilegeDetailsCtx?.projectId === dto.scopeData.projectId;
      const assumedPrivilegeDetails = isAssumingPrivilege
        ? {
            actorId: assumedPrivilegeDetailsCtx?.actorId,
            actorType: assumedPrivilegeDetailsCtx?.actorType,
            actorName: "",
            actorEmail: ""
          }
        : undefined;

      if (assumedPrivilegeDetails?.actorType === ActorType.IDENTITY) {
        const identityDetails = await identityDAL.findById(assumedPrivilegeDetails.actorId);
        if (!identityDetails)
          throw new NotFoundError({ message: `Identity with ID ${assumedPrivilegeDetails.actorId} not found` });
        assumedPrivilegeDetails.actorName = identityDetails.name;
      } else if (assumedPrivilegeDetails?.actorType === ActorType.USER) {
        const userDetails = await userDAL.findById(assumedPrivilegeDetails?.actorId);
        if (!userDetails)
          throw new NotFoundError({ message: `User with ID ${assumedPrivilegeDetails.actorId} not found` });
        assumedPrivilegeDetails.actorName = `${userDetails?.firstName} ${userDetails?.lastName || ""}`;
        assumedPrivilegeDetails.actorEmail = userDetails?.email || "";
      }

      return { permissions: packRules(permission.rules), memberships, assumedPrivilegeDetails };
    }

    throw new BadRequestError({ message: "Invalid scope defined" });
  };

  return {
    createRole,
    updateRole,
    deleteRole,
    listRoles,
    getRoleById,
    getRoleBySlug,
    getUserPermission
  };
};
