/* eslint-disable no-await-in-loop */
import { ForbiddenError } from "@casl/ability";

import {
  AccessScope,
  ActionProjectType,
  ProjectMembershipRole,
  ProjectVersion,
  TableName
} from "@app/db/schemas/models";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionMemberActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";

import { TUserGroupMembershipDALFactory } from "../../ee/services/group/user-group-membership-dal";
import { TAdditionalPrivilegeDALFactory } from "../additional-privilege/additional-privilege-dal";
import { ActorType } from "../auth/auth-type";
import { TGroupProjectDALFactory } from "../group-project/group-project-dal";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TMembershipUserDALFactory } from "../membership-user/membership-user-dal";
import { TNotificationServiceFactory } from "../notification/notification-service";
import { NotificationType } from "../notification/notification-types";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectKeyDALFactory } from "../project-key/project-key-dal";
import { TSecretReminderRecipientsDALFactory } from "../secret-reminder-recipients/secret-reminder-recipients-dal";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TUserDALFactory } from "../user/user-dal";
import { TProjectMembershipDALFactory } from "./project-membership-dal";
import {
  TAddUsersToWorkspaceDTO,
  TDeleteProjectMembershipsDTO,
  TGetProjectMembershipByUsernameDTO,
  TGetProjectMembershipDTO,
  TLeaveProjectDTO
} from "./project-membership-types";

type TProjectMembershipServiceFactoryDep = {
  permissionService: Pick<
    TPermissionServiceFactory,
    "getProjectPermission" | "getProjectPermissionByRoles" | "invalidateProjectPermissionCache"
  >;
  smtpService: TSmtpService;
  projectMembershipDAL: TProjectMembershipDALFactory;
  membershipUserDAL: TMembershipUserDALFactory;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "insertMany" | "find" | "delete">;
  userDAL: Pick<TUserDALFactory, "find">;
  userGroupMembershipDAL: TUserGroupMembershipDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findProjectGhostUser" | "transaction" | "findProjectById">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "findLatestProjectKey" | "delete" | "insertMany">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  additionalPrivilegeDAL: Pick<TAdditionalPrivilegeDALFactory, "delete">;
  secretReminderRecipientsDAL: Pick<TSecretReminderRecipientsDALFactory, "delete">;
  groupProjectDAL: TGroupProjectDALFactory;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
};

export type TProjectMembershipServiceFactory = ReturnType<typeof projectMembershipServiceFactory>;

export const projectMembershipServiceFactory = ({
  permissionService,
  projectMembershipDAL,
  smtpService,
  userGroupMembershipDAL,
  groupProjectDAL,
  projectDAL,
  projectKeyDAL,
  secretReminderRecipientsDAL,
  notificationService,
  additionalPrivilegeDAL,
  membershipUserDAL,
  userDAL,
  membershipRoleDAL
}: TProjectMembershipServiceFactoryDep) => {
  const getProjectMemberships = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    includeGroupMembers,
    projectId,
    roles
  }: TGetProjectMembershipDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member);

    const projectMembers = await projectMembershipDAL.findAllProjectMembers(projectId, { roles });

    if (includeGroupMembers) {
      const groupMembers = await groupProjectDAL.findAllProjectGroupMembers(projectId);
      const allMembers = [
        ...projectMembers.map((m) => ({ ...m, isGroupMember: false })),
        ...groupMembers.map((m) => ({ ...m, isGroupMember: true }))
      ];

      // Ensure the userId is unique
      const uniqueMembers: typeof allMembers = [];
      const addedUserIds = new Set<string>();
      allMembers.forEach((member) => {
        if (!addedUserIds.has(member.user.id)) {
          uniqueMembers.push(member);
          addedUserIds.add(member.user.id);
        }
      });

      return uniqueMembers;
    }

    return projectMembers.map((m) => ({ ...m, isGroupMember: false }));
  };

  const getProjectMembershipByUsername = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectId,
    username
  }: TGetProjectMembershipByUsernameDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member);

    const [membership] = await projectMembershipDAL.findAllProjectMembers(projectId, { username });
    if (!membership) throw new NotFoundError({ message: `Project membership not found for user '${username}'` });
    return membership;
  };

  const addUsersToProject = async ({
    projectId,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    members,
    sendEmails = true
  }: TAddUsersToWorkspaceDTO) => {
    const project = await projectDAL.findById(projectId);
    if (!project) throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Create, ProjectPermissionSub.Member);
    const orgMembers = await membershipUserDAL.find({
      [`${TableName.Membership}.scopeOrgId` as "scopeOrgId"]: project.orgId,
      scope: AccessScope.Organization,
      $in: {
        [`${TableName.Membership}.id` as "id"]: members.map(({ orgMembershipId }) => orgMembershipId)
      }
    });

    if (orgMembers.length !== members.length) throw new BadRequestError({ message: "Some users are not part of org" });

    const existingMembers = await membershipUserDAL.find({
      [`${TableName.Membership}.scopeProjectId` as "scopeProjectId"]: projectId,
      scope: AccessScope.Project,
      $in: { actorUserId: orgMembers.map(({ actorUserId }) => actorUserId).filter(Boolean) }
    });
    if (existingMembers.length) throw new BadRequestError({ message: "Some users are already part of project" });

    const orgMembershipUsernames = await userDAL.find({
      $in: {
        id: orgMembers.filter((el) => Boolean(el.actorUserId)).map((el) => el.actorUserId as string)
      }
    });
    const userIdsToExcludeForProjectKeyAddition = new Set(
      await userGroupMembershipDAL.findUserGroupMembershipsInProject(
        orgMembershipUsernames.map(({ username }) => username),
        projectId
      )
    );

    await membershipUserDAL.transaction(async (tx) => {
      const projectMemberships = await membershipUserDAL.insertMany(
        orgMembers.map(({ actorUserId }) => ({
          scopeProjectId: projectId,
          actorUserId,
          scope: AccessScope.Project,
          scopeOrgId: project.orgId
        })),
        tx
      );
      await membershipRoleDAL.insertMany(
        projectMemberships.map(({ id }) => ({ membershipId: id, role: ProjectMembershipRole.Member })),
        tx
      );
      const encKeyGroupByOrgMembId = groupBy(members, (i) => i.orgMembershipId);
      await projectKeyDAL.insertMany(
        orgMembers
          .filter(({ actorUserId }) => !userIdsToExcludeForProjectKeyAddition.has(actorUserId as string))
          .map(({ actorUserId, id }) => ({
            encryptedKey: encKeyGroupByOrgMembId[id][0].workspaceEncryptedKey,
            nonce: encKeyGroupByOrgMembId[id][0].workspaceEncryptedNonce,
            senderId: actorId,
            receiverId: actorUserId as string,
            projectId
          })),
        tx
      );
    });

    await permissionService.invalidateProjectPermissionCache(projectId);

    if (sendEmails) {
      await notificationService.createUserNotifications(
        orgMembershipUsernames.map((member) => ({
          userId: member.id,
          orgId: project.orgId,
          type: NotificationType.PROJECT_INVITATION,
          title: "Project Invitation",
          body: `You've been invited to join the project **${project.name}**.`
        }))
      );

      const appCfg = getConfig();
      await smtpService.sendMail({
        template: SmtpTemplates.WorkspaceInvite,
        subjectLine: "Infisical project invitation",
        recipients: orgMembershipUsernames.filter((i) => i.email).map((i) => i.email as string),
        substitutions: {
          workspaceName: project.name,
          callback_url: `${appCfg.SITE_URL}/login`
        }
      });
    }
    return orgMembers;
  };

  const deleteProjectMemberships = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectId,
    emails,
    usernames
  }: TDeleteProjectMembershipsDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Delete, ProjectPermissionSub.Member);

    const project = await projectDAL.findById(projectId);

    if (!project) {
      throw new NotFoundError({
        message: `Project with ID '${projectId}' not found`
      });
    }

    const usernamesAndEmails = [...emails, ...usernames];

    const projectMembers = await projectMembershipDAL.findMembershipsByUsername(projectId, [
      ...new Set(usernamesAndEmails.map((element) => element))
    ]);

    if (projectMembers.length !== usernamesAndEmails.length) {
      throw new BadRequestError({
        message: "Some users are not part of project",
        name: "Delete project membership"
      });
    }

    if (actor === ActorType.USER && projectMembers.some(({ user }) => user.id === actorId)) {
      throw new BadRequestError({
        message: "Cannot remove yourself from project",
        name: "Delete project membership"
      });
    }

    const userIdsToExcludeFromProjectKeyRemoval = new Set(
      await userGroupMembershipDAL.findUserGroupMembershipsInProject(usernamesAndEmails, projectId)
    );

    const memberships = await membershipUserDAL.transaction(async (tx) => {
      await additionalPrivilegeDAL.delete(
        {
          projectId,
          $in: {
            actorUserId: projectMembers.map((membership) => membership.user.id)
          }
        },
        tx
      );

      const deletedMemberships = await membershipUserDAL.delete(
        {
          scopeProjectId: projectId,
          scope: AccessScope.Project,
          $in: {
            id: projectMembers.map(({ id }) => id)
          }
        },
        tx
      );

      await secretReminderRecipientsDAL.delete(
        {
          projectId,
          $in: {
            userId: projectMembers.map(({ user }) => user.id)
          }
        },
        tx
      );

      // delete project keys belonging to users that are not part of any other groups in the project
      await projectKeyDAL.delete(
        {
          projectId,
          $in: {
            receiverId: projectMembers
              .filter(({ user }) => !userIdsToExcludeFromProjectKeyRemoval.has(user.id))
              .map(({ user }) => user.id)
              .filter(Boolean)
          }
        },
        tx
      );

      return deletedMemberships;
    });

    await permissionService.invalidateProjectPermissionCache(projectId);

    return memberships;
  };

  const leaveProject = async ({ projectId, actorId, actor }: TLeaveProjectDTO) => {
    if (actor !== ActorType.USER) {
      throw new BadRequestError({ message: "Only users can leave projects" });
    }

    const project = await projectDAL.findById(projectId);
    if (!project) throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });

    if (project.version === ProjectVersion.V1) {
      throw new BadRequestError({
        message: "Please ask your project administrator to upgrade the project before leaving."
      });
    }

    const projectMembers = await projectMembershipDAL.findAllProjectMembers(projectId);

    if (!projectMembers?.length) {
      throw new NotFoundError({ message: `Project members not found for project with ID '${projectId}'` });
    }

    if (projectMembers.length < 2) {
      throw new BadRequestError({ message: "You cannot leave the project as you are the only member" });
    }

    const adminMembers = projectMembers.filter(
      (member) => member.roles.map((r) => r.role).includes("admin") && member.userId !== actorId
    );
    if (!adminMembers.length) {
      throw new BadRequestError({
        message: "You cannot leave the project as you are the only admin. Promote another user to admin before leaving."
      });
    }

    const deletedMembership = await membershipUserDAL.transaction(async (tx) => {
      await additionalPrivilegeDAL.delete(
        {
          projectId: project.id,
          actorUserId: actorId
        },
        tx
      );

      await secretReminderRecipientsDAL.delete(
        {
          projectId,
          userId: actorId
        },
        tx
      );

      const membership = (
        await membershipUserDAL.delete(
          {
            scope: AccessScope.Project,
            scopeProjectId: project.id,
            actorUserId: actorId
          },
          tx
        )
      )?.[0];
      return membership;
    });

    if (!deletedMembership) {
      throw new BadRequestError({ message: "Failed to leave project" });
    }

    return deletedMembership;
  };

  return {
    getProjectMemberships,
    getProjectMembershipByUsername,
    deleteProjectMemberships,
    addUsersToProject,
    leaveProject
  };
};
