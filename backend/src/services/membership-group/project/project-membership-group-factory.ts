import { AccessScope, getAdminMemberOnlyProductLabel, ProjectMembershipRole } from "@app/db/schemas";
import {
  isCustomProjectRole,
  ProjectPermissionGroupActions,
  ProjectPermissionSub,
  TProjectPermissionService
} from "@app/domains/platform/projects/ce/module";
import { TSecretsPermissionService } from "@app/domains/secrets-manager/secrets/ce/module";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import {
  filterRolesNeedingPrivilegeBoundary,
  resolveMembershipRoleSlugs,
  toBoundsTargets
} from "@app/services/membership/membership-fns";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TMembershipGroupDALFactory } from "../membership-group-dal";
import { TMembershipGroupScopeFactory } from "../membership-group-types";

type TProjectMembershipGroupScopeFactoryDep = {
  projectPermissionService: TProjectPermissionService;
  secretsPermissionService: TSecretsPermissionService;
  membershipGroupDAL: Pick<TMembershipGroupDALFactory, "findOne" | "getGroupById">;
  groupDAL: Pick<TGroupDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
};

export const newProjectMembershipGroupFactory = ({
  projectPermissionService,
  secretsPermissionService,
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
    const permission = await secretsPermissionService.getProjectPermissionWithFolderGrants({
      actor: dto.actor,
      projectId: scope.value
    });
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

    const permissionRoles = await projectPermissionService.getProjectPermissionByRoles({
      projectId: scope.value,
      roles: filterRolesNeedingPrivilegeBoundary(dto.data.roles).map((el) => el.role)
    });
    for (const permissionRole of permissionRoles) {
      permission.assertBounds({
        actions: [ProjectPermissionGroupActions.AssignRole, ProjectPermissionGroupActions.GrantPrivileges],
        subject: ProjectPermissionSub.Groups,
        fields: { groupName: groupDetails.name, assignableRole: permissionRole.role?.slug },
        targets: [{ permission: permissionRole.permission }],
        message: "Failed to create group project membership"
      });
    }

    return { group: { id: groupDetails.id, name: groupDetails.name } };
  };

  const onUpdateMembershipGroupGuard: TMembershipGroupScopeFactory["onUpdateMembershipGroupGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await secretsPermissionService.getProjectPermissionWithFolderGrants({
      actor: dto.actor,
      projectId: scope.value
    });
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

    const targetMembership = await membershipGroupDAL.getGroupById({
      scopeData: dto.scopeData,
      groupId: dto.selector.groupId
    });
    const targetRoles = targetMembership ? resolveMembershipRoleSlugs(targetMembership.roles) : [];
    const targetPermissions = await projectPermissionService.getProjectPermissionByRoles({
      projectId: scope.value,
      roles: targetRoles,
      ignoreUnresolvedRoles: true
    });

    permission.assertBounds({
      actions: [ProjectPermissionGroupActions.AssignRole, ProjectPermissionGroupActions.GrantPrivileges],
      subject: ProjectPermissionSub.Groups,
      fields: { groupName: groupDetails.name },
      targets: toBoundsTargets(targetPermissions),
      message: "Failed to change the roles of a more privileged group"
    });

    const permissionRoles = await projectPermissionService.getProjectPermissionByRoles({
      projectId: scope.value,
      roles: filterRolesNeedingPrivilegeBoundary(dto.data.roles).map((el) => el.role)
    });
    for (const permissionRole of permissionRoles) {
      permission.assertBounds({
        actions: [ProjectPermissionGroupActions.AssignRole, ProjectPermissionGroupActions.GrantPrivileges],
        subject: ProjectPermissionSub.Groups,
        fields: { groupName: groupDetails.name, assignableRole: permissionRole.role?.slug },
        targets: [{ permission: permissionRole.permission }],
        message: "Failed to update group project membership"
      });
    }

    return { group: { id: groupDetails.id, name: groupDetails.name } };
  };

  const onDeleteMembershipGroupGuard: TMembershipGroupScopeFactory["onDeleteMembershipGroupGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await secretsPermissionService.getProjectPermissionWithFolderGrants({
      actor: dto.actor,
      projectId: scope.value
    });

    permission.assert({ action: ProjectPermissionGroupActions.Delete, subject: ProjectPermissionSub.Groups });

    const groupDetails = await groupDAL.findById(dto.selector.groupId);
    if (!groupDetails) throw new BadRequestError({ message: "Group details not found" });

    const targetMembership = await membershipGroupDAL.getGroupById({
      scopeData: dto.scopeData,
      groupId: dto.selector.groupId
    });
    const targetRoles = targetMembership ? resolveMembershipRoleSlugs(targetMembership.roles) : [];
    const targetPermissions = await projectPermissionService.getProjectPermissionByRoles({
      projectId: scope.value,
      roles: targetRoles,
      ignoreUnresolvedRoles: true
    });

    permission.assertBounds({
      actions: ProjectPermissionGroupActions.Delete,
      subject: ProjectPermissionSub.Groups,
      fields: { groupName: groupDetails.name },
      targets: toBoundsTargets(targetPermissions),
      message: "Failed to remove a more privileged group from the project"
    });

    return { group: { id: groupDetails.id, name: groupDetails.name } };
  };

  const onListMembershipGroupGuard: TMembershipGroupScopeFactory["onListMembershipGroupGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await secretsPermissionService.getProjectPermissionWithFolderGrants({
      actor: dto.actor,
      projectId: scope.value
    });

    permission.assert({ action: ProjectPermissionGroupActions.Read, subject: ProjectPermissionSub.Groups });
  };

  const onGetMembershipGroupByGroupIdGuard: TMembershipGroupScopeFactory["onGetMembershipGroupByGroupIdGuard"] = async (
    dto
  ) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await secretsPermissionService.getProjectPermissionWithFolderGrants({
      actor: dto.actor,
      projectId: scope.value
    });

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
