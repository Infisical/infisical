/* eslint-disable no-await-in-loop */
import {
  ProjectMembershipRole,
  ProjectUpgradeStatus,
  ProjectVersion,
  SecretKeyEncoding,
  TSecrets
} from "@app/db/schemas";
import { TSecretApprovalRequestDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-dal";
import { TSecretApprovalRequestSecretDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-secret-dal";
import { RequestState } from "@app/ee/services/secret-approval-request/secret-approval-request-types";
import {
  decryptAsymmetric,
  encryptSymmetric128BitHexKeyUTF8,
  infisicalSymmetricDecrypt,
  infisicalSymmetricEncypt
} from "@app/lib/crypto/encryption";
import { logger } from "@app/lib/logger";
import { createProjectKey, createWsMembers } from "@app/lib/project";
import { decryptSecrets, SecretDocType, TPartialSecret } from "@app/lib/secret";
import { QueueJobs, QueueName, TQueueJobTypes, TQueueServiceFactory } from "@app/queue";

import { TOrgDALFactory } from "../org/org-dal";
import { TOrgServiceFactory } from "../org/org-service";
import { TProjectBotDALFactory } from "../project-bot/project-bot-dal";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TProjectKeyDALFactory } from "../project-key/project-key-dal";
import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import { TSecretDALFactory } from "../secret/secret-dal";
import { TSecretVersionDALFactory } from "../secret/secret-version-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TUserDALFactory } from "../user/user-dal";
import { TProjectDALFactory } from "./project-dal";

export type TProjectQueueFactory = ReturnType<typeof projectQueueFactory>;

type TProjectQueueFactoryDep = {
  queueService: TQueueServiceFactory;
  secretVersionDAL: Pick<TSecretVersionDALFactory, "find" | "bulkUpdateNoVersionIncrement">;
  folderDAL: Pick<TSecretFolderDALFactory, "find">;
  secretDAL: Pick<TSecretDALFactory, "find" | "bulkUpdateNoVersionIncrement">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "findLatestProjectKey" | "find" | "create" | "delete" | "insertMany">;
  secretApprovalRequestDAL: Pick<TSecretApprovalRequestDALFactory, "find">;
  secretApprovalSecretDAL: Pick<TSecretApprovalRequestSecretDALFactory, "find" | "bulkUpdateNoVersionIncrement">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne" | "delete" | "create">;
  orgService: Pick<TOrgServiceFactory, "addGhostUser">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "create">;
  userDAL: Pick<TUserDALFactory, "findUserEncKeyByUserId">;

  projectEnvDAL: Pick<TProjectEnvDALFactory, "find">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "transaction" | "updateById" | "setProjectUpgradeStatus" | "find">;
  orgDAL: Pick<TOrgDALFactory, "findMembership">;
};

export const projectQueueFactory = ({
  queueService,
  secretDAL,
  folderDAL,
  userDAL,
  secretVersionDAL,
  secretApprovalRequestDAL,
  secretApprovalSecretDAL,
  projectKeyDAL,
  projectBotDAL,
  projectEnvDAL,
  orgDAL,
  projectDAL,
  orgService,
  projectMembershipDAL
}: TProjectQueueFactoryDep) => {
  const upgradeProject = async (dto: TQueueJobTypes["upgrade-project-to-ghost"]["payload"]) => {
    await queueService.queue(QueueName.UpgradeProjectToGhost, QueueJobs.UpgradeProjectToGhost, dto, {
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: {
        count: 5 // keep the most recent jobs
      }
    });
  };

  queueService.start(QueueName.UpgradeProjectToGhost, async ({ data }) => {
    try {
      const [project] = await projectDAL.find({
        id: data.projectId,
        version: ProjectVersion.V1
      });

      const oldProjectKey = await projectKeyDAL.findLatestProjectKey(data.startedByUserId, data.projectId);

      if (!project || !oldProjectKey) {
        throw new Error("Project or project key not found");
      }

      if (project.upgradeStatus !== ProjectUpgradeStatus.Failed && project.upgradeStatus !== null) {
        throw new Error("Project upgrade status is not valid");
      }

      await projectDAL.setProjectUpgradeStatus(data.projectId, ProjectUpgradeStatus.InProgress); // Set the status to in progress. This is important to prevent multiple upgrades at the same time.

      const userPrivateKey = infisicalSymmetricDecrypt({
        keyEncoding: data.encryptedPrivateKey.keyEncoding,
        ciphertext: data.encryptedPrivateKey.encryptedKey,
        iv: data.encryptedPrivateKey.encryptedKeyIv,
        tag: data.encryptedPrivateKey.encryptedKeyTag
      });

      const projectEnvs = await projectEnvDAL.find({
        projectId: project.id
      });

      const projectFolders = await folderDAL.find({
        $in: {
          envId: projectEnvs.map((env) => env.id)
        }
      });

      // Get all the secrets within the project (as encrypted)
      const secrets: TPartialSecret[] = [];
      for (const folder of projectFolders) {
        const folderSecrets = await secretDAL.find({ folderId: folder.id });

        const folderSecretVersions = await secretVersionDAL.find(
          {
            folderId: folder.id
          },
          // Only get the latest 100 secret versions for each folder.
          {
            limit: 100
          }
        );
        const approvalRequests = await secretApprovalRequestDAL.find({
          status: RequestState.Open,
          folderId: folder.id
        });
        const approvalSecrets = await secretApprovalSecretDAL.find({
          $in: {
            requestId: approvalRequests.map((el) => el.id)
          }
        });

        secrets.push(...folderSecrets.map((el) => ({ ...el, docType: SecretDocType.Secret })));
        secrets.push(...folderSecretVersions.map((el) => ({ ...el, docType: SecretDocType.SecretVersion })));
        secrets.push(...approvalSecrets.map((el) => ({ ...el, docType: SecretDocType.ApprovalSecret })));
      }

      const decryptedSecrets = decryptSecrets(
        // secrets.filter((s) => s.keyEncoding === "base64"),
        secrets,
        userPrivateKey,
        oldProjectKey
      );

      console.log(
        decryptedSecrets
          .filter((s) => s.docType === SecretDocType.ApprovalSecret)
          .map((s) => `${s.secretKey} - ${s.secretValue}`)
      );

      if (secrets.length !== decryptedSecrets.length) {
        throw new Error("Failed to decrypt some secret versions");
      }

      // Get the existing bot and the existing project keys for the members of the project
      const existingBot = await projectBotDAL.findOne({ projectId: project.id }).catch(() => null);
      const existingProjectKeys = await projectKeyDAL.find({ projectId: project.id });

      // TRANSACTION START
      await projectDAL.transaction(async (tx) => {
        await projectDAL.updateById(project.id, { version: ProjectVersion.V2 }, tx);

        // Create a ghost user
        const ghostUser = await orgService.addGhostUser(project.orgId, tx);

        // Create a project key
        const { key: newEncryptedProjectKey, iv: newEncryptedProjectKeyIv } = createProjectKey({
          publicKey: ghostUser.keys.publicKey,
          privateKey: ghostUser.keys.plainPrivateKey
        });

        // Create a new project key for the GHOST
        await projectKeyDAL.create(
          {
            projectId: project.id,
            receiverId: ghostUser.user.id,
            encryptedKey: newEncryptedProjectKey,
            nonce: newEncryptedProjectKeyIv,
            senderId: ghostUser.user.id
          },
          tx
        );

        // Create a membership for the ghost user
        await projectMembershipDAL.create(
          {
            projectId: project.id,
            userId: ghostUser.user.id,
            role: ProjectMembershipRole.Admin
          },
          tx
        );

        // If a bot already exists, delete it
        if (existingBot) {
          await projectBotDAL.delete({ id: existingBot.id }, tx);
        }

        // Delete all the existing project keys
        await projectKeyDAL.delete(
          {
            projectId: project.id,
            $in: {
              id: existingProjectKeys.map((key) => key.id)
            }
          },
          tx
        );

        const ghostUserLatestKey = await projectKeyDAL.findLatestProjectKey(ghostUser.user.id, project.id, tx);

        if (!ghostUserLatestKey) {
          throw new Error("User latest key not found (V2 Upgrade)");
        }

        const newProjectMembers: {
          encryptedKey: string;
          nonce: string;
          senderId: string;
          receiverId: string;
          projectId: string;
        }[] = [];

        for (const key of existingProjectKeys) {
          const user = await userDAL.findUserEncKeyByUserId(key.receiverId);
          const [orgMembership] = await orgDAL.findMembership({ userId: key.receiverId, orgId: project.orgId });

          if (!user || !orgMembership) {
            throw new Error(`User with ID ${key.receiverId} was not found during upgrade, or user is not in org.`);
          }

          const [newMember] = createWsMembers({
            decryptKey: ghostUserLatestKey,
            userPrivateKey: ghostUser.keys.plainPrivateKey,
            members: [
              {
                userPublicKey: user.publicKey,
                orgMembershipId: orgMembership.id,
                projectMembershipRole: ProjectMembershipRole.Admin
              }
            ]
          });

          newProjectMembers.push({
            encryptedKey: newMember.workspaceEncryptedKey,
            nonce: newMember.workspaceEncryptedNonce,
            senderId: ghostUser.user.id,
            receiverId: user.id,
            projectId: project.id
          });
        }

        // Create project keys for all the old members
        await projectKeyDAL.insertMany(newProjectMembers, tx);

        // Encrypt the bot private key (which is the same as the ghost user)
        const { iv, tag, ciphertext, encoding, algorithm } = infisicalSymmetricEncypt(ghostUser.keys.plainPrivateKey);

        // 5. Create a bot for the project
        const newBot = await projectBotDAL.create(
          {
            name: "Infisical Bot (Ghost)",
            projectId: project.id,
            tag,
            iv,
            encryptedPrivateKey: ciphertext,
            isActive: true,
            publicKey: ghostUser.keys.publicKey,
            senderId: ghostUser.user.id,
            encryptedProjectKey: newEncryptedProjectKey,
            encryptedProjectKeyNonce: newEncryptedProjectKeyIv,
            algorithm,
            keyEncoding: encoding
          },
          tx
        );

        const botPrivateKey = infisicalSymmetricDecrypt({
          keyEncoding: newBot.keyEncoding as SecretKeyEncoding,
          iv: newBot.iv,
          tag: newBot.tag,
          ciphertext: newBot.encryptedPrivateKey
        });

        const botKey = decryptAsymmetric({
          ciphertext: newBot.encryptedProjectKey!,
          privateKey: botPrivateKey,
          nonce: newBot.encryptedProjectKeyNonce!,
          publicKey: ghostUser.keys.publicKey
        });

        type TPartialSecret = Pick<
          TSecrets,
          | "id"
          | "secretKeyCiphertext"
          | "secretKeyIV"
          | "secretKeyTag"
          | "secretValueCiphertext"
          | "secretValueIV"
          | "secretValueTag"
          | "secretCommentCiphertext"
          | "secretCommentIV"
          | "secretCommentTag"
        >;

        const updatedSecrets: TPartialSecret[] = [];
        const updatedSecretVersions: TPartialSecret[] = [];
        const updatedSecretApprovals: TPartialSecret[] = [];
        for (const rawSecret of decryptedSecrets) {
          const secretKeyEncrypted = encryptSymmetric128BitHexKeyUTF8(rawSecret.secretKey, botKey);
          const secretValueEncrypted = encryptSymmetric128BitHexKeyUTF8(rawSecret.secretValue || "", botKey);
          const secretCommentEncrypted = encryptSymmetric128BitHexKeyUTF8(rawSecret.secretComment || "", botKey);

          const payload = {
            id: rawSecret.id,
            secretKeyCiphertext: secretKeyEncrypted.ciphertext,
            secretKeyIV: secretKeyEncrypted.iv,
            secretKeyTag: secretKeyEncrypted.tag,
            secretValueCiphertext: secretValueEncrypted.ciphertext,
            secretValueIV: secretValueEncrypted.iv,
            secretValueTag: secretValueEncrypted.tag,
            secretCommentCiphertext: secretCommentEncrypted.ciphertext,
            secretCommentIV: secretCommentEncrypted.iv,
            secretCommentTag: secretCommentEncrypted.tag
          } as const;

          if (rawSecret.docType === SecretDocType.Secret) {
            updatedSecrets.push(payload);
          } else if (rawSecret.docType === SecretDocType.SecretVersion) {
            updatedSecretVersions.push(payload);
          } else if (rawSecret.docType === SecretDocType.ApprovalSecret) {
            updatedSecretApprovals.push(payload);
          } else {
            throw new Error("Unknown secret type");
          }
        }

        const secretUpdates = await secretDAL.bulkUpdateNoVersionIncrement(
          [
            ...updatedSecrets.map((secret) => ({
              filter: { id: secret.id },
              data: {
                ...secret,
                id: undefined
              }
            }))
          ],
          tx
        );

        const secretVersionUpdates = await secretVersionDAL.bulkUpdateNoVersionIncrement(
          [
            ...updatedSecretVersions.map((version) => ({
              filter: { id: version.id },
              data: {
                ...version,
                id: undefined
              }
            }))
          ],
          tx
        );

        const secretApprovalUpdates = await secretApprovalSecretDAL.bulkUpdateNoVersionIncrement(
          [
            ...updatedSecretApprovals.map((approval) => ({
              filter: {
                id: approval.id
              },
              data: {
                ...approval,
                id: undefined
              }
            }))
          ],
          tx
        );

        if (secretUpdates.length !== updatedSecrets.length) {
          throw new Error("Failed to update some secrets");
        }
        if (secretVersionUpdates.length !== updatedSecretVersions.length) {
          throw new Error("Failed to update some secret versions");
        }
        if (secretApprovalUpdates.length !== updatedSecretApprovals.length) {
          throw new Error("Failed to update some secret approvals");
        }

        await projectDAL.setProjectUpgradeStatus(data.projectId, null, tx);

        throw new Error("Transaction was successful!");
      });
    } catch (err) {
      console.log(err);
      const [project] = await projectDAL
        .find({
          id: data.projectId,
          version: ProjectVersion.V1
        })
        .catch(() => [null]);

      if (!project) {
        logger.error("Failed to upgrade project, because no project was found", data);
      } else {
        await projectDAL.setProjectUpgradeStatus(data.projectId, ProjectUpgradeStatus.Failed);
        logger.error("Failed to upgrade project", data, err);
      }

      throw err;
    }
  });

  queueService.listen(QueueName.UpgradeProjectToGhost, "failed", (job, err) => {
    logger.error("Upgrade project failed", job?.data, err);
  });

  return {
    upgradeProject
  };
};
