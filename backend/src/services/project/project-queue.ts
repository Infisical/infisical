/* eslint-disable no-await-in-loop */
import { randomUUID } from "crypto";

import {
  AccessScope,
  IntegrationAuthsSchema,
  ProjectMembershipRole,
  ProjectType,
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
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import {
  decryptIntegrationAuths,
  decryptSecretApprovals,
  decryptSecrets,
  decryptSecretVersions,
  SymmetricKeySize
} from "@app/lib/crypto";
import { crypto } from "@app/lib/crypto/cryptography";
import { logger } from "@app/lib/logger";
import { recordLegacyRootKeyUsageMetric } from "@app/lib/telemetry/metrics";
import { QueueJobs, QueueName, TQueueJobTypes, TQueueServiceFactory } from "@app/queue";
import { JobState } from "@app/queue/queue-service";

import { TIntegrationAuthDALFactory } from "../integration-auth/integration-auth-dal";
import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
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
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { TUserDALFactory } from "../user/user-dal";
import { TProjectDALFactory } from "./project-dal";
import {
  assignWorkspaceKeysToMembers,
  createProjectKey,
  releaseSecretBlindIndexMigrationOrgSlot,
  SECRET_BLIND_INDEX_MIGRATION_DISPATCH_MAX_STALLED_ITERATIONS,
  SECRET_BLIND_INDEX_MIGRATION_MAX_ATTEMPTS,
  SECRET_BLIND_INDEX_MIGRATION_ORG_IN_FLIGHT_LIMIT,
  SECRET_BLIND_INDEX_MIGRATION_ORG_SLOT_RETRY_DELAY_MS,
  SECRET_BLIND_INDEX_MIGRATION_WORKER_CONCURRENCY,
  tryAdmitSecretBlindIndexMigrationOrgSlot
} from "./project-fns";

export type TProjectQueueFactory = ReturnType<typeof projectQueueFactory>;

type TProjectQueueFactoryDep = {
  queueService: TQueueServiceFactory;
  keyStore: Pick<TKeyStoreFactory, "deleteItems" | "incrementByAndRefreshExpiryIfUnderLimit" | "decrementByOrDelete">;
  secretVersionDAL: Pick<TSecretVersionDALFactory, "find" | "bulkUpdateNoVersionIncrement" | "delete">;
  folderDAL: Pick<TSecretFolderDALFactory, "find">;
  secretDAL: Pick<TSecretDALFactory, "find" | "bulkUpdateNoVersionIncrement">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "findProjectSecretsWithNullBlindIndex" | "batchSetBlindIndexes">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
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
  keyStore,
  secretDAL,
  secretV2BridgeDAL,
  kmsService,
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

      recordLegacyRootKeyUsageMetric({ operation: "decrypt", surface: "user_private_key" });
      logger.info(`Legacy root key used during project upgrade [projectId=${data.projectId}]`);
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
        recordLegacyRootKeyUsageMetric({ operation: "encrypt", surface: "project_ghost_user" });
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

        recordLegacyRootKeyUsageMetric({ operation: "decrypt", surface: "project_bot" });
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

  const startSecretBlindIndexMigration = async (projectId: string) => {
    const jobId = `enable-blind-index-project-${projectId}`;

    const existingJob = await queueService.getJob(QueueName.SecretBlindIndexMigration, jobId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (state === "completed" || state === "failed") {
        await existingJob.remove();
      } else {
        logger.info(`Job for project ${projectId} already exists, skipping`);
        return false;
      }
    }

    await queueService.queue(
      QueueName.SecretBlindIndexMigration,
      QueueJobs.SecretBlindIndexMigration,
      { projectId },
      {
        // 1 minute, we don't use it after it's complete, just making sure any race condition can still fetch the job
        removeOnComplete: { age: 60 },
        // 1 day, this gives us time to display the error to the customer
        removeOnFail: { age: 24 * 3600 },
        attempts: SECRET_BLIND_INDEX_MIGRATION_MAX_ATTEMPTS,
        backoff: { type: "fixed", delay: SECRET_BLIND_INDEX_MIGRATION_ORG_SLOT_RETRY_DELAY_MS },
        jobId
      }
    );

    return true;
  };

  const startSecretBlindIndexMigrationPerOrg = async (orgId: string, limit: number) => {
    const projects = await projectDAL.find(
      {
        orgId,
        secretBlindIndexEnabled: false,
        type: ProjectType.SecretManager,
        version: ProjectVersion.V3
      },
      { limit, sort: [["id", "asc"]], count: true }
    );
    const pendingProjectCount = projects.length ? Number((projects[0] as unknown as { count: string }).count) : 0;

    const enqueuedProjectIds: string[] = [];
    for (const project of projects) {
      if (await startSecretBlindIndexMigration(project.id)) enqueuedProjectIds.push(project.id);
    }

    return { enqueuedProjectIds, pendingProjectCount };
  };

  const getSecretBlindIndexMigrationOrgJobId = (orgId: string) => `enable-blind-index-org-${orgId}`;

  const startSecretBlindIndexMigrationForOrg = async (orgId: string) => {
    const jobId = getSecretBlindIndexMigrationOrgJobId(orgId);

    const existingJob = await queueService.getJob(QueueName.SecretBlindIndexMigrationDispatch, jobId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (state === "completed" || state === "failed") {
        await existingJob.remove();
      } else {
        logger.info(`SecretBlindIndexMigrationDispatch: already running, skipping [orgId=${orgId}]`);
        return false;
      }
    }

    await queueService.queue(
      QueueName.SecretBlindIndexMigrationDispatch,
      QueueJobs.SecretBlindIndexMigrationDispatch,
      { orgId },
      {
        removeOnComplete: { age: 60 },
        removeOnFail: { age: 24 * 3600 },
        attempts: 1,
        jobId
      }
    );

    return true;
  };

  queueService.start(
    QueueName.SecretBlindIndexMigrationDispatch,
    async (job) => {
      const { orgId } = job.data;

      let totalEnqueued = 0;
      let stalledIterations = 0;
      let lastPendingProjectCount = Infinity;

      for (;;) {
        const { enqueuedProjectIds, pendingProjectCount } = await startSecretBlindIndexMigrationPerOrg(
          orgId,
          SECRET_BLIND_INDEX_MIGRATION_ORG_IN_FLIGHT_LIMIT
        );

        if (!pendingProjectCount) {
          logger.info(`SecretBlindIndexMigrationDispatch: complete [orgId=${orgId}] [totalEnqueued=${totalEnqueued}]`);
          return;
        }

        totalEnqueued += enqueuedProjectIds.length;
        await job.updateProgress(totalEnqueued);

        const backlogDrained = pendingProjectCount < lastPendingProjectCount;
        if (backlogDrained) {
          stalledIterations = 0;
        } else {
          stalledIterations += 1;
        }
        lastPendingProjectCount = pendingProjectCount;

        if (stalledIterations >= SECRET_BLIND_INDEX_MIGRATION_DISPATCH_MAX_STALLED_ITERATIONS) {
          logger.error(
            `SecretBlindIndexMigrationDispatch: giving up, backlog is not draining [orgId=${orgId}] [pendingProjectCount=${pendingProjectCount}] [totalEnqueued=${totalEnqueued}]`
          );
          return;
        }

        await new Promise((resolve) => {
          setTimeout(resolve, 30_000);
        });
      }
    },
    { concurrency: 5 }
  );

  queueService.listen(QueueName.SecretBlindIndexMigrationDispatch, "failed", (job, err) => {
    logger.error(err, `SecretBlindIndexMigrationDispatch: failed [orgId=${job?.data.orgId}]`);
  });

  queueService.start(
    QueueName.SecretBlindIndexMigration,
    async (job) => {
      const { projectId } = job.data;
      const BATCH_SIZE = 1000;

      const project = await projectDAL.findOne({ id: projectId });
      if (!project) {
        logger.info(`SecretBlindIndexMigration: project not found, skipping [projectId=${projectId}]`);
        return;
      }
      if (project.secretBlindIndexEnabled) {
        logger.info(`SecretBlindIndexMigration: already enabled, skipping [projectId=${projectId}]`);
        return;
      }

      const { orgId } = project;
      const admitted = await tryAdmitSecretBlindIndexMigrationOrgSlot(keyStore, orgId);
      if (!admitted) {
        const attempt = (job.attemptsMade ?? 0) + 1;
        logger.info(
          `SecretBlindIndexMigration: org at cap [projectId=${projectId}] [orgId=${orgId}] [attempt=${attempt}/5]`
        );
        throw new Error(
          "Secret blind index migration could not start because too many migrations are already running for this organization. Try again later."
        );
      }

      try {
        logger.info(`SecretBlindIndexMigration: starting migration [projectId=${projectId}]`);

        const { decryptor, generateSecretBlindIndex } = await kmsService.createCipherPairWithDataKey({
          type: KmsDataKey.SecretManager,
          projectId
        });

        let totalProcessed = 0;

        // eslint-disable-next-line no-constant-condition, @typescript-eslint/no-unnecessary-condition
        while (true) {
          const secrets = await secretV2BridgeDAL.findProjectSecretsWithNullBlindIndex(projectId, BATCH_SIZE);

          if (secrets.length === 0) break;

          const updates: { id: string; secretValueBlindIndex: string }[] = [];
          for (const secret of secrets) {
            if (secret.encryptedValue) {
              const decryptedValue = decryptor({ cipherTextBlob: secret.encryptedValue });
              const blindIndex = await generateSecretBlindIndex(decryptedValue);
              updates.push({ id: secret.id, secretValueBlindIndex: blindIndex });
            }
          }

          if (updates.length > 0) {
            await secretV2BridgeDAL.batchSetBlindIndexes(updates);
          }

          totalProcessed += updates.length;
          logger.info(
            `SecretBlindIndexMigration: processed batch [projectId=${projectId}] [batchSize=${updates.length}] [totalProcessed=${totalProcessed}]`
          );

          // Prevents job from being marked as stalled
          await job.updateProgress(totalProcessed);

          if (secrets.length < BATCH_SIZE) break;

          // pause between batches to avoid saturating the CPU
          const jitter = 100 + Math.floor(Math.random() * 100);
          await new Promise((resolve) => {
            setTimeout(resolve, jitter);
          });
        }

        await projectDAL.updateById(projectId, { secretBlindIndexEnabled: true });

        await keyStore.deleteItems({
          pattern: `${KeyStorePrefixes.InsightsCache(projectId, "secrets-duplication")}*`
        });

        logger.info(
          `SecretBlindIndexMigration: migration complete [projectId=${projectId}] [totalProcessed=${totalProcessed}]`
        );
      } finally {
        await releaseSecretBlindIndexMigrationOrgSlot(keyStore, orgId);
      }
    },
    {
      concurrency: SECRET_BLIND_INDEX_MIGRATION_WORKER_CONCURRENCY,
      limiter: { max: 20, duration: 60_000 }
    }
  );

  queueService.listen(QueueName.SecretBlindIndexMigration, "failed", (job, err) => {
    logger.error(err, `SecretBlindIndexMigration: failed [projectId=${job?.data.projectId}]`);
  });

  const getJobState = async (projectId: string): Promise<{ status: JobState; message?: string }> => {
    const jobId = `enable-blind-index-project-${projectId}`;
    const job = await queueService.getJob(QueueName.SecretBlindIndexMigration, jobId);

    if (!job) {
      return { status: JobState.NotFound };
    }

    const state = await job.getState();

    if (state === JobState.Failed) {
      return { status: JobState.Failed, message: job.failedReason ?? "Unknown error" };
    }

    if (state === JobState.Completed) {
      return { status: JobState.Completed };
    }

    return { status: JobState.Pending };
  };

  const isSecretBlindIndexMigrationRunningForOrg = async (orgId: string) => {
    const job = await queueService.getJob(
      QueueName.SecretBlindIndexMigrationDispatch,
      getSecretBlindIndexMigrationOrgJobId(orgId)
    );
    if (!job) return false;

    const state = await job.getState();
    return state !== JobState.Completed && state !== JobState.Failed;
  };

  return {
    upgradeProject,
    startSecretBlindIndexMigration,
    startSecretBlindIndexMigrationForOrg,
    startSecretBlindIndexMigrationPerOrg,
    isSecretBlindIndexMigrationRunningForOrg,
    getJobState
  };
};
