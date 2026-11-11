import { AccessScope, OrganizationActionScope } from "@app/db/schemas";
import type { TActorContext, TActorContexts } from "@app/domains/lib/actor-context";
import {
  assertRoleSetBoundary,
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/domains/platform/access-control/ce/module";
import {
  OrgPermissionGroupActions,
  OrgPermissionSubjects,
  OrgPermissionSubOrgActions,
  TOrganizationsDomain
} from "@app/domains/platform/organizations/ce/module";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { BadRequestError, InternalServerError, NotFoundError, PermissionBoundaryError } from "@app/lib/errors";
import {
  filterRolesNeedingPrivilegeBoundary,
  resolveMembershipRoleSlugs,
  toRoleAbilities
} from "@app/services/membership/membership-fns";
import { isCustomOrgRole } from "@app/services/org/org-role-fns";

import { TMembershipGroupDALFactory } from "../membership-group-dal";
import { TMembershipGroupScopeFactory } from "../membership-group-types";

type TOrgMembershipGroupScopeFactoryDep = {
  organizationsDomain: Pick<TOrganizationsDomain, "getOrgPermission" | "getOrgPermissionByRoles">;
  actorContexts: Pick<TActorContexts, "forPrincipal">;
  groupDAL: Pick<TGroupDALFactory, "findById">;
  membershipGroupDAL: Pick<TMembershipGroupDALFactory, "getGroupById">;
};

export const newOrgMembershipGroupFactory = ({
  organizationsDomain,
  actorContexts,
  groupDAL,
  membershipGroupDAL
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

  const isGroupLinkedFromRootOrg = (actor: TActorContext, groupOrgId: string) =>
    actor.org.id !== actor.org.rootOrgId && groupOrgId !== actor.org.id;

  const $assertCanLinkRootGroup = async (actor: TActorContext) => {
    const rootOrgActor = await actorContexts.forPrincipal(actor.principal, actor.org.rootOrgId);
    const rootOrgPermission = await organizationsDomain.getOrgPermission({ actor: rootOrgActor });
    rootOrgPermission.assert({
      action: OrgPermissionSubOrgActions.LinkGroup,
      subject: OrgPermissionSubjects.SubOrganization
    });
  };

  const $getGroupInActorScope = async (actor: TActorContext, groupId: string) => {
    const group = await groupDAL.findById(groupId);
    if (!group || (group.orgId !== actor.org.id && group.orgId !== actor.org.rootOrgId)) {
      throw new NotFoundError({ message: `Group with ID '${groupId}' not found` });
    }
    return group;
  };

  const onCreateMembershipGroupGuard: TMembershipGroupScopeFactory["onCreateMembershipGroupGuard"] = async (dto) => {
    const isSubOrg = dto.actor.org.id !== dto.actor.org.rootOrgId;
    if (!isSubOrg) {
      throw new BadRequestError({
        message: "Organization membership cannot be created for groups in root organization"
      });
    }
    await $assertCanLinkRootGroup(dto.actor);

    const permission = await organizationsDomain.getOrgPermission({
      actor: dto.actor,
      scope: OrganizationActionScope.ChildOrganization
    });
    permission.assert({ action: OrgPermissionGroupActions.Create, subject: OrgPermissionSubjects.Groups });

    const group = await $getGroupInActorScope(dto.actor, dto.data.groupId);
    if (group.orgId === dto.actor.org.id) {
      throw new BadRequestError({
        message: `Group '${group.name}' belongs to this organization. Only groups from the parent organization can be linked to it.`
      });
    }

    const permissionRoles = await organizationsDomain.getOrgPermissionByRoles({
      orgId: dto.actor.org.id,
      roles: filterRolesNeedingPrivilegeBoundary(dto.data.roles).map((el) => el.role)
    });
    const { shouldUseNewPrivilegeSystem } = dto.actor.org;
    for (const permissionRole of permissionRoles) {
      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        OrgPermissionGroupActions.GrantPrivileges,
        OrgPermissionSubjects.Groups,
        permission.toAbility(),
        permissionRole.permission.toAbility()
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

    return { group: { id: group.id, name: group.name } };
  };

  const onUpdateMembershipGroupGuard: TMembershipGroupScopeFactory["onUpdateMembershipGroupGuard"] = async (dto) => {
    const permission = await organizationsDomain.getOrgPermission({ actor: dto.actor });
    permission.assert({ action: OrgPermissionGroupActions.Edit, subject: OrgPermissionSubjects.Groups });

    const groupDetails = await $getGroupInActorScope(dto.actor, dto.selector.groupId);
    if (isGroupLinkedFromRootOrg(dto.actor, groupDetails.orgId)) {
      await $assertCanLinkRootGroup(dto.actor);
    }

    const permissionRoles = await organizationsDomain.getOrgPermissionByRoles({
      orgId: dto.actor.org.id,
      roles: filterRolesNeedingPrivilegeBoundary(dto.data.roles).map((el) => el.role)
    });

    const { shouldUseNewPrivilegeSystem } = dto.actor.org;

    const targetMembership = await membershipGroupDAL.getGroupById({
      scopeData: dto.scopeData,
      groupId: dto.selector.groupId
    });
    const targetRoles = targetMembership ? resolveMembershipRoleSlugs(targetMembership.roles) : [];
    const targetPermissions = await organizationsDomain.getOrgPermissionByRoles({
      orgId: dto.actor.org.id,
      roles: targetRoles,
      ignoreUnresolvedRoles: true
    });

    assertRoleSetBoundary({
      shouldUseNewPrivilegeSystem,
      opActions: OrgPermissionGroupActions.GrantPrivileges,
      opSubject: OrgPermissionSubjects.Groups,
      actorPermission: permission.toAbility(),
      targetPermissions: toRoleAbilities(targetPermissions),
      baseMessage: "Failed to change the roles of a more privileged group"
    });

    for (const permissionRole of permissionRoles) {
      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        OrgPermissionGroupActions.GrantPrivileges,
        OrgPermissionSubjects.Groups,
        permission.toAbility(),
        permissionRole.permission.toAbility()
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

    return { group: { id: groupDetails.id, name: groupDetails.name } };
  };

  const onDeleteMembershipGroupGuard: TMembershipGroupScopeFactory["onDeleteMembershipGroupGuard"] = async (dto) => {
    const permission = await organizationsDomain.getOrgPermission({
      actor: dto.actor,
      scope: OrganizationActionScope.ChildOrganization
    });
    permission.assert({ action: OrgPermissionGroupActions.Delete, subject: OrgPermissionSubjects.Groups });

    const group = await $getGroupInActorScope(dto.actor, dto.selector.groupId);
    if (group.orgId === dto.actor.org.id) {
      throw new BadRequestError({
        message: `Group '${group.name}' belongs to this organization and can't be unlinked from it. Delete the group instead.`
      });
    }
    await $assertCanLinkRootGroup(dto.actor);

    const targetMembership = await membershipGroupDAL.getGroupById({
      scopeData: dto.scopeData,
      groupId: dto.selector.groupId
    });
    const targetRoles = targetMembership ? resolveMembershipRoleSlugs(targetMembership.roles) : [];
    const targetPermissions = await organizationsDomain.getOrgPermissionByRoles({
      orgId: dto.actor.org.id,
      roles: targetRoles,
      ignoreUnresolvedRoles: true
    });
    const { shouldUseNewPrivilegeSystem } = dto.actor.org;

    assertRoleSetBoundary({
      shouldUseNewPrivilegeSystem,
      opActions: OrgPermissionGroupActions.Delete,
      opSubject: OrgPermissionSubjects.Groups,
      actorPermission: permission.toAbility(),
      targetPermissions: toRoleAbilities(targetPermissions),
      baseMessage: "Failed to remove a more privileged group from the organization"
    });

    return { group: { id: group.id, name: group.name } };
  };

  const onListMembershipGroupGuard: TMembershipGroupScopeFactory["onListMembershipGroupGuard"] = async (dto) => {
    const permission = await organizationsDomain.getOrgPermission({ actor: dto.actor });
    permission.assert({ action: OrgPermissionGroupActions.Read, subject: OrgPermissionSubjects.Groups });
  };

  const onGetMembershipGroupByGroupIdGuard: TMembershipGroupScopeFactory["onGetMembershipGroupByGroupIdGuard"] = async (
    dto
  ) => {
    const permission = await organizationsDomain.getOrgPermission({ actor: dto.actor });
    permission.assert({ action: OrgPermissionGroupActions.Read, subject: OrgPermissionSubjects.Groups });
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
