import { ForbiddenError } from "@casl/ability";

import { AccessScope, OrganizationActionScope } from "@app/db/schemas/models";
import {
  orgAdminPermissions,
  orgMemberPermissions,
  orgNoAccessPermissions,
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError } from "@app/lib/errors";
import { TExternalGroupOrgRoleMappingDALFactory } from "@app/services/external-group-org-role-mapping/external-group-org-role-mapping-dal";
import { isCustomOrgRole } from "@app/services/org/org-role-fns";

import { TRoleScopeFactory } from "../role-types";

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

  const isCustomRole: TRoleScopeFactory["isCustomRole"] = (role: string) => isCustomOrgRole(role);

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

  const getPredefinedRoles: TRoleScopeFactory["getPredefinedRoles"] = async (scopeData) => {
    const scopeField = getScopeField(scopeData);
    return [
      {
        id: "b11b49a9-09a9-4443-916a-4246f9ff2c69", // dummy userid
        name: "Admin",
        slug: "admin",
        orgId: scopeField.value,
        description: "Complete administration access over the organization",
        permissions: orgAdminPermissions,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "b11b49a9-09a9-4443-916a-4246f9ff2c70", // dummy user for zod validation in response
        name: "Member",
        slug: "member",
        orgId: scopeField.value,
        description: "Non-administrative role in an organization",
        permissions: orgMemberPermissions,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "b10d49a9-09a9-4443-916a-4246f9ff2c72", // dummy user for zod validation in response
        name: "No Access",
        slug: "no-access",
        orgId: scopeField.value,
        description: "No access to any resources in the organization",
        permissions: orgNoAccessPermissions,
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
    getPredefinedRoles,
    isCustomRole
  };
};
