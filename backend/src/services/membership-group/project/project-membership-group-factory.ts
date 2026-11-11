import { AccessScope, getAdminMemberOnlyProductLabel, ProjectMembershipRole } from "@app/db/schemas";
import {
  assertRoleSetBoundary,
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/domains/platform/access-control/ce/module";
import {
  isCustomProjectRole,
  ProjectPermissionGroupActions,
  ProjectPermissionSub,
  TProjectsDomain
} from "@app/domains/platform/projects/ce/module";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { BadRequestError, InternalServerError, PermissionBoundaryError } from "@app/lib/errors";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import {
  filterRolesNeedingPrivilegeBoundary,
  resolveMembershipRoleSlugs,
  toRoleAbilities
} from "@app/services/membership/membership-fns";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TMembershipGroupDALFactory } from "../membership-group-dal";
import { TMembershipGroupScopeFactory } from "../membership-group-types";

type TProjectMembershipGroupScopeFactoryDep = {
  projectsDomain: Pick<TProjectsDomain, "getProjectPermission" | "getProjectPermissionByRoles">;
  membershipGroupDAL: Pick<TMembershipGroupDALFactory, "findOne" | "getGroupById">;
  groupDAL: Pick<TGroupDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
};

export const newProjectMembershipGroupFactory = ({
  projectsDomain,
  membershipGroupDAL,
  groupDAL,
  projectDAL
}: TProjectMembershipGroupScopeFactoryDep): TMembershipGroupScopeFactory => {
  const getScopeField: TMembershipGroupScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Project) {
      return { key: "projectId" as const, value: dto.projectId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the project factory" });
  };

  const getScopeDatabaseFields: TMembershipGroupScopeFactory["getScopeDatabaseFields"] = (dto) => {
    if (dto.scope === AccessScope.Project) {
      return { scopeOrgId: dto.orgId, scopeProjectId: dto.projectId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the project factory" });
  };

  const isCustomRole: TMembershipGroupScopeFactory["isCustomRole"] = (role) => isCustomProjectRole(role);

  const onCreateMembershipGroupGuard: TMembershipGroupScopeFactory["onCreateMembershipGroupGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectsDomain.getProjectPermission({ actor: dto.actor, projectId: scope.value });
    permission.assert({ action: ProjectPermissionGroupActions.Create, subject: ProjectPermissionSub.Groups });

    const project = await requestMemoize(requestMemoKeys.projectFindById(scope.value), () =>
      projectDAL.findById(scope.value)
    );
    const adminMemberOnlyLabel = getAdminMemberOnlyProductLabel(project?.type);
    if (adminMemberOnlyLabel) {
      const invalidRoles = dto.data.roles.filter(
        (r) => r.role !== ProjectMembershipRole.Admin && r.role !== ProjectMembershipRole.Member
      );
      if (invalidRoles.length > 0) {
        throw new BadRequestError({
          message: `${adminMemberOnlyLabel} only supports Admin and Member roles.`
        });
      }
      // One role per membership: the product routes write exactly one, and their member lists read one.
      if (dto.data.roles.length > 1) {
        throw new BadRequestError({
          message: `${adminMemberOnlyLabel} memberships hold a single role.`
        });
      }
    }

    const orgMembership = await membershipGroupDAL.findOne({
      actorGroupId: dto.data.groupId,
      scopeOrgId: dto.actor.org.id,
      scope: AccessScope.Organization
    });
    if (!orgMembership)
      throw new BadRequestError({ message: `Group ${dto.data.groupId} is missing organization membership` });

    const groupDetails = await groupDAL.findById(dto.data.groupId);
    if (!groupDetails) throw new BadRequestError({ message: "Group details not found" });

    const { shouldUseNewPrivilegeSystem } = dto.actor.org;
    const permissionRoles = await projectsDomain.getProjectPermissionByRoles({
      projectId: scope.value,
      roles: filterRolesNeedingPrivilegeBoundary(dto.data.roles).map((el) => el.role)
    });
    for (const permissionRole of permissionRoles) {
      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        [ProjectPermissionGroupActions.AssignRole, ProjectPermissionGroupActions.GrantPrivileges],
        ProjectPermissionSub.Groups,
        permission.toAbility(),
        permissionRole.permission.toAbility(),
        { groupName: groupDetails.name, assignableRole: permissionRole.role?.slug }
      );

      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to create group project membership",
            shouldUseNewPrivilegeSystem,
            ProjectPermissionGroupActions.AssignRole,
            ProjectPermissionSub.Groups
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }

    return { group: { id: groupDetails.id, name: groupDetails.name } };
  };

  const onUpdateMembershipGroupGuard: TMembershipGroupScopeFactory["onUpdateMembershipGroupGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectsDomain.getProjectPermission({ actor: dto.actor, projectId: scope.value });
    permission.assert({ action: ProjectPermissionGroupActions.Edit, subject: ProjectPermissionSub.Groups });

    const project = await requestMemoize(requestMemoKeys.projectFindById(scope.value), () =>
      projectDAL.findById(scope.value)
    );
    const adminMemberOnlyLabel = getAdminMemberOnlyProductLabel(project?.type);
    if (adminMemberOnlyLabel) {
      const invalidRoles = dto.data.roles.filter(
        (r) => r.role !== ProjectMembershipRole.Admin && r.role !== ProjectMembershipRole.Member
      );
      if (invalidRoles.length > 0) {
        throw new BadRequestError({
          message: `${adminMemberOnlyLabel} only supports Admin and Member roles.`
        });
      }
      // One role per membership: the product routes write exactly one, and their member lists read one.
      if (dto.data.roles.length > 1) {
        throw new BadRequestError({
          message: `${adminMemberOnlyLabel} memberships hold a single role.`
        });
      }
    }

    const orgMembership = await membershipGroupDAL.findOne({
      actorGroupId: dto.selector.groupId,
      scopeOrgId: dto.actor.org.id,
      scope: AccessScope.Organization
    });
    if (!orgMembership)
      throw new BadRequestError({ message: `Group ${dto.selector.groupId} is missing organization membership` });

    const groupDetails = await groupDAL.findById(dto.selector.groupId);
    if (!groupDetails) throw new BadRequestError({ message: "Group details not found" });

    const { shouldUseNewPrivilegeSystem } = dto.actor.org;

    const targetMembership = await membershipGroupDAL.getGroupById({
      scopeData: dto.scopeData,
      groupId: dto.selector.groupId
    });
    const targetRoles = targetMembership ? resolveMembershipRoleSlugs(targetMembership.roles) : [];
    const targetPermissions = await projectsDomain.getProjectPermissionByRoles({
      projectId: scope.value,
      roles: targetRoles,
      ignoreUnresolvedRoles: true
    });

    assertRoleSetBoundary({
      shouldUseNewPrivilegeSystem,
      opActions: [ProjectPermissionGroupActions.AssignRole, ProjectPermissionGroupActions.GrantPrivileges],
      opSubject: ProjectPermissionSub.Groups,
      actorPermission: permission.toAbility(),
      targetPermissions: toRoleAbilities(targetPermissions),
      baseMessage: "Failed to change the roles of a more privileged group",
      subjectFields: { groupName: groupDetails.name }
    });

    const permissionRoles = await projectsDomain.getProjectPermissionByRoles({
      projectId: scope.value,
      roles: filterRolesNeedingPrivilegeBoundary(dto.data.roles).map((el) => el.role)
    });
    for (const permissionRole of permissionRoles) {
      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        [ProjectPermissionGroupActions.AssignRole, ProjectPermissionGroupActions.GrantPrivileges],
        ProjectPermissionSub.Groups,
        permission.toAbility(),
        permissionRole.permission.toAbility(),
        { groupName: groupDetails.name, assignableRole: permissionRole.role?.slug }
      );

      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to update group project membership",
            shouldUseNewPrivilegeSystem,
            ProjectPermissionGroupActions.AssignRole,
            ProjectPermissionSub.Groups
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }

    return { group: { id: groupDetails.id, name: groupDetails.name } };
  };

  const onDeleteMembershipGroupGuard: TMembershipGroupScopeFactory["onDeleteMembershipGroupGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectsDomain.getProjectPermission({ actor: dto.actor, projectId: scope.value });

    permission.assert({ action: ProjectPermissionGroupActions.Delete, subject: ProjectPermissionSub.Groups });

    const groupDetails = await groupDAL.findById(dto.selector.groupId);
    if (!groupDetails) throw new BadRequestError({ message: "Group details not found" });

    const targetMembership = await membershipGroupDAL.getGroupById({
      scopeData: dto.scopeData,
      groupId: dto.selector.groupId
    });
    const targetRoles = targetMembership ? resolveMembershipRoleSlugs(targetMembership.roles) : [];
    const targetPermissions = await projectsDomain.getProjectPermissionByRoles({
      projectId: scope.value,
      roles: targetRoles,
      ignoreUnresolvedRoles: true
    });
    const { shouldUseNewPrivilegeSystem } = dto.actor.org;

    assertRoleSetBoundary({
      shouldUseNewPrivilegeSystem,
      opActions: ProjectPermissionGroupActions.Delete,
      opSubject: ProjectPermissionSub.Groups,
      actorPermission: permission.toAbility(),
      targetPermissions: toRoleAbilities(targetPermissions),
      baseMessage: "Failed to remove a more privileged group from the project",
      subjectFields: { groupName: groupDetails.name }
    });

    return { group: { id: groupDetails.id, name: groupDetails.name } };
  };

  const onListMembershipGroupGuard: TMembershipGroupScopeFactory["onListMembershipGroupGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectsDomain.getProjectPermission({ actor: dto.actor, projectId: scope.value });

    permission.assert({ action: ProjectPermissionGroupActions.Read, subject: ProjectPermissionSub.Groups });
  };

  const onGetMembershipGroupByGroupIdGuard: TMembershipGroupScopeFactory["onGetMembershipGroupByGroupIdGuard"] = async (
    dto
  ) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectsDomain.getProjectPermission({ actor: dto.actor, projectId: scope.value });

    permission.assert({ action: ProjectPermissionGroupActions.Read, subject: ProjectPermissionSub.Groups });
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
