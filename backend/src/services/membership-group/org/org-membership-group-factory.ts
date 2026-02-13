import { ForbiddenError } from "@casl/ability";

import { AccessScope, OrganizationActionScope, OrgMembershipRole } from "@app/db/schemas";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { OrgPermissionGroupActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, InternalServerError, PermissionBoundaryError } from "@app/lib/errors";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { isCustomOrgRole } from "@app/services/org/org-role-fns";

import { TMembershipGroupScopeFactory } from "../membership-group-types";

type TOrgMembershipGroupScopeFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getOrgPermissionByRoles">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  groupDAL: Pick<TGroupDALFactory, "findById">;
};

export const newOrgMembershipGroupFactory = ({
  permissionService,
  orgDAL,
  groupDAL
}: TOrgMembershipGroupScopeFactoryDep): TMembershipGroupScopeFactory => {
  const getScopeField: TMembershipGroupScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Organization) {
      return { key: "orgId" as const, value: dto.orgId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the org factory" });
  };

  const getScopeDatabaseFields: TMembershipGroupScopeFactory["getScopeDatabaseFields"] = (dto) => {
    if (dto.scope === AccessScope.Organization) {
      return { scopeOrgId: dto.orgId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the org factory" });
  };

  const isCustomRole: TMembershipGroupScopeFactory["isCustomRole"] = (role: string) => isCustomOrgRole(role);

  const onCreateMembershipGroupGuard: TMembershipGroupScopeFactory["onCreateMembershipGroupGuard"] = async (dto) => {
    const isSubOrg = dto.permission.orgId !== dto.permission.rootOrgId;
    if (!isSubOrg) {
      throw new BadRequestError({
        message: "Organization membership cannot be created for groups in root organization"
      });
    }

    const { permission } = await permissionService.getOrgPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      orgId: dto.permission.orgId,
      actorAuthMethod: dto.permission.authMethod,
      actorOrgId: dto.permission.orgId,
      scope: OrganizationActionScope.ChildOrganization
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Create, OrgPermissionSubjects.Groups);

    const group = await groupDAL.findById(dto.data.groupId);
    if (!group || group.orgId !== dto.permission.rootOrgId) {
      throw new BadRequestError({
        message: "Only groups from parent organization can be linked to this sub-organization"
      });
    }

    const permissionRoles = await permissionService.getOrgPermissionByRoles(
      dto.data.roles.map((el) => el.role),
      dto.permission.orgId
    );
    const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(dto.permission.orgId);
    for (const permissionRole of permissionRoles) {
      if (permissionRole?.role?.name !== OrgMembershipRole.NoAccess) {
        const permissionBoundary = validatePrivilegeChangeOperation(
          shouldUseNewPrivilegeSystem,
          OrgPermissionGroupActions.GrantPrivileges,
          OrgPermissionSubjects.Groups,
          permission,
          permissionRole.permission
        );
        if (!permissionBoundary.isValid)
          throw new PermissionBoundaryError({
            message: constructPermissionErrorMessage(
              "Failed to link group to sub-organization",
              shouldUseNewPrivilegeSystem,
              OrgPermissionGroupActions.GrantPrivileges,
              OrgPermissionSubjects.Groups
            ),
            details: { missingPermissions: permissionBoundary.missingPermissions }
          });
      }
    }
  };

  const onUpdateMembershipGroupGuard: TMembershipGroupScopeFactory["onUpdateMembershipGroupGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      orgId: dto.permission.orgId,
      actorAuthMethod: dto.permission.authMethod,
      actorOrgId: dto.permission.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Edit, OrgPermissionSubjects.Groups);
    const permissionRoles = await permissionService.getOrgPermissionByRoles(
      dto.data.roles.map((el) => el.role),
      dto.permission.orgId
    );

    const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(dto.permission.orgId);
    for (const permissionRole of permissionRoles) {
      if (permissionRole?.role?.name !== OrgMembershipRole.NoAccess) {
        const permissionBoundary = validatePrivilegeChangeOperation(
          shouldUseNewPrivilegeSystem,
          OrgPermissionGroupActions.GrantPrivileges,
          OrgPermissionSubjects.Groups,
          permission,
          permissionRole.permission
        );
        if (!permissionBoundary.isValid)
          throw new PermissionBoundaryError({
            message: constructPermissionErrorMessage(
              "Failed to create group org membership",
              shouldUseNewPrivilegeSystem,
              OrgPermissionGroupActions.GrantPrivileges,
              OrgPermissionSubjects.Groups
            ),
            details: { missingPermissions: permissionBoundary.missingPermissions }
          });
      }
    }
  };

  const onDeleteMembershipGroupGuard: TMembershipGroupScopeFactory["onDeleteMembershipGroupGuard"] = async (dto) => {
    const group = await groupDAL.findById(dto.selector.groupId);
    if (!group || group.orgId === dto.permission.orgId) {
      throw new BadRequestError({
        message: "Unlink is only allowed for linked groups. This group was created in this organization."
      });
    }

    const { permission } = await permissionService.getOrgPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      orgId: dto.permission.orgId,
      actorAuthMethod: dto.permission.authMethod,
      actorOrgId: dto.permission.orgId,
      scope: OrganizationActionScope.ChildOrganization
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Delete, OrgPermissionSubjects.Groups);
  };

  const onListMembershipGroupGuard: TMembershipGroupScopeFactory["onListMembershipGroupGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      orgId: dto.permission.orgId,
      actorAuthMethod: dto.permission.authMethod,
      actorOrgId: dto.permission.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Read, OrgPermissionSubjects.Groups);
  };

  const onGetMembershipGroupByGroupIdGuard: TMembershipGroupScopeFactory["onGetMembershipGroupByGroupIdGuard"] = async (
    dto
  ) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      orgId: dto.permission.orgId,
      actorAuthMethod: dto.permission.authMethod,
      actorOrgId: dto.permission.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Read, OrgPermissionSubjects.Groups);
  };

  return {
    onCreateMembershipGroupGuard,
    onUpdateMembershipGroupGuard,
    onDeleteMembershipGroupGuard,
    onListMembershipGroupGuard,
    onGetMembershipGroupByGroupIdGuard,
    getScopeField,
    getScopeDatabaseFields,
    isCustomRole
  };
};
