import { ForbiddenError } from "@casl/ability";

import { AccessScope, ActionProjectType, OrgMembershipStatus, ProjectMembershipRole } from "@app/db/schemas";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  isCustomProjectRole,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, InternalServerError, NotFoundError, PermissionBoundaryError } from "@app/lib/errors";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TMembershipUserDALFactory } from "../membership-user-dal";
import { TMembershipUserScopeFactory } from "../membership-user-types";

type TProjectMembershipUserScopeFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getProjectPermissionByRoles">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  membershipUserDAL: Pick<TMembershipUserDALFactory, "find">;
  smtpService: Pick<TSmtpService, "sendMail">;
  userDAL: Pick<TUserDALFactory, "findById">;
};

export const newProjectMembershipUserFactory = ({
  permissionService,
  orgDAL,
  projectDAL,
  membershipUserDAL,
  smtpService,
  userDAL
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

  const onCreateMembershipUserGuard: TMembershipUserScopeFactory["onCreateMembershipUserGuard"] = async (
    dto,
    newUsers
  ) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Create, ProjectPermissionSub.Member);

    // TODO(namespace): this becomes tricky in namespace due to group flow
    const orgMemberships = await membershipUserDAL.find({
      scope: AccessScope.Organization,
      scopeOrgId: dto.permission.orgId,
      $in: {
        actorUserId: newUsers.map((el) => el.id)
      }
    });
    if (orgMemberships.length !== newUsers.length) {
      const missingUsers = newUsers
        .filter((el) => !orgMemberships.find((memb) => memb.actorUserId === el.id))
        .map((el) => el.email);
      throw new BadRequestError({ message: `Users ${missingUsers.join(",")} not part of organization` });
    }

    const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(dto.permission.orgId);
    const permissionRoles = await permissionService.getProjectPermissionByRoles(
      dto.data.roles.filter((el) => el.role !== ProjectMembershipRole.NoAccess).map((el) => el.role),
      scope.value
    );

    for (const permissionRole of permissionRoles) {
      // Quick unconditional check - skip per-user loop if actor has unrestricted permission
      let unconditionalBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        ProjectPermissionMemberActions.AssignRole,
        ProjectPermissionSub.Member,
        permission,
        permissionRole.permission
      );
      if (!unconditionalBoundary.isValid) {
        unconditionalBoundary = validatePrivilegeChangeOperation(
          shouldUseNewPrivilegeSystem,
          ProjectPermissionMemberActions.GrantPrivileges,
          ProjectPermissionSub.Member,
          permission,
          permissionRole.permission
        );
      }
      if (!unconditionalBoundary.isValid) {
        // Per-user checks only when permission has conditions
        for (const newUser of newUsers) {
          let permissionBoundary = validatePrivilegeChangeOperation(
            shouldUseNewPrivilegeSystem,
            ProjectPermissionMemberActions.AssignRole,
            ProjectPermissionSub.Member,
            permission,
            permissionRole.permission,
            {
              email: newUser.email ?? undefined,
              role: permissionRole.role?.slug
            }
          );

          // If new action fails, try legacy action
          if (!permissionBoundary.isValid) {
            permissionBoundary = validatePrivilegeChangeOperation(
              shouldUseNewPrivilegeSystem,
              ProjectPermissionMemberActions.GrantPrivileges,
              ProjectPermissionSub.Member,
              permission,
              permissionRole.permission,
              {
                email: newUser.email ?? undefined,
                role: permissionRole.role?.slug
              }
            );
          }

          if (!permissionBoundary.isValid)
            throw new PermissionBoundaryError({
              message: constructPermissionErrorMessage(
                "Failed to create user project membership",
                shouldUseNewPrivilegeSystem,
                ProjectPermissionMemberActions.AssignRole,
                ProjectPermissionSub.Member
              ),
              details: { missingPermissions: permissionBoundary.missingPermissions }
            });
        }
      }
    }
  };

  const onCreateMembershipComplete: TMembershipUserScopeFactory["onCreateMembershipComplete"] = async (
    dto,
    newMembers
  ) => {
    const orgMembershipAccepted = await membershipUserDAL.find({
      scope: AccessScope.Organization,
      scopeOrgId: dto.permission.orgId,
      status: OrgMembershipStatus.Accepted,
      $in: {
        actorUserId: newMembers.map((el) => el.id)
      }
    });

    if (!orgMembershipAccepted.length) return { signUpTokens: [] };

    const appCfg = getConfig();
    const scope = getScopeField(dto.scopeData);
    const project = await projectDAL.findById(scope.value);

    const orgMembershipAcceptedUserIds = orgMembershipAccepted.map((el) => el.actorUserId as string);
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
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Edit, ProjectPermissionSub.Member);

    const targetUser = await userDAL.findById(dto.selector.userId);
    if (!targetUser) {
      throw new NotFoundError({ message: `User not found for project membership update` });
    }

    const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(dto.permission.orgId);
    const permissionRoles = await permissionService.getProjectPermissionByRoles(
      dto.data.roles.filter((el) => el.role !== ProjectMembershipRole.NoAccess).map((el) => el.role),
      scope.value
    );

    for (const permissionRole of permissionRoles) {
      let permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        ProjectPermissionMemberActions.AssignRole,
        ProjectPermissionSub.Member,
        permission,
        permissionRole.permission,
        {
          email: targetUser.email || undefined,
          role: permissionRole.role?.slug
        }
      );

      // If new action fails, try legacy action
      if (!permissionBoundary.isValid) {
        permissionBoundary = validatePrivilegeChangeOperation(
          shouldUseNewPrivilegeSystem,
          ProjectPermissionMemberActions.GrantPrivileges,
          ProjectPermissionSub.Member,
          permission,
          permissionRole.permission,
          {
            email: targetUser.email || undefined,
            role: permissionRole.role?.slug
          }
        );
      }

      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to update user project membership",
            shouldUseNewPrivilegeSystem,
            ProjectPermissionMemberActions.AssignRole,
            ProjectPermissionSub.Member
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }
  };

  const onDeleteMembershipUserGuard: TMembershipUserScopeFactory["onDeleteMembershipUserGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Delete, ProjectPermissionSub.Member);
  };

  const onListMembershipUserGuard: TMembershipUserScopeFactory["onListMembershipUserGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member);
  };

  const onGetMembershipUserByUserIdGuard: TMembershipUserScopeFactory["onGetMembershipUserByUserIdGuard"] = async (
    dto
  ) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member);
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
