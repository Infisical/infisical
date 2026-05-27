import { packRules } from "@casl/ability/extra";
import { requestContext } from "@fastify/request-context";

import { AccessScope, ActionProjectType, OrganizationActionScope, OrgMembershipRole, TableName } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { validateHandlebarTemplate } from "@app/lib/template/validate-handlebars";
import { unpackPermissions } from "@app/server/routes/sanitizedSchema/permission";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";

import { ActorType } from "../auth/auth-type";
import { TExternalGroupOrgRoleMappingDALFactory } from "../external-group-org-role-mapping/external-group-org-role-mapping-dal";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TUserDALFactory } from "../user/user-dal";
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
  TPredefinedRole,
  TUpdateRoleDTO
} from "./role-types";

const stripExpiredTemporaryRoles = <
  M extends {
    roles: Array<{
      role: string;
      isTemporary?: boolean;
      temporaryAccessEndTime?: Date | null;
    }>;
  }
>(
  memberships: M[]
): M[] =>
  memberships.map((m) => ({
    ...m,
    roles: m.roles.filter((r) => !r.isTemporary || (r.temporaryAccessEndTime && new Date() < r.temporaryAccessEndTime))
  }));

type TRoleServiceFactoryDep = {
  roleDAL: TRoleDALFactory;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  userDAL: Pick<TUserDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  externalGroupOrgRoleMappingDAL: Pick<TExternalGroupOrgRoleMappingDALFactory, "findOne">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "find">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TRoleServiceFactory = ReturnType<typeof roleServiceFactory>;

export const roleServiceFactory = ({
  roleDAL,
  permissionService,
  identityDAL,
  userDAL,
  externalGroupOrgRoleMappingDAL,
  membershipRoleDAL,
  licenseService
}: TRoleServiceFactoryDep) => {
  const orgRoleFactory = newOrgRoleFactory({
    permissionService,
    externalGroupOrgRoleMappingDAL
  });
  const projectRoleFactory = newProjectRoleFactory({
    permissionService
  });
  const scopeFactory = {
    [AccessScope.Organization]: orgRoleFactory,
    [AccessScope.Project]: projectRoleFactory
  };

  const createRole = async (dto: TCreateRoleDTO) => {
    const { data, scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];
    await factory.onCreateRoleGuard(dto);

    if (data.slug === OrgMembershipRole.Admin) {
      throw new BadRequestError({ message: "The 'admin' role slug is reserved and cannot be used." });
    }

    const plan = await licenseService.getPlan(dto.permission.orgId);
    if (!plan?.rbac) {
      throw new BadRequestError({
        message:
          "Failed to create custom role due to plan RBAC restriction. Upgrade to Infisical Enterprise plan to create custom roles."
      });
    }

    const scope = factory.getScopeField(scopeData);
    const existingRole = await roleDAL.findOne({
      slug: data.slug,
      [scope.key]: scope.value
    });
    if (existingRole) throw new BadRequestError({ message: `Role with slug '${data.slug}' already exists` });

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

    // Prevent renaming any role to "admin".
    if (data.slug === OrgMembershipRole.Admin) {
      throw new BadRequestError({ message: "The 'admin' role slug is reserved and cannot be used." });
    }

    const existingRole = await roleDAL.findOne({
      id: dto.selector.id,
      [scope.key]: scope.value
    });
    if (!existingRole) throw new NotFoundError({ message: `Role with id '${dto.selector.id}' not found` });

    // Both platform (built-in) and custom roles require the enterprise plan to edit.
    const plan = await licenseService.getPlan(dto.permission.orgId);
    if (!plan?.rbac) {
      throw new BadRequestError({
        message: existingRole.isBuiltIn
          ? "Failed to update platform role due to plan RBAC restriction. Upgrade to Infisical Enterprise to customize platform roles."
          : "Failed to update custom role due to plan RBAC restriction. Upgrade to Infisical Enterprise plan to update custom roles."
      });
    }

    if (data.slug) {
      const existingSlug = await roleDAL.findOne({
        slug: data.slug,
        [scope.key]: scope.value
      });
      if (existingSlug && existingRole.id !== existingSlug.id)
        throw new BadRequestError({ message: `Role with slug '${data.slug}' already exists` });
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
    if (!existingRole) throw new NotFoundError({ message: `Role with id '${dto.selector.id}' not found` });

    // Built-in platform roles can never be deleted — deleting one on enterprise and then
    // downgrading the plan would permanently remove a role with no way to recover it.
    if (existingRole.isBuiltIn) {
      throw new BadRequestError({ message: "Platform roles cannot be deleted." });
    }

    const [roleUsageData] = await membershipRoleDAL.find({ customRoleId: dto.selector.id }, { count: true });
    const usageCount = roleUsageData ? Number.parseInt(roleUsageData.count, 10) : 0;

    if (usageCount > 0) {
      const plural = usageCount > 1 ? "s" : "";
      throw new BadRequestError({
        message: `Role is assigned to ${usageCount} membership${plural}. Re-assign the membership role${plural} before deleting this role.`
      });
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
    const roles = await roleDAL.find(
      { [scope.key]: scope.value },
      { limit: dto.data.limit, offset: dto.data.offset, sort: [[`${TableName.Role}.slug` as "slug", "asc"]] }
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const predefinedRoles: TPredefinedRole[] = factory.getPredefinedRoles(scopeData);

    return {
      roles: [...predefinedRoles, ...roles.map((el) => ({ ...el, permissions: unpackPermissions(el.permissions) }))]
    };
  };

  const getRoleById = async (dto: TGetRoleByIdDTO) => {
    const { scopeData, selector } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onGetRoleByIdGuard(dto);

    const predefined = factory.getPredefinedRoles(scopeData).find((r) => r.id === selector.id);
    if (predefined) return predefined;

    const scope = factory.getScopeField(scopeData);
    const role = await roleDAL.findOne({
      id: selector.id,
      [scope.key]: scope.value
    });
    if (!role) throw new NotFoundError({ message: `Role with id '${dto.selector.id}' not found` });

    return { ...role, [scope.key]: scope.value, permissions: unpackPermissions(role.permissions) };
  };

  const getRoleBySlug = async (dto: TGetRoleBySlugDTO) => {
    const { scopeData, selector } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onGetRoleBySlugGuard(dto);

    const predefined = factory.getPredefinedRoles(scopeData).find((r) => r.slug === selector.slug);
    if (predefined) return predefined;

    const scope = factory.getScopeField(scopeData);
    const role = await roleDAL.findOne({
      slug: selector.slug,
      [scope.key]: scope.value
    });
    if (!role) throw new NotFoundError({ message: `Role with slug '${dto.selector.slug}' not found` });

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
      return {
        permissions: packRules(permission.rules),
        memberships: stripExpiredTemporaryRoles(memberships),
        assumedPrivilegeDetails: undefined
      };
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

      const assumedPrivilegeDetailsCtx = requestContext.get(RequestContextKey.AssumedPrivilegeDetails);
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
        const identityDetails = await requestMemoize(
          requestMemoKeys.identityFindById(assumedPrivilegeDetails.actorId),
          () => identityDAL.findById(assumedPrivilegeDetails.actorId)
        );
        if (!identityDetails)
          throw new NotFoundError({ message: `Identity with ID ${assumedPrivilegeDetails.actorId} not found` });
        assumedPrivilegeDetails.actorName = identityDetails.name;
      } else if (assumedPrivilegeDetails?.actorType === ActorType.USER) {
        const userDetails = await requestMemoize(requestMemoKeys.userFindById(assumedPrivilegeDetails.actorId), () =>
          userDAL.findById(assumedPrivilegeDetails.actorId)
        );
        if (!userDetails)
          throw new NotFoundError({ message: `User with ID ${assumedPrivilegeDetails.actorId} not found` });
        assumedPrivilegeDetails.actorName = `${userDetails?.firstName} ${userDetails?.lastName || ""}`;
        assumedPrivilegeDetails.actorEmail = userDetails?.email || "";
      }

      return {
        permissions: packRules(permission.rules),
        memberships: stripExpiredTemporaryRoles(memberships),
        assumedPrivilegeDetails
      };
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
