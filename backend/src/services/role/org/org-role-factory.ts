import { ForbiddenError } from "@casl/ability";
import { packRules } from "@casl/ability/extra";

import { AccessScope, OrganizationActionScope, OrgMembershipRole } from "@app/db/schemas";
import {
  orgAdminPermissions,
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError } from "@app/lib/errors";
import { unpackPermissions } from "@app/server/routes/sanitizedSchema/permission";
import { TExternalGroupOrgRoleMappingDALFactory } from "@app/services/external-group-org-role-mapping/external-group-org-role-mapping-dal";

import { TPredefinedRole, TRoleScopeFactory } from "../role-types";

const adminOrgRolePermissions = unpackPermissions(packRules(orgAdminPermissions));

type TOrgRoleScopeFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  externalGroupOrgRoleMappingDAL: Pick<TExternalGroupOrgRoleMappingDALFactory, "findOne">;
};

export const newOrgRoleFactory = ({
  permissionService,
  externalGroupOrgRoleMappingDAL
}: TOrgRoleScopeFactoryDep): TRoleScopeFactory => {
  const getScopeField: TRoleScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Organization) {
      return { key: "orgId" as const, value: dto.orgId };
    }
    throw new BadRequestError({ message: "Invalid scope provided for the factory" });
  };

  const onCreateRoleGuard: TRoleScopeFactory["onCreateRoleGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      orgId: dto.permission.orgId,
      actorAuthMethod: dto.permission.authMethod,
      actorOrgId: dto.permission.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Role);
  };

  const onUpdateRoleGuard: TRoleScopeFactory["onUpdateRoleGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      orgId: dto.permission.orgId,
      actorAuthMethod: dto.permission.authMethod,
      actorOrgId: dto.permission.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Role);
  };

  const onDeleteRoleGuard: TRoleScopeFactory["onDeleteRoleGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      orgId: dto.permission.orgId,
      actorAuthMethod: dto.permission.authMethod,
      actorOrgId: dto.permission.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Role);

    const externalGroupMapping = await externalGroupOrgRoleMappingDAL.findOne({
      orgId: dto.permission.orgId,
      roleId: dto.selector.id
    });

    if (externalGroupMapping)
      throw new BadRequestError({
        message:
          "Cannot delete role assigned to external group organization role mapping. Please re-assign external mapping and try again."
      });
  };

  const onListRoleGuard: TRoleScopeFactory["onListRoleGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      orgId: dto.permission.orgId,
      actorAuthMethod: dto.permission.authMethod,
      actorOrgId: dto.permission.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Role);
  };

  const onGetRoleByIdGuard: TRoleScopeFactory["onGetRoleByIdGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      orgId: dto.permission.orgId,
      actorAuthMethod: dto.permission.authMethod,
      actorOrgId: dto.permission.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Role);
  };

  const onGetRoleBySlugGuard: TRoleScopeFactory["onGetRoleBySlugGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      orgId: dto.permission.orgId,
      actorAuthMethod: dto.permission.authMethod,
      actorOrgId: dto.permission.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Role);
  };

  const getPredefinedRoles: TRoleScopeFactory["getPredefinedRoles"] = (scopeData): TPredefinedRole[] => {
    const scope = getScopeField(scopeData);
    return [
      {
        // Stable sentinel UUID — admin has no DB row so we use a fixed well-known UUID
        id: "b11b49a9-09a9-4443-916a-4246f9ff2c69",
        slug: OrgMembershipRole.Admin,
        name: "Admin",
        description: "Complete administration access over the organization",
        isBuiltIn: true,
        permissions: adminOrgRolePermissions,
        orgId: scope.value,
        projectId: null,
        createdAt: new Date(0),
        updatedAt: new Date(0)
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
    getPredefinedRoles
  };
};
