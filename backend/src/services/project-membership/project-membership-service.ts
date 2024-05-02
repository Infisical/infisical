/* eslint-disable no-await-in-loop */
import { ForbiddenError } from "@casl/ability";
import ms from "ms";

import {
  ProjectMembershipRole,
  ProjectVersion,
  SecretKeyEncoding,
  TableName,
  TProjectMemberships
} from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { infisicalSymmetricDecrypt } from "@app/lib/crypto/encryption";
import { BadRequestError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";

import { TUserGroupMembershipDALFactory } from "../../ee/services/group/user-group-membership-dal";
import { ActorType } from "../auth/auth-type";
import { TGroupProjectDALFactory } from "../group-project/group-project-dal";
import { TOrgDALFactory } from "../org/org-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { assignWorkspaceKeysToMembers } from "../project/project-fns";
import { TProjectBotDALFactory } from "../project-bot/project-bot-dal";
import { TProjectKeyDALFactory } from "../project-key/project-key-dal";
import { TProjectRoleDALFactory } from "../project-role/project-role-dal";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TUserDALFactory } from "../user/user-dal";
import { TProjectMembershipDALFactory } from "./project-membership-dal";
import {
  ProjectUserMembershipTemporaryMode,
  TAddUsersToWorkspaceDTO,
  TAddUsersToWorkspaceNonE2EEDTO,
  TDeleteProjectMembershipOldDTO,
  TDeleteProjectMembershipsDTO,
  TGetProjectMembershipDTO,
  TUpdateProjectMembershipDTO
} from "./project-membership-types";
import { TProjectUserMembershipRoleDALFactory } from "./project-user-membership-role-dal";

type TProjectMembershipServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  smtpService: TSmtpService;
  projectBotDAL: TProjectBotDALFactory;
  projectMembershipDAL: TProjectMembershipDALFactory;
  projectUserMembershipRoleDAL: Pick<TProjectUserMembershipRoleDALFactory, "insertMany" | "find" | "delete">;
  userDAL: Pick<TUserDALFactory, "findById" | "findOne" | "findUserByProjectMembershipId" | "find">;
  userGroupMembershipDAL: TUserGroupMembershipDALFactory;
  projectRoleDAL: Pick<TProjectRoleDALFactory, "find">;
  orgDAL: Pick<TOrgDALFactory, "findMembership" | "findOrgMembersByUsername">;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findProjectGhostUser" | "transaction">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "findLatestProjectKey" | "delete" | "insertMany">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  groupProjectDAL: TGroupProjectDALFactory;
};

export type TProjectMembershipServiceFactory = ReturnType<typeof projectMembershipServiceFactory>;

export const projectMembershipServiceFactory = ({
  permissionService,
  projectMembershipDAL,
  projectUserMembershipRoleDAL,
  smtpService,
  groupProjectDAL,
  projectRoleDAL,
  projectBotDAL,
  orgDAL,
  userDAL,
  userGroupMembershipDAL,
  projectDAL,
  projectKeyDAL,
  licenseService
}: TProjectMembershipServiceFactoryDep) => {
  const getProjectMemberships = async ({
    actorId,
    actor,
    actorOrgId,
    includeGroupMembers,
    actorAuthMethod,
    projectId
  }: TGetProjectMembershipDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Member);

    const projectMembers = await projectMembershipDAL.findAllProjectMembers(projectId);

    if (includeGroupMembers) {
      const groupMembers = await groupProjectDAL.findAllProjectGroupMembers(projectId);
      const allMembers = [...projectMembers, ...groupMembers];

      // Ensure the userId is unique
      const membersIds = new Set(allMembers.map((entity) => entity.user.id));
      const uniqueMembers = allMembers.filter((entity) => membersIds.has(entity.user.id));

      return uniqueMembers;
    }

    return projectMembers;
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
    if (!project) throw new BadRequestError({ message: "Project not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Member);
    const orgMembers = await orgDAL.findMembership({
      orgId: project.orgId,
      $in: {
        [`${TableName.OrgMembership}.id` as "id"]: members.map(({ orgMembershipId }) => orgMembershipId)
      }
    });
    if (orgMembers.length !== members.length) throw new BadRequestError({ message: "Some users are not part of org" });

    const existingMembers = await projectMembershipDAL.find({
      projectId,
      $in: { userId: orgMembers.map(({ userId }) => userId).filter(Boolean) as string[] }
    });
    if (existingMembers.length) throw new BadRequestError({ message: "Some users are already part of project" });

    const userIdsToExcludeForProjectKeyAddition = new Set(
      await userGroupMembershipDAL.findUserGroupMembershipsInProject(
        orgMembers.map(({ username }) => username),
        projectId
      )
    );

    await projectMembershipDAL.transaction(async (tx) => {
      const projectMemberships = await projectMembershipDAL.insertMany(
        orgMembers.map(({ userId }) => ({
          projectId,
          userId: userId as string
        })),
        tx
      );
      await projectUserMembershipRoleDAL.insertMany(
        projectMemberships.map(({ id }) => ({ projectMembershipId: id, role: ProjectMembershipRole.Member })),
        tx
      );
      const encKeyGroupByOrgMembId = groupBy(members, (i) => i.orgMembershipId);
      await projectKeyDAL.insertMany(
        orgMembers
          .filter(({ userId }) => !userIdsToExcludeForProjectKeyAddition.has(userId as string))
          .map(({ userId, id }) => ({
            encryptedKey: encKeyGroupByOrgMembId[id][0].workspaceEncryptedKey,
            nonce: encKeyGroupByOrgMembId[id][0].workspaceEncryptedNonce,
            senderId: actorId,
            receiverId: userId as string,
            projectId
          })),
        tx
      );
    });

    if (sendEmails) {
      const appCfg = getConfig();
      await smtpService.sendMail({
        template: SmtpTemplates.WorkspaceInvite,
        subjectLine: "Infisical project invitation",
        recipients: orgMembers.filter((i) => i.email).map((i) => i.email as string),
        substitutions: {
          workspaceName: project.name,
          callback_url: `${appCfg.SITE_URL}/login`
        }
      });
    }
    return orgMembers;
  };

  const addUsersToProjectNonE2EE = async ({
    projectId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    emails,
    usernames,
    sendEmails = true
  }: TAddUsersToWorkspaceNonE2EEDTO) => {
    const project = await projectDAL.findById(projectId);
    if (!project) throw new BadRequestError({ message: "Project not found" });

    if (project.version === ProjectVersion.V1) {
      throw new BadRequestError({ message: "Please upgrade your project on your dashboard" });
    }

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Member);

    const usernamesAndEmails = [...emails, ...usernames];

    const orgMembers = await orgDAL.findOrgMembersByUsername(project.orgId, [
      ...new Set(usernamesAndEmails.map((element) => element.toLowerCase()))
    ]);

    if (orgMembers.length !== usernamesAndEmails.length)
      throw new BadRequestError({ message: "Some users are not part of org" });

    if (!orgMembers.length) return [];

    const existingMembers = await projectMembershipDAL.find({
      projectId,
      $in: { userId: orgMembers.map(({ user }) => user.id).filter(Boolean) }
    });
    if (existingMembers.length) throw new BadRequestError({ message: "Some users are already part of project" });

    const ghostUser = await projectDAL.findProjectGhostUser(projectId);

    if (!ghostUser) {
      throw new BadRequestError({
        message: "Failed to find sudo user"
      });
    }

    const ghostUserLatestKey = await projectKeyDAL.findLatestProjectKey(ghostUser.id, projectId);

    if (!ghostUserLatestKey) {
      throw new BadRequestError({
        message: "Failed to find sudo user latest key"
      });
    }

    const bot = await projectBotDAL.findOne({ projectId });

    if (!bot) {
      throw new BadRequestError({
        message: "Failed to find bot"
      });
    }

    const botPrivateKey = infisicalSymmetricDecrypt({
      keyEncoding: bot.keyEncoding as SecretKeyEncoding,
      iv: bot.iv,
      tag: bot.tag,
      ciphertext: bot.encryptedPrivateKey
    });

    const newWsMembers = assignWorkspaceKeysToMembers({
      decryptKey: ghostUserLatestKey,
      userPrivateKey: botPrivateKey,
      members: orgMembers.map((membership) => ({
        orgMembershipId: membership.id,
        projectMembershipRole: ProjectMembershipRole.Member,
        userPublicKey: membership.user.publicKey
      }))
    });

    const members: TProjectMemberships[] = [];

    const userIdsToExcludeForProjectKeyAddition = new Set(
      await userGroupMembershipDAL.findUserGroupMembershipsInProject(usernamesAndEmails, projectId)
    );

    await projectMembershipDAL.transaction(async (tx) => {
      const projectMemberships = await projectMembershipDAL.insertMany(
        orgMembers.map(({ user }) => ({
          projectId,
          userId: user.id
        })),
        tx
      );
      await projectUserMembershipRoleDAL.insertMany(
        projectMemberships.map(({ id }) => ({ projectMembershipId: id, role: ProjectMembershipRole.Member })),
        tx
      );

      members.push(...projectMemberships);

      const encKeyGroupByOrgMembId = groupBy(newWsMembers, (i) => i.orgMembershipId);
      await projectKeyDAL.insertMany(
        orgMembers
          .filter(({ user }) => !userIdsToExcludeForProjectKeyAddition.has(user.id))
          .map(({ user, id }) => ({
            encryptedKey: encKeyGroupByOrgMembId[id][0].workspaceEncryptedKey,
            nonce: encKeyGroupByOrgMembId[id][0].workspaceEncryptedNonce,
            senderId: ghostUser.id,
            receiverId: user.id,
            projectId
          })),
        tx
      );
    });

    if (sendEmails) {
      const recipients = orgMembers.filter((i) => i.user.email).map((i) => i.user.email as string);

      const appCfg = getConfig();

      if (recipients.length) {
        await smtpService.sendMail({
          template: SmtpTemplates.WorkspaceInvite,
          subjectLine: "Infisical project invitation",
          recipients: orgMembers.filter((i) => i.user.email).map((i) => i.user.email as string),
          substitutions: {
            workspaceName: project.name,
            callback_url: `${appCfg.SITE_URL}/login`
          }
        });
      }
    }
    return members;
  };

  const updateProjectMembership = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectId,
    membershipId,
    roles
  }: TUpdateProjectMembershipDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Member);

    const membershipUser = await userDAL.findUserByProjectMembershipId(membershipId);
    if (membershipUser?.isGhost || membershipUser?.projectId !== projectId) {
      throw new BadRequestError({
        message: "Unauthorized member update",
        name: "Update project membership"
      });
    }

    // validate custom roles input
    const customInputRoles = roles.filter(
      ({ role }) => !Object.values(ProjectMembershipRole).includes(role as ProjectMembershipRole)
    );
    const hasCustomRole = Boolean(customInputRoles.length);
    if (hasCustomRole) {
      const plan = await licenseService.getPlan(actorOrgId);
      if (!plan?.rbac)
        throw new BadRequestError({
          message: "Failed to assign custom role due to RBAC restriction. Upgrade plan to assign custom role to member."
        });
    }

    const customRoles = hasCustomRole
      ? await projectRoleDAL.find({
          projectId,
          $in: { slug: customInputRoles.map(({ role }) => role) }
        })
      : [];
    if (customRoles.length !== customInputRoles.length) throw new BadRequestError({ message: "Custom role not found" });
    const customRolesGroupBySlug = groupBy(customRoles, ({ slug }) => slug);

    const sanitizedProjectMembershipRoles = roles.map((inputRole) => {
      const isCustomRole = Boolean(customRolesGroupBySlug?.[inputRole.role]?.[0]);
      if (!inputRole.isTemporary) {
        return {
          projectMembershipId: membershipId,
          role: isCustomRole ? ProjectMembershipRole.Custom : inputRole.role,
          customRoleId: customRolesGroupBySlug[inputRole.role] ? customRolesGroupBySlug[inputRole.role][0].id : null
        };
      }

      // check cron or relative here later for now its just relative
      const relativeTimeInMs = ms(inputRole.temporaryRange);
      return {
        projectMembershipId: membershipId,
        role: isCustomRole ? ProjectMembershipRole.Custom : inputRole.role,
        customRoleId: customRolesGroupBySlug[inputRole.role] ? customRolesGroupBySlug[inputRole.role][0].id : null,
        isTemporary: true,
        temporaryMode: ProjectUserMembershipTemporaryMode.Relative,
        temporaryRange: inputRole.temporaryRange,
        temporaryAccessStartTime: new Date(inputRole.temporaryAccessStartTime),
        temporaryAccessEndTime: new Date(new Date(inputRole.temporaryAccessStartTime).getTime() + relativeTimeInMs)
      };
    });

    const updatedRoles = await projectMembershipDAL.transaction(async (tx) => {
      await projectUserMembershipRoleDAL.delete({ projectMembershipId: membershipId }, tx);
      return projectUserMembershipRoleDAL.insertMany(sanitizedProjectMembershipRoles, tx);
    });

    return updatedRoles;
  };

  // This is old and should be removed later. Its not used anywhere, but it is exposed in our API. So to avoid breaking changes, we are keeping it for now.
  const deleteProjectMembership = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectId,
    membershipId
  }: TDeleteProjectMembershipOldDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Member);

    const member = await userDAL.findUserByProjectMembershipId(membershipId);

    if (member?.isGhost) {
      throw new BadRequestError({
        message: "Unauthorized member delete",
        name: "Delete project membership"
      });
    }

    const membership = await projectMembershipDAL.transaction(async (tx) => {
      const [deletedMembership] = await projectMembershipDAL.delete({ projectId, id: membershipId }, tx);
      await projectKeyDAL.delete({ receiverId: deletedMembership.userId, projectId }, tx);
      return deletedMembership;
    });
    return membership;
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
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Member);

    const project = await projectDAL.findById(projectId);

    if (!project) {
      throw new BadRequestError({
        message: "Project not found",
        name: "Delete project membership"
      });
    }

    const usernamesAndEmails = [...emails, ...usernames];

    const projectMembers = await projectMembershipDAL.findMembershipsByUsername(projectId, [
      ...new Set(usernamesAndEmails.map((element) => element.toLowerCase()))
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

    const memberships = await projectMembershipDAL.transaction(async (tx) => {
      const deletedMemberships = await projectMembershipDAL.delete(
        {
          projectId,
          $in: {
            id: projectMembers.map(({ id }) => id)
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
    return memberships;
  };

  return {
    getProjectMemberships,
    updateProjectMembership,
    addUsersToProjectNonE2EE,
    deleteProjectMemberships,
    deleteProjectMembership, // TODO: Remove this
    addUsersToProject
  };
};
