/* eslint-disable no-await-in-loop */
import { randomUUID } from "crypto";

import {
  AccessScope,
  IntegrationAuthsSchema,
  ProjectMembershipRole,
  ProjectUpgradeStatus,
  ProjectVersion,
  SecretApprovalRequestsSecretsSchema,
  SecretKeyEncoding,
  SecretsSchema,
  SecretVersionsSchema,
  TableName,
  TIntegrationAuths,
  TSecretApprovalRequestsSecrets,
  TSecrets,
  TSecretVersions
} from "@app/db/schemas";
import { TSecretApprovalRequestDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-dal";
import { TSecretApprovalRequestSecretDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-secret-dal";
import { RequestState } from "@app/ee/services/secret-approval-request/secret-approval-request-types";
import {
  decryptIntegrationAuths,
  decryptSecretApprovals,
  decryptSecrets,
  decryptSecretVersions,
  SymmetricKeySize
} from "@app/lib/crypto";
import { crypto } from "@app/lib/crypto/cryptography";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueJobTypes, TQueueServiceFactory } from "@app/queue";

import { TIntegrationAuthDALFactory } from "../integration-auth/integration-auth-dal";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TMembershipUserDALFactory } from "../membership-user/membership-user-dal";
import { TOrgDALFactory } from "../org/org-dal";
import { TOrgServiceFactory } from "../org/org-service";
import { TProjectBotDALFactory } from "../project-bot/project-bot-dal";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TProjectKeyDALFactory } from "../project-key/project-key-dal";
import { TSecretDALFactory } from "../secret/secret-dal";
import { TSecretVersionDALFactory } from "../secret/secret-version-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TUserDALFactory } from "../user/user-dal";
import { TProjectDALFactory } from "./project-dal";
import { assignWorkspaceKeysToMembers, createProjectKey } from "./project-fns";

export type TProjectQueueFactory = ReturnType<typeof projectQueueFactory>;

type TProjectQueueFactoryDep = {
  queueService: TQueueServiceFactory;
  secretVersionDAL: Pick<TSecretVersionDALFactory, "find" | "bulkUpdateNoVersionIncrement" | "delete">;
  folderDAL: Pick<TSecretFolderDALFactory, "find">;
  secretDAL: Pick<TSecretDALFactory, "find" | "bulkUpdateNoVersionIncrement">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "findLatestProjectKey" | "find" | "create" | "delete" | "insertMany">;
  secretApprovalRequestDAL: Pick<TSecretApprovalRequestDALFactory, "find">;
  secretApprovalSecretDAL: Pick<TSecretApprovalRequestSecretDALFactory, "find" | "bulkUpdateNoVersionIncrement">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne" | "delete" | "create">;
  orgService: Pick<TOrgServiceFactory, "addGhostUser">;
  integrationAuthDAL: TIntegrationAuthDALFactory;
  userDAL: Pick<TUserDALFactory, "findUserEncKeyByUserId">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "find">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "transaction" | "updateById" | "setProjectUpgradeStatus" | "find">;
  orgDAL: Pick<TOrgDALFactory, "findMembership">;
  membershipUserDAL: TMembershipUserDALFactory;
  membershipRoleDAL: TMembershipRoleDALFactory;
};

export const projectQueueFactory = ({
  queueService,
  secretDAL,
  folderDAL,
  userDAL,
  secretVersionDAL,
  integrationAuthDAL,
  secretApprovalRequestDAL,
  secretApprovalSecretDAL,
  projectKeyDAL,
  projectBotDAL,
  projectEnvDAL,
  orgDAL,
  projectDAL,
  orgService,
  membershipUserDAL,
  membershipRoleDAL
}: TProjectQueueFactoryDep) => {
  const upgradeProject = async (dto: TQueueJobTypes["upgrade-project-to-ghost"]["payload"]) => {
    await queueService.queue(QueueName.UpgradeProjectToGhost, QueueJobs.UpgradeProjectToGhost, dto, {
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: {
        count: 5 // keep the most recent jobs
      },
      jobId: randomUUID()
    });
  };

  queueService.start(QueueName.UpgradeProjectToGhost, async ({ data }) => {
    try {
      const [project] = await projectDAL.find({
        id: data.projectId,
        version: ProjectVersion.V1
      });

      const oldProjectKey = await projectKeyDAL.findLatestProjectKey(data.startedByUserId, data.projectId);

      if (!project) {
        throw new Error("Project not found");
      }
      if (!oldProjectKey) {
        throw new Error("Old project key not found");
      }

      if (project.upgradeStatus !== ProjectUpgradeStatus.Failed && project.upgradeStatus !== null) {
        throw new Error("Project upgrade status is not valid");
      }

      await projectDAL.setProjectUpgradeStatus(data.projectId, ProjectUpgradeStatus.InProgress); // Set the status to in progress. This is important to prevent multiple upgrades at the same time.

      const userPrivateKey = crypto.encryption().symmetric().decryptWithRootEncryptionKey({
        keyEncoding: data.encryptedPrivateKey.keyEncoding,
        ciphertext: data.encryptedPrivateKey.encryptedKey,
        iv: data.encryptedPrivateKey.encryptedKeyIv,
        tag: data.encryptedPrivateKey.encryptedKeyTag
      });

      if (!oldProjectKey.sender.publicKey) {
        throw new Error("Old project key sender public key not found");
      }

      const decryptedPlainProjectKey = crypto.encryption().asymmetric().decrypt({
        ciphertext: oldProjectKey.encryptedKey,
        nonce: oldProjectKey.nonce,
        publicKey: oldProjectKey.sender.publicKey,
        privateKey: userPrivateKey
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
      const projectIntegrationAuths = await integrationAuthDAL.find({
        projectId: project.id
      });
      const secrets: TSecrets[] = [];
      const secretVersions: TSecretVersions[] = [];
      const approvalSecrets: TSecretApprovalRequestsSecrets[] = [];
      const folderSecretVersionIdsToDelete: string[] = [];

      for (const folder of projectFolders) {
        const folderSecrets = await secretDAL.find({ folderId: folder.id });

        const folderSecretVersions = await secretVersionDAL.find(
          {
            folderId: folder.id
          },
          // Only get the latest 700 secret versions for each folder.
          {
            limit: 1000,
            sort: [["createdAt", "desc"]]
          }
        );

        const deletedSecretVersions = await secretVersionDAL.find(
          {
            folderId: folder.id
          },
          {
            // Get all the secret versions that are not the latest 700
            offset: 1000
          }
        );
        folderSecretVersionIdsToDelete.push(...deletedSecretVersions.map((el) => el.id));

        const approvalRequests = await secretApprovalRequestDAL.find({
          status: RequestState.Open,
          folderId: folder.id
        });
        const secretApprovals = await secretApprovalSecretDAL.find({
          $in: {
            requestId: approvalRequests.map((el) => el.id)
          }
        });

        secrets.push(...folderSecrets);
        secretVersions.push(...folderSecretVersions);
        approvalSecrets.push(...secretApprovals);
      }

      const decryptedSecrets = decryptSecrets(secrets, userPrivateKey, oldProjectKey);
      const decryptedSecretVersions = decryptSecretVersions(secretVersions, userPrivateKey, oldProjectKey);
      const decryptedApprovalSecrets = decryptSecretApprovals(approvalSecrets, userPrivateKey, oldProjectKey);
      const decryptedIntegrationAuths = decryptIntegrationAuths(projectIntegrationAuths, userPrivateKey, oldProjectKey);

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
          plainProjectKey: decryptedPlainProjectKey,
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
        const projectMembership = await membershipUserDAL.create(
          {
            scopeProjectId: project.id,
            scope: AccessScope.Project,
            actorUserId: ghostUser.user.id,
            scopeOrgId: project.orgId
          },
          tx
        );
        await membershipRoleDAL.create({ membershipId: projectMembership.id, role: ProjectMembershipRole.Admin }, tx);

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
          const [orgMembership] = await orgDAL.findMembership({
            [`${TableName.Membership}.actorUserId` as "actorUserId"]: key.receiverId,
            [`${TableName.Membership}.scopeOrgId` as "scopeOrgId"]: project.orgId,
            [`${TableName.Membership}.scope` as "scope"]: AccessScope.Organization
          });

          if (!user) {
            throw new Error(`User with ID ${key.receiverId} was not found during upgrade.`);
          }

          if (!orgMembership) {
            // This can happen. Since we don't remove project memberships and project keys when a user is removed from an org, this is a valid case.
            logger.info(
              {
                userId: key.receiverId,
                orgId: project.orgId,
                projectId: project.id
              },
              "User is not in organization"
            );
            // eslint-disable-next-line no-continue
            continue;
          }

          if (!user.publicKey) {
            throw new Error(`User with ID ${key.receiverId} has no public key during upgrade.`);
          }

          const [newMember] = assignWorkspaceKeysToMembers({
            decryptKey: ghostUserLatestKey,
            userPrivateKey: ghostUser.keys.plainPrivateKey,
            members: [
              {
                userPublicKey: user.publicKey,
                orgMembershipId: orgMembership.id
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
        const { iv, tag, ciphertext, encoding, algorithm } = crypto
          .encryption()
          .symmetric()
          .encryptWithRootEncryptionKey(ghostUser.keys.plainPrivateKey);

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

        const botPrivateKey = crypto
          .encryption()
          .symmetric()
          .decryptWithRootEncryptionKey({
            keyEncoding: newBot.keyEncoding as SecretKeyEncoding,
            iv: newBot.iv,
            tag: newBot.tag,
            ciphertext: newBot.encryptedPrivateKey
          });

        const botKey = crypto.encryption().asymmetric().decrypt({
          ciphertext: newBot.encryptedProjectKey!,
          privateKey: botPrivateKey,
          nonce: newBot.encryptedProjectKeyNonce!,
          publicKey: ghostUser.keys.publicKey
        });

        const updatedSecrets: TSecrets[] = [];
        const updatedSecretVersions: TSecretVersions[] = [];
        const updatedSecretApprovals: TSecretApprovalRequestsSecrets[] = [];
        const updatedIntegrationAuths: TIntegrationAuths[] = [];
        for (const rawSecret of decryptedSecrets) {
          const secretKeyEncrypted = crypto.encryption().symmetric().encrypt({
            plaintext: rawSecret.decrypted.secretKey,
            key: botKey,
            keySize: SymmetricKeySize.Bits128
          });

          const secretValueEncrypted = crypto
            .encryption()
            .symmetric()
            .encrypt({
              plaintext: rawSecret.decrypted.secretValue || "",
              key: botKey,
              keySize: SymmetricKeySize.Bits128
            });

          const secretCommentEncrypted = crypto
            .encryption()
            .symmetric()
            .encrypt({
              plaintext: rawSecret.decrypted.secretComment || "",
              key: botKey,
              keySize: SymmetricKeySize.Bits128
            });

          const payload: TSecrets = {
            ...rawSecret.original,
            keyEncoding: SecretKeyEncoding.UTF8,

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

          if (!SecretsSchema.safeParse(payload).success) {
            throw new Error(`Invalid secret payload: ${JSON.stringify(payload)}`);
          }

          updatedSecrets.push(payload);
        }

        for (const rawSecretVersion of decryptedSecretVersions) {
          const secretKeyEncrypted = crypto.encryption().symmetric().encrypt({
            plaintext: rawSecretVersion.decrypted.secretKey,
            key: botKey,
            keySize: SymmetricKeySize.Bits128
          });

          const secretValueEncrypted = crypto
            .encryption()
            .symmetric()
            .encrypt({
              plaintext: rawSecretVersion.decrypted.secretValue || "",
              key: botKey,
              keySize: SymmetricKeySize.Bits128
            });

          const secretCommentEncrypted = crypto
            .encryption()
            .symmetric()
            .encrypt({
              plaintext: rawSecretVersion.decrypted.secretComment || "",
              key: botKey,
              keySize: SymmetricKeySize.Bits128
            });

          const payload: TSecretVersions = {
            ...rawSecretVersion.original,
            keyEncoding: SecretKeyEncoding.UTF8,

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

          if (!SecretVersionsSchema.safeParse(payload).success) {
            throw new Error(`Invalid secret version payload: ${JSON.stringify(payload)}`);
          }

          updatedSecretVersions.push(payload);
        }

        for (const rawSecretApproval of decryptedApprovalSecrets) {
          const secretKeyEncrypted = crypto.encryption().symmetric().encrypt({
            plaintext: rawSecretApproval.decrypted.secretKey,
            key: botKey,
            keySize: SymmetricKeySize.Bits128
          });
          const secretValueEncrypted = crypto
            .encryption()
            .symmetric()
            .encrypt({
              plaintext: rawSecretApproval.decrypted.secretValue || "",
              key: botKey,
              keySize: SymmetricKeySize.Bits128
            });
          const secretCommentEncrypted = crypto
            .encryption()
            .symmetric()
            .encrypt({
              plaintext: rawSecretApproval.decrypted.secretComment || "",
              key: botKey,
              keySize: SymmetricKeySize.Bits128
            });

          const payload: TSecretApprovalRequestsSecrets = {
            ...rawSecretApproval.original,
            keyEncoding: SecretKeyEncoding.UTF8,

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

          if (!SecretApprovalRequestsSecretsSchema.safeParse(payload).success) {
            throw new Error(`Invalid secret approval payload: ${JSON.stringify(payload)}`);
          }

          updatedSecretApprovals.push(payload);
        }

        for (const integrationAuth of decryptedIntegrationAuths) {
          const access = crypto.encryption().symmetric().encrypt({
            plaintext: integrationAuth.decrypted.access,
            key: botKey,
            keySize: SymmetricKeySize.Bits128
          });
          const accessId = crypto.encryption().symmetric().encrypt({
            plaintext: integrationAuth.decrypted.accessId,
            key: botKey,
            keySize: SymmetricKeySize.Bits128
          });
          const refresh = crypto.encryption().symmetric().encrypt({
            plaintext: integrationAuth.decrypted.refresh,
            key: botKey,
            keySize: SymmetricKeySize.Bits128
          });

          const payload: TIntegrationAuths = {
            ...integrationAuth.original,
            keyEncoding: SecretKeyEncoding.UTF8,

            accessCiphertext: access.ciphertext,
            accessIV: access.iv,
            accessTag: access.tag,

            accessIdCiphertext: accessId.ciphertext,
            accessIdIV: accessId.iv,
            accessIdTag: accessId.tag,

            refreshCiphertext: refresh.ciphertext,
            refreshIV: refresh.iv,
            refreshTag: refresh.tag
          } as const;

          if (!IntegrationAuthsSchema.safeParse(payload).success) {
            throw new Error(`Invalid integration auth payload: ${JSON.stringify(payload)}`);
          }

          updatedIntegrationAuths.push(payload);
        }

        if (updatedSecrets.length !== secrets.length) {
          throw new Error("Failed to update some secrets");
        }
        if (updatedSecretVersions.length !== secretVersions.length) {
          throw new Error("Failed to update some secret versions");
        }
        if (updatedSecretApprovals.length !== approvalSecrets.length) {
          throw new Error("Failed to update some secret approvals");
        }
        if (updatedIntegrationAuths.length !== projectIntegrationAuths.length) {
          throw new Error("Failed to update some integration auths");
        }

        const secretUpdates = await secretDAL.bulkUpdateNoVersionIncrement(updatedSecrets, tx);
        const secretVersionUpdates = await secretVersionDAL.bulkUpdateNoVersionIncrement(updatedSecretVersions, tx);
        const secretApprovalUpdates = await secretApprovalSecretDAL.bulkUpdateNoVersionIncrement(
          updatedSecretApprovals,
          tx
        );
        const integrationAuthUpdates = await integrationAuthDAL.bulkUpdate(
          updatedIntegrationAuths.map((el) => ({
            filter: { id: el.id },
            data: {
              ...el,
              id: undefined
            }
          })),
          tx
        );

        // Delete all secret versions that are no longer needed. We only store the latest 100 versions for each secret.
        await secretVersionDAL.delete(
          {
            $in: {
              id: folderSecretVersionIdsToDelete
            }
          },
          tx
        );

        if (
          secretUpdates.length !== updatedSecrets.length ||
          secretVersionUpdates.length !== updatedSecretVersions.length ||
          secretApprovalUpdates.length !== updatedSecretApprovals.length ||
          integrationAuthUpdates.length !== updatedIntegrationAuths.length
        ) {
          throw new Error("Parts of the upgrade failed. Some secrets were not updated");
        }

        await projectDAL.setProjectUpgradeStatus(data.projectId, null, tx);

        //  await new Promise((resolve) => setTimeout(resolve, 15_000));
        // throw new Error("Transaction was successful!");
      });
    } catch (err) {
      const [project] = await projectDAL
        .find({
          id: data.projectId,
          version: ProjectVersion.V1
        })
        .catch(() => [null]);

      if (!project) {
        logger.error(data, "Failed to upgrade project, because no project was found");
      } else {
        await projectDAL.setProjectUpgradeStatus(data.projectId, ProjectUpgradeStatus.Failed);
        logger.error(err, "Failed to upgrade project", {
          extra: {
            project,
            jobData: data
          }
        });
      }

      throw err;
    }
  });

  queueService.listen(QueueName.UpgradeProjectToGhost, "failed", (job, err) => {
    logger.error(err, "Upgrade project failed", job?.data);
  });

  return {
    upgradeProject
  };
};
