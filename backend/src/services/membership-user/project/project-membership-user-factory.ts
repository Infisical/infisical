import {
  AccessScope,
  getAdminMemberOnlyProductLabel,
  OrgMembershipStatus,
  ProjectMembershipRole
} from "@app/db/schemas";
import {
  isCustomProjectRole,
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  TProjectPermissionService
} from "@app/domains/platform/projects/ce/module";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import {
  filterRolesNeedingPrivilegeBoundary,
  resolveMembershipRoleSlugs,
  toBoundsTargets
} from "@app/services/membership/membership-fns";
import { assertPermissionBounds } from "@app/services/membership/permission-bounds";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectAccessRequestDALFactory } from "@app/services/project/project-access-request-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TMembershipUserDALFactory } from "../membership-user-dal";
import { TMembershipUserScopeFactory } from "../membership-user-types";

type TProjectMembershipUserScopeFactoryDep = {
  projectPermissionService: TProjectPermissionService;
  orgDAL: Pick<TOrgDALFactory, "findActorsWithActiveOrgAccess" | "findActorsWithOrgAccess">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  membershipUserDAL: Pick<TMembershipUserDALFactory, "find" | "getUserById">;
  smtpService: Pick<TSmtpService, "sendMail">;
  userDAL: Pick<TUserDALFactory, "findById">;
  projectAccessRequestDAL: Pick<TProjectAccessRequestDALFactory, "delete">;
};

export const newProjectMembershipUserFactory = ({
  projectPermissionService,
  orgDAL,
  projectDAL,
  membershipUserDAL,
  smtpService,
  userDAL,
  projectAccessRequestDAL
}: TProjectMembershipUserScopeFactoryDep): TMembershipUserScopeFactory => {
  const getScopeField: TMembershipUserScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Project) {
      return { key: "projectId" as const, value: dto.projectId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the project factory" });
  };

  const getScopeDatabaseFields: TMembershipUserScopeFactory["getScopeDatabaseFields"] = (dto) => {
    if (dto.scope === AccessScope.Project) {
      return { scopeOrgId: dto.orgId, scopeProjectId: dto.projectId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the project factory" });
  };

  const isCustomRole: TMembershipUserScopeFactory["isCustomRole"] = (role) => isCustomProjectRole(role);

  // Same add rule as everywhere else (findActorsWithActiveOrgAccess).
  const onCreateMembershipUserGuard: TMembershipUserScopeFactory["onCreateMembershipUserGuard"] = async (
    dto,
    newUsers,
    newUserEmails
  ) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectPermissionService.getProjectPermission({
      actor: dto.actor,
      projectId: scope.value
    });
    permission.assert({ action: ProjectPermissionMemberActions.Create, subject: ProjectPermissionSub.Member });

    const withOrgAccess = await orgDAL.findActorsWithActiveOrgAccess({
      orgId: dto.actor.org.id,
      userIds: newUsers.map((el) => el.id),
      identityIds: []
    });
    const withoutActiveAccess = newUsers.filter((el) => !withOrgAccess.userIds.has(el.id));
    if (withoutActiveAccess.length || newUserEmails.length) {
      const withAnyAccess = await orgDAL.findActorsWithOrgAccess({
        orgId: dto.actor.org.id,
        userIds: withoutActiveAccess.map((el) => el.id),
        identityIds: []
      });
      const deactivatedUsers = withoutActiveAccess.filter((el) => withAnyAccess.userIds.has(el.id));
      if (deactivatedUsers.length) {
        throw new BadRequestError({
          message: `${deactivatedUsers.map((el) => `'${el.email}'`).join(", ")} ${
            deactivatedUsers.length === 1 ? "is" : "are"
          } deactivated in this organization. Reactivate them before adding them to this project.`
        });
      }
      throw new BadRequestError({
        message: `Users ${[...withoutActiveAccess.map((el) => el.email), ...newUserEmails].join(",")} not part of organization`
      });
    }

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

    const { shouldUseNewPrivilegeSystem } = dto.actor.org;
    const permissionRoles = await projectPermissionService.getProjectPermissionByRoles({
      projectId: scope.value,
      roles: filterRolesNeedingPrivilegeBoundary(dto.data.roles).map((el) => el.role)
    });

    for (const permissionRole of permissionRoles) {
      // Per-user checks
      for (const newUser of newUsers) {
        assertPermissionBounds(permission, {
          usesNewPrivilegeSystem: shouldUseNewPrivilegeSystem,
          actions: [ProjectPermissionMemberActions.AssignRole, ProjectPermissionMemberActions.GrantPrivileges],
          subject: ProjectPermissionSub.Member,
          fields: {
            userEmail: newUser.email ?? undefined,
            assignableRole: permissionRole.role?.slug
          },
          targets: [{ permission: permissionRole.permission }],
          message: "Failed to create user project membership"
        });
      }
    }
  };

  // Only email users who can already sign in: accepted direct members and group-only members.
  const onCreateMembershipComplete: TMembershipUserScopeFactory["onCreateMembershipComplete"] = async (
    dto,
    newMembers
  ) => {
    const scopeField = getScopeField(dto.scopeData);
    const newMemberUserIds = newMembers.map((m) => m.id);
    if (newMemberUserIds.length) {
      await projectAccessRequestDAL.delete({
        projectId: scopeField.value,
        $in: { requesterUserId: newMemberUserIds }
      });
    }

    const newMemberIds = newMembers.map((el) => el.id);
    const directOrgMemberships = await membershipUserDAL.find({
      scope: AccessScope.Organization,
      scopeOrgId: dto.actor.org.id,
      $in: {
        actorUserId: newMemberIds
      }
    });
    const withOrgAccess = await orgDAL.findActorsWithActiveOrgAccess({
      orgId: dto.actor.org.id,
      userIds: newMemberIds,
      identityIds: []
    });
    const directByUserId = new Map(directOrgMemberships.map((el) => [el.actorUserId as string, el]));
    const orgMembershipAcceptedUserIds = newMemberIds.filter((userId) => {
      const direct = directByUserId.get(userId);
      return direct ? direct.status === OrgMembershipStatus.Accepted : withOrgAccess.userIds.has(userId);
    });

    if (!orgMembershipAcceptedUserIds.length) return { signUpTokens: [] };

    const appCfg = getConfig();
    const scope = getScopeField(dto.scopeData);
    const project = await requestMemoize(requestMemoKeys.projectFindById(scope.value), () =>
      projectDAL.findById(scope.value)
    );

    const emails = newMembers
      .filter((el) => Boolean(el?.email) && orgMembershipAcceptedUserIds.includes(el.id))
      .map((el) => el?.email as string);
    if (emails.length) {
      await smtpService.sendMail({
        template: SmtpTemplates.WorkspaceInvite,
        subjectLine: "Infisical project invitation",
        recipients: emails,
        substitutions: {
          workspaceName: project.name,
          callback_url: `${appCfg.SITE_URL}/login`
        }
      });
    }
    return { signUpTokens: [] };
  };

  const onUpdateMembershipUserGuard: TMembershipUserScopeFactory["onUpdateMembershipUserGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectPermissionService.getProjectPermission({
      actor: dto.actor,
      projectId: scope.value
    });
    permission.assert({ action: ProjectPermissionMemberActions.Edit, subject: ProjectPermissionSub.Member });

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

    const targetUser = await requestMemoize(requestMemoKeys.userFindById(dto.selector.userId), () =>
      userDAL.findById(dto.selector.userId)
    );
    if (!targetUser) {
      throw new NotFoundError({ message: `User not found for project membership update` });
    }

    const { shouldUseNewPrivilegeSystem } = dto.actor.org;

    const targetMembership = await membershipUserDAL.getUserById({
      scopeData: dto.scopeData,
      userId: dto.selector.userId
    });
    const targetRoles = targetMembership ? resolveMembershipRoleSlugs(targetMembership.roles) : [];
    const targetPermissions = await projectPermissionService.getProjectPermissionByRoles({
      projectId: scope.value,
      roles: targetRoles,
      ignoreUnresolvedRoles: true
    });
    assertPermissionBounds(permission, {
      usesNewPrivilegeSystem: shouldUseNewPrivilegeSystem,
      actions: [ProjectPermissionMemberActions.AssignRole, ProjectPermissionMemberActions.GrantPrivileges],
      subject: ProjectPermissionSub.Member,
      fields: { userEmail: targetUser.email || undefined },
      targets: toBoundsTargets(targetPermissions),
      message: "Failed to change the roles of a more privileged member"
    });

    const permissionRoles = await projectPermissionService.getProjectPermissionByRoles({
      projectId: scope.value,
      roles: filterRolesNeedingPrivilegeBoundary(dto.data.roles).map((el) => el.role)
    });

    for (const permissionRole of permissionRoles) {
      assertPermissionBounds(permission, {
        usesNewPrivilegeSystem: shouldUseNewPrivilegeSystem,
        actions: [ProjectPermissionMemberActions.AssignRole, ProjectPermissionMemberActions.GrantPrivileges],
        subject: ProjectPermissionSub.Member,
        fields: {
          userEmail: targetUser.email || undefined,
          assignableRole: permissionRole.role?.slug
        },
        targets: [{ permission: permissionRole.permission }],
        message: "Failed to update user project membership"
      });
    }
  };

  const onDeleteMembershipUserGuard: TMembershipUserScopeFactory["onDeleteMembershipUserGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectPermissionService.getProjectPermission({
      actor: dto.actor,
      projectId: scope.value
    });
    permission.assert({ action: ProjectPermissionMemberActions.Delete, subject: ProjectPermissionSub.Member });

    const targetMembership = await membershipUserDAL.getUserById({
      scopeData: dto.scopeData,
      userId: dto.selector.userId
    });
    const targetRoles = targetMembership ? resolveMembershipRoleSlugs(targetMembership.roles) : [];
    const targetPermissions = await projectPermissionService.getProjectPermissionByRoles({
      projectId: scope.value,
      roles: targetRoles,
      ignoreUnresolvedRoles: true
    });
    const { shouldUseNewPrivilegeSystem } = dto.actor.org;

    assertPermissionBounds(permission, {
      usesNewPrivilegeSystem: shouldUseNewPrivilegeSystem,
      actions: ProjectPermissionMemberActions.Delete,
      subject: ProjectPermissionSub.Member,
      fields: { userEmail: targetMembership?.user.email || undefined },
      targets: toBoundsTargets(targetPermissions),
      message: "Failed to remove a more privileged member from the project"
    });
  };

  const onListMembershipUserGuard: TMembershipUserScopeFactory["onListMembershipUserGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectPermissionService.getProjectPermission({
      actor: dto.actor,
      projectId: scope.value
    });
    permission.assert({ action: ProjectPermissionMemberActions.Read, subject: ProjectPermissionSub.Member });
  };

  const onGetMembershipUserByUserIdGuard: TMembershipUserScopeFactory["onGetMembershipUserByUserIdGuard"] = async (
    dto
  ) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectPermissionService.getProjectPermission({
      actor: dto.actor,
      projectId: scope.value
    });
    permission.assert({ action: ProjectPermissionMemberActions.Read, subject: ProjectPermissionSub.Member });
  };

  return {
    onCreateMembershipUserGuard,
    onCreateMembershipComplete,
    onUpdateMembershipUserGuard,
    onDeleteMembershipUserGuard,
    onListMembershipUserGuard,
    onGetMembershipUserByUserIdGuard,
    getScopeField,
    getScopeDatabaseFields,
    isCustomRole
  };
};
