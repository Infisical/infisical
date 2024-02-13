/* eslint-disable no-await-in-loop */
import { ForbiddenError } from "@casl/ability";

import {
  OrgMembershipStatus,
  ProjectMembershipRole,
  SecretKeyEncoding,
  TableName,
  TProjectMemberships,
  TUsers
} from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { infisicalSymmetricDecrypt } from "@app/lib/crypto/encryption";
import { BadRequestError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { createWsMembers } from "@app/lib/project";

import { ActorType } from "../auth/auth-type";
import { TOrgDALFactory } from "../org/org-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectBotDALFactory } from "../project-bot/project-bot-dal";
import { TProjectKeyDALFactory } from "../project-key/project-key-dal";
import { TProjectRoleDALFactory } from "../project-role/project-role-dal";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TUserDALFactory } from "../user/user-dal";
import { TProjectMembershipDALFactory } from "./project-membership-dal";
import {
  TAddUsersToWorkspaceDTO,
  TAddUsersToWorkspaceNonE2EEDTO,
  TDeleteProjectMembershipOldDTO,
  TDeleteProjectMembershipsDTO,
  TGetProjectMembershipDTO,
  TInviteUserToProjectDTO,
  TUpdateProjectMembershipDTO
} from "./project-membership-types";

type TProjectMembershipServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  smtpService: TSmtpService;
  projectBotDAL: TProjectBotDALFactory;
  projectMembershipDAL: TProjectMembershipDALFactory;
  userDAL: Pick<TUserDALFactory, "findById" | "findOne" | "findUserByProjectMembershipId">;
  projectRoleDAL: Pick<TProjectRoleDALFactory, "findOne">;
  orgDAL: Pick<TOrgDALFactory, "findMembership" | "findOrgMembersByEmail">;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findProjectGhostUser">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "findLatestProjectKey" | "delete" | "insertMany">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TProjectMembershipServiceFactory = ReturnType<typeof projectMembershipServiceFactory>;

export const projectMembershipServiceFactory = ({
  permissionService,
  projectMembershipDAL,
  smtpService,
  projectRoleDAL,
  projectBotDAL,
  orgDAL,
  userDAL,
  projectDAL,
  projectKeyDAL,
  licenseService
}: TProjectMembershipServiceFactoryDep) => {
  const getProjectMemberships = async ({ actorId, actor, actorOrgId, projectId }: TGetProjectMembershipDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Member);

    return projectMembershipDAL.findAllProjectMembers(projectId);
  };

  const inviteUserToProject = async ({ actorId, actor, actorOrgId, projectId, emails }: TInviteUserToProjectDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Member);

    const invitees: TUsers[] = [];

    for (const email of emails) {
      const invitee = await userDAL.findOne({ email });
      if (!invitee || !invitee.isAccepted)
        throw new BadRequestError({
          message: "Failed to validate invitee",
          name: "Invite user to project"
        });

      const inviteeMembership = await projectMembershipDAL.findOne({
        userId: invitee.id,
        projectId
      });
      if (inviteeMembership)
        throw new BadRequestError({
          message: "Existing member of project",
          name: "Invite user to project"
        });

      const project = await projectDAL.findById(projectId);
      const inviteeMembershipOrg = await orgDAL.findMembership({
        userId: invitee.id,
        orgId: project.orgId,
        status: OrgMembershipStatus.Accepted
      });
      if (!inviteeMembershipOrg)
        throw new BadRequestError({
          message: "Failed to validate invitee org membership",
          name: "Invite user to project"
        });

      await projectMembershipDAL.create({
        userId: invitee.id,
        projectId,
        role: ProjectMembershipRole.Member
      });

      const appCfg = getConfig();
      await smtpService.sendMail({
        template: SmtpTemplates.WorkspaceInvite,
        subjectLine: "Infisical workspace invitation",
        recipients: [invitee.email],
        substitutions: {
          workspaceName: project.name,
          callback_url: `${appCfg.SITE_URL}/login`
        }
      });

      invitees.push(invitee);
    }

    const latestKey = await projectKeyDAL.findLatestProjectKey(actorId, projectId);

    return { invitees, latestKey };
  };

  const addUsersToProject = async ({
    projectId,
    actorId,
    actor,
    actorOrgId,
    members,
    sendEmails = true
  }: TAddUsersToWorkspaceDTO) => {
    const project = await projectDAL.findById(projectId);
    if (!project) throw new BadRequestError({ message: "Project not found" });

    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId, actorOrgId);
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

    await projectMembershipDAL.transaction(async (tx) => {
      await projectMembershipDAL.insertMany(
        orgMembers.map(({ userId, id: membershipId }) => {
          const role =
            members.find((i) => i.orgMembershipId === membershipId)?.projectRole || ProjectMembershipRole.Member;

          return {
            projectId,
            userId: userId as string,
            role
          };
        }),
        tx
      );
      const encKeyGroupByOrgMembId = groupBy(members, (i) => i.orgMembershipId);
      await projectKeyDAL.insertMany(
        orgMembers.map(({ userId, id }) => ({
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
        subjectLine: "Infisical workspace invitation",
        recipients: orgMembers.map(({ email }) => email).filter(Boolean),
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
    actor,
    emails,
    sendEmails = true
  }: TAddUsersToWorkspaceNonE2EEDTO) => {
    const project = await projectDAL.findById(projectId);
    if (!project) throw new BadRequestError({ message: "Project not found" });

    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Member);

    const orgMembers = await orgDAL.findOrgMembersByEmail(project.orgId, emails);

    if (orgMembers.length !== emails.length) throw new BadRequestError({ message: "Some users are not part of org" });

    const existingMembers = await projectMembershipDAL.find({
      projectId,
      $in: { userId: orgMembers.map(({ user }) => user.id).filter(Boolean) }
    });
    if (existingMembers.length) throw new BadRequestError({ message: "Some users are already part of project" });

    const ghostUser = await projectDAL.findProjectGhostUser(projectId);

    if (!ghostUser) {
      throw new BadRequestError({
        message: "Failed to find ghost user"
      });
    }

    const ghostUserLatestKey = await projectKeyDAL.findLatestProjectKey(ghostUser.id, projectId);

    if (!ghostUserLatestKey) {
      throw new BadRequestError({
        message: "Failed to find ghost user latest key"
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

    const newWsMembers = createWsMembers({
      decryptKey: ghostUserLatestKey,
      userPrivateKey: botPrivateKey,
      members: orgMembers.map((membership) => ({
        orgMembershipId: membership.id,
        projectMembershipRole: ProjectMembershipRole.Member,
        userPublicKey: membership.user.publicKey
      }))
    });

    const members: TProjectMemberships[] = [];

    await projectMembershipDAL.transaction(async (tx) => {
      const result = await projectMembershipDAL.insertMany(
        orgMembers.map(({ user, id: membershipId }) => {
          const role =
            orgMembers.find((membership) => membership.id === membershipId)?.role || ProjectMembershipRole.Member;

          return {
            projectId,
            userId: user.id,
            role
          };
        }),
        tx
      );

      members.push(...result);

      const encKeyGroupByOrgMembId = groupBy(newWsMembers, (i) => i.orgMembershipId);
      await projectKeyDAL.insertMany(
        orgMembers.map(({ user, id }) => ({
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
      const appCfg = getConfig();
      await smtpService.sendMail({
        template: SmtpTemplates.WorkspaceInvite,
        subjectLine: "Infisical workspace invitation",
        recipients: orgMembers.map(({ user }) => user.email).filter(Boolean),
        substitutions: {
          workspaceName: project.name,
          callback_url: `${appCfg.SITE_URL}/login`
        }
      });
    }
    return members;
  };

  const updateProjectMembership = async ({
    actorId,
    actor,
    actorOrgId,
    projectId,
    membershipId,
    role
  }: TUpdateProjectMembershipDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Member);

    const membershipUser = await userDAL.findUserByProjectMembershipId(membershipId);

    if (membershipUser?.ghost) {
      throw new BadRequestError({
        message: "Unauthorized member update",
        name: "Update project membership"
      });
    }

    const isCustomRole = !Object.values(ProjectMembershipRole).includes(role as ProjectMembershipRole);
    if (isCustomRole) {
      const customRole = await projectRoleDAL.findOne({ slug: role, projectId });
      if (!customRole) throw new BadRequestError({ name: "Update project membership", message: "Role not found" });
      const project = await projectDAL.findById(customRole.projectId);
      const plan = await licenseService.getPlan(project.orgId);
      if (!plan?.rbac)
        throw new BadRequestError({
          message: "Failed to assign custom role due to RBAC restriction. Upgrade plan to assign custom role to member."
        });

      const [membership] = await projectMembershipDAL.update(
        { id: membershipId, projectId },
        {
          role: ProjectMembershipRole.Custom,
          roleId: customRole.id
        }
      );
      return membership;
    }

    const [membership] = await projectMembershipDAL.update({ id: membershipId, projectId }, { role, roleId: null });
    return membership;
  };

  // This is old and should be removed later. Its not used anywhere, but it is exposed in our API. So to avoid breaking changes, we are keeping it for now.
  const deleteProjectMembership = async ({
    actorId,
    actor,
    actorOrgId,
    projectId,
    membershipId
  }: TDeleteProjectMembershipOldDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Member);

    const member = await userDAL.findUserByProjectMembershipId(membershipId);

    if (member?.ghost) {
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
    projectId,
    emails
  }: TDeleteProjectMembershipsDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Member);

    const projectMembers = await projectMembershipDAL.findMembershipsByEmail(projectId, emails);

    if (projectMembers.length !== emails.length) {
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

      await projectKeyDAL.delete(
        {
          projectId,
          $in: {
            receiverId: projectMembers.map(({ user }) => user.id).filter(Boolean)
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
    inviteUserToProject,
    updateProjectMembership,
    addUsersToProjectNonE2EE,
    deleteProjectMemberships,
    deleteProjectMembership, // TODO: Remove this
    addUsersToProject
  };
};
