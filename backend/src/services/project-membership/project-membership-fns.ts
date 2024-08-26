import { Knex } from "knex";

import { ProjectMembershipRole, SecretKeyEncoding, TProjectMemberships } from "@app/db/schemas";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { getConfig } from "@app/lib/config/env";
import { infisicalSymmetricDecrypt } from "@app/lib/crypto/encryption";
import { BadRequestError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";

import { TOrgDALFactory } from "../org/org-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { assignWorkspaceKeysToMembers } from "../project/project-fns";
import { TProjectBotDALFactory } from "../project-bot/project-bot-dal";
import { TProjectKeyDALFactory } from "../project-key/project-key-dal";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TProjectMembershipDALFactory } from "./project-membership-dal";
import { TProjectUserMembershipRoleDALFactory } from "./project-user-membership-role-dal";

type TAddMembersToProjectArg = {
  orgDAL: Pick<TOrgDALFactory, "findMembership" | "findOrgMembersByUsername">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "find" | "transaction" | "insertMany">;
  projectDAL: Pick<TProjectDALFactory, "findProjectById" | "findProjectGhostUser">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "findLatestProjectKey" | "insertMany">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "findUserGroupMembershipsInProject">;
  projectUserMembershipRoleDAL: Pick<TProjectUserMembershipRoleDALFactory, "insertMany">;
  smtpService: Pick<TSmtpService, "sendMail">;
};

type AddMembersToNonE2EEProjectDTO = {
  emails: string[];
  usernames: string[];
  projectId: string;
  projectMembershipRole: ProjectMembershipRole;
  sendEmails?: boolean;
};

type AddMembersToNonE2EEProjectOptions = {
  tx?: Knex;
  throwOnProjectNotFound?: boolean;
};

export const addMembersToProject = ({
  orgDAL,
  projectDAL,
  projectMembershipDAL,
  projectKeyDAL,
  projectBotDAL,
  userGroupMembershipDAL,
  projectUserMembershipRoleDAL,
  smtpService
}: TAddMembersToProjectArg) => {
  // Can create multiple memberships for a singular project, based on user email / username
  const addMembersToNonE2EEProject = async (
    { emails, usernames, projectId, projectMembershipRole, sendEmails }: AddMembersToNonE2EEProjectDTO,
    options: AddMembersToNonE2EEProjectOptions = { throwOnProjectNotFound: true }
  ) => {
    const processTransaction = async (tx: Knex) => {
      const usernamesAndEmails = [...emails, ...usernames];

      const project = await projectDAL.findProjectById(projectId);
      if (!project) {
        if (options.throwOnProjectNotFound) {
          throw new BadRequestError({ message: "Project not found when attempting to add user to project" });
        }

        return [];
      }

      const orgMembers = await orgDAL.findOrgMembersByUsername(
        project.orgId,
        [...new Set(usernamesAndEmails.map((element) => element.toLowerCase()))],
        tx
      );

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
          projectMembershipRole,
          userPublicKey: membership.user.publicKey
        }))
      });

      const members: TProjectMemberships[] = [];

      const userIdsToExcludeForProjectKeyAddition = new Set(
        await userGroupMembershipDAL.findUserGroupMembershipsInProject(usernamesAndEmails, projectId)
      );
      const projectMemberships = await projectMembershipDAL.insertMany(
        orgMembers.map(({ user }) => ({
          projectId,
          userId: user.id
        })),
        tx
      );
      await projectUserMembershipRoleDAL.insertMany(
        projectMemberships.map(({ id }) => ({ projectMembershipId: id, role: projectMembershipRole })),
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

    if (options.tx) {
      return processTransaction(options.tx);
    }
    return projectMembershipDAL.transaction(processTransaction);
  };

  return {
    addMembersToNonE2EEProject
  };
};
