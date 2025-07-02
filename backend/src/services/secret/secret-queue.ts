/* eslint-disable no-await-in-loop */
import opentelemetry from "@opentelemetry/api";
import { AxiosError } from "axios";
import { Knex } from "knex";

import {
  ProjectMembershipRole,
  ProjectUpgradeStatus,
  ProjectVersion,
  SecretType,
  TSecretSnapshotSecretsV2,
  TSecretVersionsV2
} from "@app/db/schemas";
import { Actor, EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TSecretApprovalRequestDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-dal";
import { TSecretRotationDALFactory } from "@app/ee/services/secret-rotation/secret-rotation-dal";
import { TSnapshotDALFactory } from "@app/ee/services/secret-snapshot/snapshot-dal";
import { TSnapshotSecretV2DALFactory } from "@app/ee/services/secret-snapshot/snapshot-secret-v2-dal";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { decryptSymmetric128BitHexKeyUTF8 } from "@app/lib/crypto";
import { infisicalSymmetricEncypt } from "@app/lib/crypto/encryption";
import { daysToMillisecond, secondsToMillis } from "@app/lib/dates";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { getTimeDifferenceInSeconds, groupBy, isSamePath, unique } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TProjectBotDALFactory } from "@app/services/project-bot/project-bot-dal";
import { createManySecretsRawFnFactory, updateManySecretsRawFnFactory } from "@app/services/secret/secret-fns";
import { TSecretVersionDALFactory } from "@app/services/secret/secret-version-dal";
import { TSecretVersionTagDALFactory } from "@app/services/secret/secret-version-tag-dal";
import { TSecretBlindIndexDALFactory } from "@app/services/secret-blind-index/secret-blind-index-dal";
import { TSecretSyncQueueFactory } from "@app/services/secret-sync/secret-sync-queue";
import { TSecretTagDALFactory } from "@app/services/secret-tag/secret-tag-dal";

import { ActorType } from "../auth/auth-type";
import { TFolderCommitServiceFactory } from "../folder-commit/folder-commit-service";
import { TIntegrationDALFactory } from "../integration/integration-dal";
import { TIntegrationAuthDALFactory } from "../integration-auth/integration-auth-dal";
import { TIntegrationAuthServiceFactory } from "../integration-auth/integration-auth-service";
import { syncIntegrationSecrets } from "../integration-auth/integration-sync-secret";
import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TOrgDALFactory } from "../org/org-dal";
import { TOrgServiceFactory } from "../org/org-service";
import { TProjectDALFactory } from "../project/project-dal";
import { createProjectKey } from "../project/project-fns";
import { TProjectBotServiceFactory } from "../project-bot/project-bot-service";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TProjectKeyDALFactory } from "../project-key/project-key-dal";
import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import { TProjectUserMembershipRoleDALFactory } from "../project-membership/project-user-membership-role-dal";
import { TResourceMetadataDALFactory } from "../resource-metadata/resource-metadata-dal";
import { ResourceMetadataDTO } from "../resource-metadata/resource-metadata-schema";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretImportDALFactory } from "../secret-import/secret-import-dal";
import { fnSecretsV2FromImports } from "../secret-import/secret-import-fns";
import { TSecretReminderRecipientsDALFactory } from "../secret-reminder-recipients/secret-reminder-recipients-dal";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { expandSecretReferencesFactory, getAllSecretReferences } from "../secret-v2-bridge/secret-v2-bridge-fns";
import { TSecretVersionV2DALFactory } from "../secret-v2-bridge/secret-version-dal";
import { TSecretVersionV2TagDALFactory } from "../secret-v2-bridge/secret-version-tag-dal";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TUserDALFactory } from "../user/user-dal";
import { TWebhookDALFactory } from "../webhook/webhook-dal";
import { fnTriggerWebhook } from "../webhook/webhook-fns";
import { WebhookEvents } from "../webhook/webhook-types";
import { TSecretDALFactory } from "./secret-dal";
import { interpolateSecrets } from "./secret-fns";
import {
  TCreateSecretReminderDTO,
  TFailedIntegrationSyncEmailsPayload,
  THandleReminderDTO,
  TIntegrationSyncPayload,
  TRemoveSecretReminderDTO,
  TSyncSecretsDTO
} from "./secret-types";

export type TSecretQueueFactory = ReturnType<typeof secretQueueFactory>;
type TSecretQueueFactoryDep = {
  queueService: TQueueServiceFactory;
  integrationDAL: Pick<TIntegrationDALFactory, "findByProjectIdV2" | "updateById">;
  integrationAuthDAL: Pick<TIntegrationAuthDALFactory, "upsert" | "find">;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  integrationAuthService: Pick<TIntegrationAuthServiceFactory, "getIntegrationAccessToken">;
  folderDAL: TSecretFolderDALFactory;
  secretDAL: TSecretDALFactory;
  secretImportDAL: Pick<TSecretImportDALFactory, "find" | "findByFolderIds">;
  webhookDAL: Pick<TWebhookDALFactory, "findAllWebhooks" | "transaction" | "update" | "bulkUpdate">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne" | "find">;
  projectDAL: TProjectDALFactory;
  projectBotDAL: TProjectBotDALFactory;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "create">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findAllProjectMembers" | "create">;
  smtpService: TSmtpService;
  orgDAL: Pick<TOrgDALFactory, "findOrgByProjectId">;
  secretVersionDAL: TSecretVersionDALFactory;
  secretBlindIndexDAL: TSecretBlindIndexDALFactory;
  secretTagDAL: TSecretTagDALFactory;
  userDAL: Pick<TUserDALFactory, "findById">;
  secretVersionTagDAL: TSecretVersionTagDALFactory;
  kmsService: TKmsServiceFactory;
  secretV2BridgeDAL: TSecretV2BridgeDALFactory;
  secretVersionV2BridgeDAL: Pick<TSecretVersionV2DALFactory, "batchInsert" | "insertMany" | "findLatestVersionMany">;
  secretVersionTagV2BridgeDAL: Pick<TSecretVersionV2TagDALFactory, "insertMany" | "batchInsert">;
  secretRotationDAL: Pick<TSecretRotationDALFactory, "secretOutputV2InsertMany" | "find">;
  secretApprovalRequestDAL: Pick<TSecretApprovalRequestDALFactory, "deleteByProjectId">;
  snapshotDAL: Pick<TSnapshotDALFactory, "findNSecretV1SnapshotByFolderId" | "deleteSnapshotsAboveLimit">;
  snapshotSecretV2BridgeDAL: Pick<TSnapshotSecretV2DALFactory, "insertMany" | "batchInsert">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "setItemWithExpiry" | "getItem">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  orgService: Pick<TOrgServiceFactory, "addGhostUser">;
  projectUserMembershipRoleDAL: Pick<TProjectUserMembershipRoleDALFactory, "create">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany" | "delete">;
  folderCommitService: Pick<TFolderCommitServiceFactory, "createCommit">;
  secretReminderRecipientsDAL: Pick<
    TSecretReminderRecipientsDALFactory,
    "delete" | "findUsersBySecretId" | "insertMany" | "transaction"
  >;
  secretSyncQueue: Pick<TSecretSyncQueueFactory, "queueSecretSyncsSyncSecretsByPath">;
};

export type TGetSecrets = {
  secretPath: string;
  projectId: string;
  environment: string;
};

const MAX_SYNC_SECRET_DEPTH = 5;
const SYNC_SECRET_DEBOUNCE_INTERVAL_MS = 3000;

export const uniqueSecretQueueKey = (environment: string, secretPath: string) =>
  `secret-queue-dedupe-${environment}-${secretPath}`;

type TIntegrationSecret = Record<
  string,
  {
    value: string;
    comment?: string;
    skipMultilineEncoding?: boolean | null | undefined;
    secretMetadata?: ResourceMetadataDTO;
  }
>;

// TODO(akhilmhdh): split this into multiple queue
export const secretQueueFactory = ({
  queueService,
  integrationDAL,
  integrationAuthDAL,
  projectBotService,
  integrationAuthService,
  secretDAL,
  secretImportDAL,
  folderDAL,
  userDAL,
  webhookDAL,
  projectEnvDAL,
  orgDAL,
  smtpService,
  projectDAL,
  projectBotDAL,
  projectMembershipDAL,
  secretVersionDAL,
  secretBlindIndexDAL,
  secretTagDAL,
  secretVersionTagDAL,
  secretV2BridgeDAL,
  secretVersionV2BridgeDAL,
  kmsService,
  secretVersionTagV2BridgeDAL,
  secretRotationDAL,
  snapshotDAL,
  snapshotSecretV2BridgeDAL,
  secretApprovalRequestDAL,
  keyStore,
  auditLogService,
  orgService,
  projectUserMembershipRoleDAL,
  projectKeyDAL,
  resourceMetadataDAL,
  secretReminderRecipientsDAL,
  secretSyncQueue,
  folderCommitService
}: TSecretQueueFactoryDep) => {
  const integrationMeter = opentelemetry.metrics.getMeter("Integrations");
  const errorHistogram = integrationMeter.createHistogram("integration_secret_sync_errors", {
    description: "Integration secret sync errors",
    unit: "1"
  });

  const removeSecretReminder = async ({ deleteRecipients = true, ...dto }: TRemoveSecretReminderDTO, tx?: Knex) => {
    if (deleteRecipients) {
      await secretReminderRecipientsDAL.delete({ secretId: dto.secretId }, tx);
    }

    const appCfg = getConfig();
    await queueService.stopRepeatableJob(
      QueueName.SecretReminder,
      QueueJobs.SecretReminder,
      {
        // on prod it this will be in days, in development this will be second
        every: appCfg.NODE_ENV === "development" ? secondsToMillis(dto.repeatDays) : daysToMillisecond(dto.repeatDays)
      },
      `reminder-${dto.secretId}`
    );
  };

  const $generateActor = async (actorId?: string, isManual?: boolean): Promise<Actor> => {
    if (isManual && actorId) {
      const user = await userDAL.findById(actorId);

      if (!user) {
        throw new Error("User not found");
      }

      return {
        type: ActorType.USER,
        metadata: {
          email: user.email,
          username: user.username,
          userId: user.id
        }
      };
    }

    return {
      type: ActorType.PLATFORM,
      metadata: {}
    };
  };

  const $getJobKey = (projectId: string, environmentSlug: string, secretPath: string) => {
    // the idea here is a timestamp based id which will be constant in a 3s interval
    const timestampId = Math.floor(Date.now() / SYNC_SECRET_DEBOUNCE_INTERVAL_MS);

    return `secret-queue-sync_${projectId}_${environmentSlug}_${secretPath}_${timestampId}`
      .replace("/", "-")
      .replace(":", "-");
  };

  const addSecretReminder = async ({
    oldSecret,
    newSecret,
    projectId,
    deleteRecipients = true
  }: TCreateSecretReminderDTO) => {
    try {
      const appCfg = getConfig();

      if (oldSecret.id !== newSecret.id) {
        throw new BadRequestError({
          name: "SecretReminderIdMismatch",
          message: "Existing secret didn't match the updated secret ID."
        });
      }

      if (!newSecret.secretReminderRepeatDays) {
        throw new BadRequestError({
          name: "SecretReminderRepeatDaysMissing",
          message: "Secret reminder repeat days is missing."
        });
      }

      // If the secret already has a reminder, we should remove the existing one first.
      if (oldSecret.secretReminderRepeatDays) {
        await removeSecretReminder({
          repeatDays: oldSecret.secretReminderRepeatDays,
          secretId: oldSecret.id,
          deleteRecipients
        });
      }

      await queueService.queue(
        QueueName.SecretReminder,
        QueueJobs.SecretReminder,
        {
          note: newSecret.secretReminderNote,
          projectId,
          repeatDays: newSecret.secretReminderRepeatDays,
          secretId: newSecret.id
        },
        {
          jobId: `reminder-${newSecret.id}`,
          repeat: {
            // on prod it this will be in days, in development this will be second
            every:
              appCfg.NODE_ENV === "development"
                ? secondsToMillis(newSecret.secretReminderRepeatDays)
                : daysToMillisecond(newSecret.secretReminderRepeatDays),
            immediately: true
          },
          removeOnComplete: true,
          removeOnFail: true
        }
      );
    } catch (err) {
      logger.error(err, "Failed to create secret reminder.");
      throw new BadRequestError({
        name: "SecretReminderCreateFailed",
        message: "Failed to create secret reminder."
      });
    }
  };

  const handleSecretReminder = async ({ newSecret, oldSecret, projectId }: THandleReminderDTO) => {
    const { secretReminderRepeatDays, secretReminderNote, secretReminderRecipients } = newSecret;

    const recipientsUpdated =
      secretReminderRecipients?.some(
        (newId) => !oldSecret.secretReminderRecipients?.find((oldId) => newId === oldId)
      ) || secretReminderRecipients?.length !== oldSecret.secretReminderRecipients?.length;

    await secretReminderRecipientsDAL.transaction(async (tx) => {
      if (newSecret.type !== SecretType.Personal && secretReminderRepeatDays !== undefined) {
        if (
          (secretReminderRepeatDays && oldSecret.secretReminderRepeatDays !== secretReminderRepeatDays) ||
          (secretReminderNote && oldSecret.secretReminderNote !== secretReminderNote)
        ) {
          await addSecretReminder({
            oldSecret,
            newSecret,
            projectId,
            deleteRecipients: false
          });
        } else if (
          secretReminderRepeatDays === null &&
          secretReminderNote === null &&
          oldSecret.secretReminderRepeatDays
        ) {
          await removeSecretReminder({
            secretId: oldSecret.id,
            repeatDays: oldSecret.secretReminderRepeatDays
          });
        }
      }

      if (recipientsUpdated) {
        // if no recipients, delete all existing recipients
        if (!secretReminderRecipients?.length) {
          const existingRecipients = await secretReminderRecipientsDAL.findUsersBySecretId(newSecret.id, tx);
          if (existingRecipients) {
            await secretReminderRecipientsDAL.delete({ secretId: newSecret.id }, tx);
          }
        } else {
          await secretReminderRecipientsDAL.delete({ secretId: newSecret.id }, tx);
          await secretReminderRecipientsDAL.insertMany(
            secretReminderRecipients.map((r) => ({
              secretId: newSecret.id,
              userId: r,
              projectId
            })),
            tx
          );
        }
      }
    });
  };
  const createManySecretsRawFn = createManySecretsRawFnFactory({
    projectDAL,
    projectBotDAL,
    secretDAL,
    secretVersionDAL,
    secretBlindIndexDAL,
    secretTagDAL,
    secretVersionTagDAL,
    folderDAL,
    kmsService,
    secretVersionV2BridgeDAL,
    secretV2BridgeDAL,
    secretVersionTagV2BridgeDAL,
    resourceMetadataDAL,
    folderCommitService
  });

  const updateManySecretsRawFn = updateManySecretsRawFnFactory({
    projectDAL,
    projectBotDAL,
    secretDAL,
    secretVersionDAL,
    secretBlindIndexDAL,
    secretTagDAL,
    secretVersionTagDAL,
    folderDAL,
    kmsService,
    secretVersionV2BridgeDAL,
    secretV2BridgeDAL,
    secretVersionTagV2BridgeDAL,
    resourceMetadataDAL,
    folderCommitService
  });

  /**
   * Return the secrets in a given [folderId] including secrets from
   * nested imported folders recursively.
   */
  const getIntegrationSecretsV2 = async (dto: {
    projectId: string;
    environment: string;
    secretPath: string;
    folderId: string;
    depth: number;
    decryptor: (value: Buffer | null | undefined) => string;
  }) => {
    const content: TIntegrationSecret = {};
    if (dto.depth > MAX_SYNC_SECRET_DEPTH) {
      logger.info(
        `getIntegrationSecrets: secret depth exceeded for [projectId=${dto.projectId}] [folderId=${dto.folderId}] [depth=${dto.depth}]`
      );
      return content;
    }
    const { expandSecretReferences } = expandSecretReferencesFactory({
      decryptSecretValue: dto.decryptor,
      secretDAL: secretV2BridgeDAL,
      folderDAL,
      projectId: dto.projectId,
      // on integration expand all secrets
      canExpandValue: () => true
    });
    // process secrets in current folder
    const secrets = await secretV2BridgeDAL.findByFolderId({ folderId: dto.folderId });

    await Promise.allSettled(
      secrets.map(async (secret) => {
        const secretKey = secret.key;
        const secretValue = dto.decryptor(secret.encryptedValue);
        const expandedSecretValue = await expandSecretReferences({
          environment: dto.environment,
          secretPath: dto.secretPath,
          skipMultilineEncoding: secret.skipMultilineEncoding,
          value: secretValue
        });
        content[secretKey] = { value: expandedSecretValue || "" };

        if (secret.encryptedComment) {
          const commentValue = dto.decryptor(secret.encryptedComment);
          content[secretKey].comment = commentValue;
        }

        content[secretKey].skipMultilineEncoding = Boolean(secret.skipMultilineEncoding);
        content[secretKey].secretMetadata = secret.secretMetadata;
      })
    );

    // check if current folder has any imports from other folders
    const secretImports = await secretImportDAL.find({ folderId: dto.folderId, isReplication: false });

    // if no imports then return secrets in the current folder
    if (!secretImports.length) return content;
    const importedSecrets = await fnSecretsV2FromImports({
      decryptor: dto.decryptor,
      folderDAL,
      secretDAL: secretV2BridgeDAL,
      expandSecretReferences,
      secretImportDAL,
      secretImports,
      hasSecretAccess: () => true,
      viewSecretValue: true
    });

    for (let i = importedSecrets.length - 1; i >= 0; i -= 1) {
      for (let j = 0; j < importedSecrets[i].secrets.length; j += 1) {
        const importedSecret = importedSecrets[i].secrets[j];
        if (!content[importedSecret.key]) {
          content[importedSecret.key] = {
            skipMultilineEncoding: importedSecret.skipMultilineEncoding,
            comment: importedSecret.secretComment,
            value: importedSecret.secretValue || "",
            secretMetadata: importedSecret.secretMetadata
          };
        }
      }
    }
    return content;
  };

  /**
   * Return the secrets in a given [folderId] including secrets from
   * nested imported folders recursively.
   */
  const getIntegrationSecrets = async (dto: {
    projectId: string;
    environment: string;
    secretPath: string;
    folderId: string;
    key: string;
    depth: number;
  }) => {
    let content: TIntegrationSecret = {};
    if (dto.depth > MAX_SYNC_SECRET_DEPTH) {
      logger.info(
        `getIntegrationSecrets: secret depth exceeded for [projectId=${dto.projectId}] [folderId=${dto.folderId}] [depth=${dto.depth}]`
      );
      return content;
    }

    const expandSecretReferences = interpolateSecrets({
      projectId: dto.projectId,
      secretEncKey: dto.key,
      folderDAL,
      secretDAL
    });

    // process secrets in current folder
    const secrets = await secretDAL.findByFolderId(dto.folderId);
    await Promise.allSettled(
      secrets.map(async (secret) => {
        const secretKey = decryptSymmetric128BitHexKeyUTF8({
          ciphertext: secret.secretKeyCiphertext,
          iv: secret.secretKeyIV,
          tag: secret.secretKeyTag,
          key: dto.key
        });

        const secretValue = decryptSymmetric128BitHexKeyUTF8({
          ciphertext: secret.secretValueCiphertext,
          iv: secret.secretValueIV,
          tag: secret.secretValueTag,
          key: dto.key
        });
        const expandedSecretValue = await expandSecretReferences({
          environment: dto.environment,
          secretPath: dto.secretPath,
          skipMultilineEncoding: secret.skipMultilineEncoding,
          value: secretValue
        });

        content[secretKey] = { value: expandedSecretValue || "" };

        if (secret.secretCommentCiphertext && secret.secretCommentIV && secret.secretCommentTag) {
          const commentValue = decryptSymmetric128BitHexKeyUTF8({
            ciphertext: secret.secretCommentCiphertext,
            iv: secret.secretCommentIV,
            tag: secret.secretCommentTag,
            key: dto.key
          });
          content[secretKey].comment = commentValue;
        }

        content[secretKey].skipMultilineEncoding = Boolean(secret.skipMultilineEncoding);
      })
    );

    // check if current folder has any imports from other folders
    const secretImport = await secretImportDAL.find({ folderId: dto.folderId, isReplication: false });

    // if no imports then return secrets in the current folder
    if (!secretImport) return content;

    const importedFolders = await folderDAL.findByManySecretPath(
      secretImport.map(({ importEnv, importPath }) => ({
        envId: importEnv.id,
        secretPath: importPath
      }))
    );

    for await (const folder of importedFolders) {
      if (folder) {
        // get secrets contained in each imported folder by recursively calling
        // this function against the imported folder
        const importedSecrets = await getIntegrationSecrets({
          environment: dto.environment,
          projectId: dto.projectId,
          folderId: folder.id,
          key: dto.key,
          depth: dto.depth + 1,
          secretPath: dto.secretPath
        });

        // add the imported secrets to the current folder secrets
        content = { ...importedSecrets, ...content };
      }
    }

    return content;
  };

  const syncIntegrations = async (
    dto: TGetSecrets & { isManual?: boolean; actorId?: string; deDupeQueue?: Record<string, boolean> }
  ) => {
    await queueService.queue(QueueName.IntegrationSync, QueueJobs.IntegrationSync, dto, {
      attempts: 5,
      delay: 1000,
      backoff: {
        type: "exponential",
        delay: 3000
      },
      removeOnComplete: true,
      removeOnFail: true
    });
  };

  const replicateSecrets = async (dto: Omit<TSyncSecretsDTO, "deDupeQueue">) => {
    await queueService.queue(QueueName.SecretReplication, QueueJobs.SecretReplication, dto, {
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 3000
      },
      removeOnComplete: true,
      removeOnFail: true
    });
  };

  const syncSecrets = async <T extends boolean = false>({
    // seperate de-dupe queue for integration sync and replication sync
    _deDupeQueue: deDupeQueue = {},
    _depth: depth = 0,
    _deDupeReplicationQueue: deDupeReplicationQueue = {},
    ...dto
  }: TSyncSecretsDTO<T>) => {
    logger.info(
      `syncSecrets: syncing project secrets where [projectId=${dto.projectId}]  [environment=${dto.environmentSlug}] [path=${dto.secretPath}]`
    );

    const deDuplicationKey = uniqueSecretQueueKey(dto.environmentSlug, dto.secretPath);
    if (
      !dto.excludeReplication
        ? deDupeReplicationQueue?.[deDuplicationKey]
        : deDupeQueue?.[deDuplicationKey] || depth > MAX_SYNC_SECRET_DEPTH
    ) {
      return;
    }
    // eslint-disable-next-line
    deDupeQueue[deDuplicationKey] = true;
    // eslint-disable-next-line
    deDupeReplicationQueue[deDuplicationKey] = true;
    await queueService.queue(
      QueueName.SecretSync,
      QueueJobs.SecretSync,
      {
        ...dto,
        _deDupeQueue: deDupeQueue,
        _deDupeReplicationQueue: deDupeReplicationQueue,
        _depth: depth
      } as TSyncSecretsDTO,
      {
        removeOnFail: true,
        removeOnComplete: true,
        jobId: $getJobKey(dto.projectId, dto.environmentSlug, dto.secretPath),
        delay: SYNC_SECRET_DEBOUNCE_INTERVAL_MS,
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 3000
        }
      }
    );
  };
  const sendFailedIntegrationSyncEmails = async (payload: TFailedIntegrationSyncEmailsPayload) => {
    const appCfg = getConfig();
    if (!appCfg.isSmtpConfigured) return;

    await queueService.queue(QueueName.IntegrationSync, QueueJobs.SendFailedIntegrationSyncEmails, payload, {
      jobId: `send-failed-integration-sync-emails-${payload.projectId}-${payload.secretPath}-${payload.environmentSlug}`,
      delay: 1_000 * 60, // 1 minute
      removeOnFail: true,
      removeOnComplete: true
    });
  };

  queueService.start(QueueName.SecretSync, async (job) => {
    const {
      _deDupeQueue: deDupeQueue,
      _deDupeReplicationQueue: deDupeReplicationQueue,
      _depth: depth,
      secretPath,
      projectId,
      orgId,
      environmentSlug: environment,
      excludeReplication,
      actorId,
      actor
    } = job.data;

    await queueService.queue(
      QueueName.SecretWebhook,
      QueueJobs.SecWebhook,
      {
        type: WebhookEvents.SecretModified,
        payload: {
          environment,
          projectId,
          secretPath
        }
      },
      {
        jobId: `secret-webhook-${environment}-${projectId}-${secretPath}`,
        removeOnFail: { count: 5 },
        removeOnComplete: true,
        delay: 1000,
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 3000
        }
      }
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) return;
    await folderDAL.updateById(folder.id, { lastSecretModified: new Date() });

    await secretSyncQueue.queueSecretSyncsSyncSecretsByPath({ projectId, environmentSlug: environment, secretPath });

    await syncIntegrations({ secretPath, projectId, environment, deDupeQueue, isManual: false });
    if (!excludeReplication) {
      await replicateSecrets({
        _deDupeReplicationQueue: deDupeReplicationQueue,
        _depth: depth,
        projectId,
        orgId,
        secretPath,
        actorId,
        actor,
        excludeReplication,
        environmentSlug: environment
      });
    }
  });

  queueService.start(QueueName.IntegrationSync, async (job) => {
    if (job.name === QueueJobs.SendFailedIntegrationSyncEmails) {
      const appCfg = getConfig();

      const jobPayload = job.data as TFailedIntegrationSyncEmailsPayload;

      const projectMembers = await projectMembershipDAL.findAllProjectMembers(jobPayload.projectId);
      const project = await projectDAL.findById(jobPayload.projectId);

      // Only send emails to admins, and if its a manual trigger, only send it to the person who triggered it (if actor is admin as well)
      const filteredProjectMembers = projectMembers
        .filter((member) => member.roles.some((role) => role.role === ProjectMembershipRole.Admin))
        .filter((member) =>
          jobPayload.manuallyTriggeredByUserId ? member.userId === jobPayload.manuallyTriggeredByUserId : true
        );

      await smtpService.sendMail({
        recipients: filteredProjectMembers.map((member) => member.user.email!),
        template: SmtpTemplates.IntegrationSyncFailed,
        subjectLine: `Integration Sync Failed`,
        substitutions: {
          syncMessage: jobPayload.count === 1 ? jobPayload.syncMessage : undefined, // We are only displaying the sync message if its a singular integration, so we can just grab the first one in the array.
          secretPath: jobPayload.secretPath,
          environment: jobPayload.environmentName,
          count: jobPayload.count,
          projectName: project.name,
          integrationUrl: `${appCfg.SITE_URL}/projects/${project.id}/secret-manager/integrations?selectedTab=native-integrations`
        }
      });
    }

    if (job.name === QueueJobs.IntegrationSync) {
      const {
        environment,
        actorId,
        isManual,
        projectId,
        secretPath,
        depth = 1,
        deDupeQueue = {}
      } = job.data as TIntegrationSyncPayload;
      if (depth > MAX_SYNC_SECRET_DEPTH) return;

      const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
      if (!folder) {
        throw new Error("Secret path not found");
      }
      const project = await projectDAL.findById(projectId);

      // find all imports made with the given environment and secret path
      const linkSourceDto = {
        projectId,
        importEnv: folder.environment.id,
        importPath: secretPath,
        isReplication: false
      };
      const imports = await secretImportDAL.find(linkSourceDto);

      if (imports.length) {
        // keep calling sync secret for all the imports made
        const importedFolderIds = unique(imports, (i) => i.folderId).map(({ folderId }) => folderId);
        const importedFolders = await folderDAL.findSecretPathByFolderIds(projectId, importedFolderIds);
        const foldersGroupedById = groupBy(importedFolders.filter(Boolean), (i) => i?.id as string);
        logger.info(
          `getIntegrationSecrets: Syncing secret due to link change [jobId=${job.id}] [projectId=${job.data.projectId}] [environment=${environment}]  [secretPath=${job.data.secretPath}] [depth=${depth}]`
        );
        await Promise.all(
          imports
            .filter(({ folderId }) => Boolean(foldersGroupedById[folderId][0]?.path as string))
            // filter out already synced ones
            .filter(
              ({ folderId }) =>
                !deDupeQueue[
                  uniqueSecretQueueKey(
                    foldersGroupedById[folderId][0]?.environmentSlug as string,
                    foldersGroupedById[folderId][0]?.path as string
                  )
                ]
            )
            .map(({ folderId }) =>
              syncSecrets({
                projectId,
                orgId: project.orgId,
                secretPath: foldersGroupedById[folderId][0]?.path as string,
                environmentSlug: foldersGroupedById[folderId][0]?.environmentSlug as string,
                _deDupeQueue: deDupeQueue,
                _depth: depth + 1,
                excludeReplication: true
              })
            )
        );
      }
      const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(projectId);
      const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });
      let referencedFolderIds;
      if (shouldUseSecretV2Bridge) {
        const secretReferences = await secretV2BridgeDAL.findReferencedSecretReferences(
          projectId,
          folder.environment.slug,
          secretPath
        );
        referencedFolderIds = unique(secretReferences, (i) => i.folderId).map(({ folderId }) => folderId);
      } else {
        const secretReferences = await secretDAL.findReferencedSecretReferences(
          projectId,
          folder.environment.slug,
          secretPath
        );
        referencedFolderIds = unique(secretReferences, (i) => i.folderId).map(({ folderId }) => folderId);
      }
      if (referencedFolderIds.length) {
        const referencedFolders = await folderDAL.findSecretPathByFolderIds(projectId, referencedFolderIds);
        const referencedFoldersGroupedById = groupBy(referencedFolders.filter(Boolean), (i) => i?.id as string);
        logger.info(
          `getIntegrationSecrets: Syncing secret due to reference change [jobId=${job.id}] [projectId=${job.data.projectId}] [environment=${environment}]  [secretPath=${job.data.secretPath}] [depth=${depth}]`
        );
        await Promise.all(
          referencedFolderIds
            .filter((folderId) => Boolean(referencedFoldersGroupedById[folderId][0]?.path))
            // filter out already synced ones
            .filter(
              (folderId) =>
                !deDupeQueue[
                  uniqueSecretQueueKey(
                    referencedFoldersGroupedById[folderId][0]?.environmentSlug as string,
                    referencedFoldersGroupedById[folderId][0]?.path as string
                  )
                ]
            )
            .map((folderId) =>
              syncSecrets({
                projectId,
                orgId: project.orgId,
                secretPath: referencedFoldersGroupedById[folderId][0]?.path as string,
                environmentSlug: referencedFoldersGroupedById[folderId][0]?.environmentSlug as string,
                _deDupeQueue: deDupeQueue,
                _depth: depth + 1,
                excludeReplication: true
              })
            )
        );
      }

      const lock = await keyStore.acquireLock(
        [KeyStorePrefixes.SyncSecretIntegrationLock(projectId, environment, secretPath)],
        60000,
        {
          retryCount: 10,
          retryDelay: 3000,
          retryJitter: 500
        }
      );

      const integrationsFailedToSync: { integrationId: string; syncMessage?: string }[] = [];
      const lockAcquiredTime = new Date();

      // akhilmhdh: this try catch is for lock release
      try {
        const lastRunSyncIntegrationTimestamp = await keyStore.getItem(
          KeyStorePrefixes.SyncSecretIntegrationLastRunTimestamp(projectId, environment, secretPath)
        );

        // check whether the integration should wait or not
        if (lastRunSyncIntegrationTimestamp) {
          const INTEGRATION_INTERVAL = 2000;

          const timeDifferenceWithLastIntegration = getTimeDifferenceInSeconds(
            lockAcquiredTime.toISOString(),
            lastRunSyncIntegrationTimestamp
          );

          // give some time for integration to breath
          if (timeDifferenceWithLastIntegration < INTEGRATION_INTERVAL)
            await new Promise((resolve) => {
              setTimeout(resolve, INTEGRATION_INTERVAL);
            });
        }

        const integrations = await integrationDAL.findByProjectIdV2(projectId, environment); // note: returns array of integrations + integration auths in this environment
        const toBeSyncedIntegrations = integrations.filter(
          // note: sync only the integrations sourced from secretPath
          ({ secretPath: integrationSecPath, isActive }) => isActive && isSamePath(secretPath, integrationSecPath)
        );

        if (!integrations.length) return;
        logger.info(
          `getIntegrationSecrets: secret integration sync started [jobId=${job.id}] [jobId=${job.id}] [projectId=${job.data.projectId}] [environment=${environment}]  [secretPath=${job.data.secretPath}] [depth=${depth}]`
        );
        const secrets = shouldUseSecretV2Bridge
          ? await getIntegrationSecretsV2({
              environment,
              projectId,
              folderId: folder.id,
              depth: 1,
              secretPath,
              decryptor: (value) => (value ? secretManagerDecryptor({ cipherTextBlob: value }).toString() : "")
            })
          : await getIntegrationSecrets({
              environment,
              projectId,
              folderId: folder.id,
              key: botKey as string,
              depth: 1,
              secretPath
            });

        for (const integration of toBeSyncedIntegrations) {
          const integrationAuth = {
            ...integration.integrationAuth,
            createdAt: new Date(),
            updatedAt: new Date(),
            projectId: integration.projectId
          };

          const { accessToken, accessId } = await integrationAuthService.getIntegrationAccessToken(
            integrationAuth,
            shouldUseSecretV2Bridge,
            botKey
          );
          let awsAssumeRoleArn = null;
          if (shouldUseSecretV2Bridge) {
            if (integrationAuth.encryptedAwsAssumeIamRoleArn) {
              awsAssumeRoleArn = secretManagerDecryptor({
                cipherTextBlob: Buffer.from(integrationAuth.encryptedAwsAssumeIamRoleArn)
              }).toString();
            }
          } else if (
            integrationAuth.awsAssumeIamRoleArnTag &&
            integrationAuth.awsAssumeIamRoleArnIV &&
            integrationAuth.awsAssumeIamRoleArnCipherText
          ) {
            awsAssumeRoleArn = decryptSymmetric128BitHexKeyUTF8({
              ciphertext: integrationAuth.awsAssumeIamRoleArnCipherText,
              iv: integrationAuth.awsAssumeIamRoleArnIV,
              tag: integrationAuth.awsAssumeIamRoleArnTag,
              key: botKey as string
            });
          }

          const suffixedSecrets: typeof secrets = {};
          const metadata = integration.metadata as Record<string, string>;
          if (metadata) {
            Object.keys(secrets).forEach((key) => {
              const prefix = metadata?.secretPrefix || "";
              const suffix = metadata?.secretSuffix || "";
              const newKey = prefix + key + suffix;
              suffixedSecrets[newKey] = secrets[key];
            });
          }

          // akhilmhdh: this try catch is for catching integration error and saving it in db
          try {
            // akhilmhdh: this needs to changed later to be more easier to use
            // at present this is not at all extendable like to add a new parameter for just one integration need to modify multiple places
            const response = await syncIntegrationSecrets({
              createManySecretsRawFn,
              updateManySecretsRawFn,
              integrationDAL,
              integration,
              integrationAuth,
              secrets: Object.keys(suffixedSecrets).length !== 0 ? suffixedSecrets : secrets,
              accessId: accessId as string,
              awsAssumeRoleArn,
              accessToken,
              projectId,
              appendices: {
                prefix: metadata?.secretPrefix || "",
                suffix: metadata?.secretSuffix || ""
              }
            });

            await auditLogService.createAuditLog({
              projectId,
              actor: await $generateActor(actorId, isManual),
              event: {
                type: EventType.INTEGRATION_SYNCED,
                metadata: {
                  integrationId: integration.id,
                  isSynced: response?.isSynced ?? true,
                  lastSyncJobId: job?.id ?? "",
                  lastUsed: new Date(),
                  syncMessage: response?.syncMessage ?? ""
                }
              }
            });

            await integrationDAL.updateById(integration.id, {
              lastSyncJobId: job.id,
              lastUsed: new Date(),
              syncMessage: response?.syncMessage ?? "",
              isSynced: response?.isSynced ?? true
            });

            // May be undefined, if it's undefined we assume the sync was successful, hence the strict equality type check.
            if (response?.isSynced === false) {
              integrationsFailedToSync.push({
                integrationId: integration.id,
                syncMessage: response.syncMessage
              });
            }
          } catch (err) {
            logger.error(
              err,
              `Secret integration sync error [projectId=${job.data.projectId}] [environment=${environment}]  [secretPath=${job.data.secretPath}]`
            );

            const appCfg = getConfig();
            if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
              errorHistogram.record(1, {
                version: 1,
                integration: integration.integration,
                integrationId: integration.id,
                type: err instanceof AxiosError ? "AxiosError" : err?.constructor?.name || "UnknownError",
                status: err instanceof AxiosError ? err.response?.status : undefined,
                name: err instanceof Error ? err.name : undefined,
                projectId: integration.projectId
              });
            }

            const { secretKey } = (err as { secretKey: string }) || {};

            const message =
              // eslint-disable-next-line no-nested-ternary
              (err instanceof AxiosError
                ? err?.response?.data
                  ? JSON.stringify(err?.response?.data)
                  : err?.message
                : (err as Error)?.message) || "Unknown error occurred.";

            const errorLog = `${secretKey ? `[Secret Key: ${secretKey}] ` : ""}${message}`;

            await auditLogService.createAuditLog({
              projectId,
              actor: await $generateActor(actorId, isManual),
              event: {
                type: EventType.INTEGRATION_SYNCED,
                metadata: {
                  integrationId: integration.id,
                  isSynced: false,
                  lastSyncJobId: job?.id ?? "",
                  lastUsed: new Date(),
                  syncMessage: errorLog
                }
              }
            });

            // re-throw error to re-run job unless final attempt, then log and send fail email
            if (job.attemptsStarted !== job.opts.attempts) {
              throw err;
            }

            await integrationDAL.updateById(integration.id, {
              lastSyncJobId: job.id,
              syncMessage: errorLog,
              isSynced: false
            });

            integrationsFailedToSync.push({
              integrationId: integration.id,
              syncMessage: errorLog
            });
          }
        }
      } finally {
        await lock.release();
        if (integrationsFailedToSync.length) {
          await sendFailedIntegrationSyncEmails({
            count: integrationsFailedToSync.length,
            environmentName: folder.environment.name,
            environmentSlug: environment,
            ...(isManual &&
              actorId && {
                manuallyTriggeredByUserId: actorId
              }),
            projectId,
            secretPath,
            syncMessage: integrationsFailedToSync[0].syncMessage
          });
        }
      }

      await keyStore.setItemWithExpiry(
        KeyStorePrefixes.SyncSecretIntegrationLastRunTimestamp(projectId, environment, secretPath),
        KeyStoreTtls.SetSyncSecretIntegrationLastRunTimestampInSeconds,
        lockAcquiredTime.toISOString()
      );
      logger.info("Secret integration sync ended: %s", job.id);
    }
  });

  queueService.start(QueueName.SecretReminder, async ({ data }) => {
    logger.info(`secretReminderQueue.process: [secretDocument=${data.secretId}]`);

    const { projectId } = data;

    const organization = await orgDAL.findOrgByProjectId(projectId);
    const project = await projectDAL.findById(projectId);
    const secret = await secretV2BridgeDAL.findById(data.secretId);
    const [folder] = await folderDAL.findSecretPathByFolderIds(project.id, [secret.folderId]);

    const recipients = await secretReminderRecipientsDAL.findUsersBySecretId(data.secretId);

    if (!organization) {
      logger.info(`secretReminderQueue.process: [secretDocument=${data.secretId}] no organization found`);
      return;
    }

    if (!project) {
      logger.info(`secretReminderQueue.process: [secretDocument=${data.secretId}] no project found`);
      return;
    }

    const projectMembers = await projectMembershipDAL.findAllProjectMembers(projectId);

    if (!projectMembers || !projectMembers.length) {
      logger.info(`secretReminderQueue.process: [secretDocument=${data.secretId}] no project members found`);
      return;
    }

    const selectedRecipients = recipients?.length
      ? recipients.map((r) => r.email as string)
      : projectMembers.map((m) => m.user.email as string);

    await smtpService.sendMail({
      template: SmtpTemplates.SecretReminder,
      subjectLine: "Infisical secret reminder",
      recipients: selectedRecipients,
      substitutions: {
        reminderNote: data.note, // May not be present.
        projectName: project.name,
        organizationName: organization.name
      }
    });

    await queueService.queue(QueueName.SecretWebhook, QueueJobs.SecWebhook, {
      type: WebhookEvents.SecretReminderExpired,
      payload: {
        projectName: project.name,
        projectId: project.id,
        secretPath: folder?.path,
        environment: folder?.environmentSlug || "",
        reminderNote: data.note,
        secretName: secret?.key,
        secretId: data.secretId
      }
    });
  });

  const startSecretV2Migration = async (projectId: string) => {
    await queueService.queue(
      QueueName.ProjectV3Migration,
      QueueJobs.ProjectV3Migration,
      { projectId },
      {
        removeOnComplete: true,
        removeOnFail: true
      }
    );
  };

  queueService.start(QueueName.ProjectV3Migration, async (job) => {
    const { projectId } = job.data;
    const {
      botKey,
      shouldUseSecretV2Bridge: isProjectUpgradedToV3,
      project,
      bot
    } = await projectBotService.getBotKey(projectId);
    if (isProjectUpgradedToV3 || project.upgradeStatus === ProjectUpgradeStatus.InProgress) {
      return;
    }

    if (!botKey) throw new NotFoundError({ message: `Project bot not found for project ${projectId}` });
    await projectDAL.updateById(projectId, { upgradeStatus: ProjectUpgradeStatus.InProgress });

    const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
      projectId,
      type: KmsDataKey.SecretManager
    });

    const folders = await folderDAL.findByProjectId(projectId);
    // except secret version and snapshot migrate rest of everything first in a transaction
    await secretDAL.transaction(async (tx) => {
      // if project v1 create the project ghost user
      if (project.version === ProjectVersion.V1) {
        const ghostUser = await orgService.addGhostUser(project.orgId, tx);
        const projectMembership = await projectMembershipDAL.create(
          {
            userId: ghostUser.user.id,
            projectId: project.id
          },
          tx
        );
        await projectUserMembershipRoleDAL.create(
          { projectMembershipId: projectMembership.id, role: ProjectMembershipRole.Admin },
          tx
        );

        const { key: encryptedProjectKey, iv: encryptedProjectKeyIv } = createProjectKey({
          publicKey: ghostUser.keys.publicKey,
          privateKey: ghostUser.keys.plainPrivateKey,
          plainProjectKey: botKey
        });

        // 4. Save the project key for the ghost user.
        await projectKeyDAL.create(
          {
            projectId: project.id,
            receiverId: ghostUser.user.id,
            encryptedKey: encryptedProjectKey,
            nonce: encryptedProjectKeyIv,
            senderId: ghostUser.user.id
          },
          tx
        );
        const { iv, tag, ciphertext, encoding, algorithm } = infisicalSymmetricEncypt(ghostUser.keys.plainPrivateKey);
        await projectBotDAL.updateById(
          bot.id,
          {
            tag,
            iv,
            encryptedProjectKey,
            encryptedProjectKeyNonce: encryptedProjectKeyIv,
            encryptedPrivateKey: ciphertext,
            isActive: true,
            publicKey: ghostUser.keys.publicKey,
            senderId: ghostUser.user.id,
            algorithm,
            keyEncoding: encoding
          },
          tx
        );
      }

      for (const folder of folders) {
        const folderId = folder.id;
        /*
         * Secrets Migration
         * */
        // eslint-disable-next-line no-await-in-loop
        const projectV1Secrets = await secretDAL.find({ folderId }, { tx });
        if (projectV1Secrets.length) {
          const secretReferences: {
            secretId: string;
            references: { environment: string; secretPath: string; secretKey: string }[];
          }[] = [];
          await secretV2BridgeDAL.batchInsert(
            projectV1Secrets.map((el) => {
              const key = decryptSymmetric128BitHexKeyUTF8({
                ciphertext: el.secretKeyCiphertext,
                iv: el.secretKeyIV,
                tag: el.secretKeyTag,
                key: botKey
              });
              const value = decryptSymmetric128BitHexKeyUTF8({
                ciphertext: el.secretValueCiphertext,
                iv: el.secretValueIV,
                tag: el.secretValueTag,
                key: botKey
              });
              const comment =
                el.secretCommentCiphertext && el.secretCommentTag && el.secretCommentIV
                  ? decryptSymmetric128BitHexKeyUTF8({
                      ciphertext: el.secretCommentCiphertext,
                      iv: el.secretCommentIV,
                      tag: el.secretCommentTag,
                      key: botKey
                    })
                  : "";
              const encryptedValue = secretManagerEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob;
              // create references
              const references = getAllSecretReferences(value).nestedReferences;
              secretReferences.push({ secretId: el.id, references });

              const encryptedComment = comment
                ? secretManagerEncryptor({ plainText: Buffer.from(comment) }).cipherTextBlob
                : null;
              return {
                id: el.id,
                createdAt: el.createdAt,
                updatedAt: el.updatedAt,
                skipMultilineEncoding: el.skipMultilineEncoding,
                encryptedComment,
                encryptedValue,
                key,
                version: el.version,
                type: el.type,
                userId: el.userId,
                folderId: el.folderId,
                metadata: el.metadata,
                reminderNote: el.secretReminderNote,
                reminderRepeatDays: el.secretReminderRepeatDays
              };
            }),
            tx
          );
          await secretV2BridgeDAL.upsertSecretReferences(secretReferences, tx);
        }

        const SNAPSHOT_BATCH_SIZE = 10;
        const snapshots = await snapshotDAL.findNSecretV1SnapshotByFolderId(folderId, SNAPSHOT_BATCH_SIZE, tx);
        const projectV3SecretVersionsGroupById: Record<string, TSecretVersionsV2> = {};
        const projectV3SecretVersionTags: { secret_versions_v2Id: string; secret_tagsId: string }[] = [];
        const projectV3SnapshotSecrets: Omit<TSecretSnapshotSecretsV2, "id">[] = [];
        snapshots.forEach(({ secretVersions = [], ...snapshot }) => {
          secretVersions.forEach((el) => {
            projectV3SnapshotSecrets.push({
              secretVersionId: el.id,
              snapshotId: snapshot.id,
              createdAt: snapshot.createdAt,
              updatedAt: snapshot.updatedAt,
              envId: el.snapshotEnvId
            });
            if (projectV3SecretVersionsGroupById[el.id]) return;

            const key = decryptSymmetric128BitHexKeyUTF8({
              ciphertext: el.secretKeyCiphertext,
              iv: el.secretKeyIV,
              tag: el.secretKeyTag,
              key: botKey
            });
            const value = decryptSymmetric128BitHexKeyUTF8({
              ciphertext: el.secretValueCiphertext,
              iv: el.secretValueIV,
              tag: el.secretValueTag,
              key: botKey
            });
            const comment =
              el.secretCommentCiphertext && el.secretCommentTag && el.secretCommentIV
                ? decryptSymmetric128BitHexKeyUTF8({
                    ciphertext: el.secretCommentCiphertext,
                    iv: el.secretCommentIV,
                    tag: el.secretCommentTag,
                    key: botKey
                  })
                : "";
            const encryptedValue = secretManagerEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob;

            const encryptedComment = comment
              ? secretManagerEncryptor({ plainText: Buffer.from(comment) }).cipherTextBlob
              : null;
            projectV3SecretVersionsGroupById[el.id] = {
              id: el.id,
              createdAt: el.createdAt,
              updatedAt: el.updatedAt,
              skipMultilineEncoding: el.skipMultilineEncoding,
              encryptedComment,
              encryptedValue,
              key,
              version: el.version,
              type: el.type,
              userId: el.userId,
              folderId: el.folderId,
              metadata: el.metadata,
              reminderNote: el.secretReminderNote,
              reminderRepeatDays: el.secretReminderRepeatDays,
              secretId: el.secretId,
              envId: el.envId
            };
            el.tags.forEach(({ secretTagId }) => {
              projectV3SecretVersionTags.push({ secret_tagsId: secretTagId, secret_versions_v2Id: el.id });
            });
          });
        });
        // this is corner case in which some times the snapshot may not have the secret version of an existing secret
        // example: on some integration it will pull values from 3rd party on integration but snapshot is not taken
        // Thus it won't have secret version
        const latestSecretVersionByFolder = await secretVersionDAL.findLatestVersionMany(
          folderId,
          projectV1Secrets.map((el) => el.id),
          tx
        );
        Object.values(latestSecretVersionByFolder).forEach((el) => {
          if (projectV3SecretVersionsGroupById[el.id]) return;
          const key = decryptSymmetric128BitHexKeyUTF8({
            ciphertext: el.secretKeyCiphertext,
            iv: el.secretKeyIV,
            tag: el.secretKeyTag,
            key: botKey
          });
          const value = decryptSymmetric128BitHexKeyUTF8({
            ciphertext: el.secretValueCiphertext,
            iv: el.secretValueIV,
            tag: el.secretValueTag,
            key: botKey
          });
          const comment =
            el.secretCommentCiphertext && el.secretCommentTag && el.secretCommentIV
              ? decryptSymmetric128BitHexKeyUTF8({
                  ciphertext: el.secretCommentCiphertext,
                  iv: el.secretCommentIV,
                  tag: el.secretCommentTag,
                  key: botKey
                })
              : "";
          const encryptedValue = secretManagerEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob;

          const encryptedComment = comment
            ? secretManagerEncryptor({ plainText: Buffer.from(comment) }).cipherTextBlob
            : null;
          projectV3SecretVersionsGroupById[el.id] = {
            id: el.id,
            createdAt: el.createdAt,
            updatedAt: el.updatedAt,
            skipMultilineEncoding: el.skipMultilineEncoding,
            encryptedComment,
            encryptedValue,
            key,
            version: el.version,
            type: el.type,
            userId: el.userId,
            folderId: el.folderId,
            metadata: el.metadata,
            reminderNote: el.secretReminderNote,
            reminderRepeatDays: el.secretReminderRepeatDays,
            secretId: el.secretId,
            envId: el.envId
          };
        });

        const projectV3SecretVersions = Object.values(projectV3SecretVersionsGroupById);
        if (projectV3SecretVersions.length) {
          await secretVersionV2BridgeDAL.batchInsert(projectV3SecretVersions, tx);
        }
        if (projectV3SecretVersionTags.length) {
          await secretVersionTagV2BridgeDAL.batchInsert(projectV3SecretVersionTags, tx);
        }

        if (projectV3SnapshotSecrets.length) {
          await snapshotSecretV2BridgeDAL.batchInsert(projectV3SnapshotSecrets, tx);
        }
        await snapshotDAL.deleteSnapshotsAboveLimit(folderId, SNAPSHOT_BATCH_SIZE, tx);
      }
      /*
       * Secret Tag Migration
       * */
      // eslint-disable-next-line no-await-in-loop
      const projectV1SecretTags = await secretTagDAL.findSecretTagsByProjectId(projectId, tx);
      if (projectV1SecretTags.length) {
        await secretTagDAL.saveTagsToSecretV2(
          projectV1SecretTags.map((el) => ({
            secrets_v2Id: el.secretsId,
            secret_tagsId: el.secret_tagsId
          })),
          tx
        );
      }

      /*
       * Integration Auth Migration
       * Saving the new encrypted colum
       * */
      // eslint-disable-next-line no-await-in-loop
      const projectV1IntegrationAuths = await integrationAuthDAL.find({ projectId }, { tx });
      await integrationAuthDAL.upsert(
        projectV1IntegrationAuths.map((el) => {
          const accessToken =
            el.accessIV && el.accessTag && el.accessCiphertext
              ? decryptSymmetric128BitHexKeyUTF8({
                  ciphertext: el.accessCiphertext,
                  iv: el.accessIV,
                  tag: el.accessTag,
                  key: botKey
                })
              : undefined;
          const accessId =
            el.accessIdIV && el.accessIdTag && el.accessIdCiphertext
              ? decryptSymmetric128BitHexKeyUTF8({
                  ciphertext: el.accessIdCiphertext,
                  iv: el.accessIdIV,
                  tag: el.accessIdTag,
                  key: botKey
                })
              : undefined;
          const refreshToken =
            el.refreshIV && el.refreshTag && el.refreshCiphertext
              ? decryptSymmetric128BitHexKeyUTF8({
                  ciphertext: el.refreshCiphertext,
                  iv: el.refreshIV,
                  tag: el.refreshTag,
                  key: botKey
                })
              : undefined;
          const awsAssumeRoleArn =
            el.awsAssumeIamRoleArnCipherText && el.awsAssumeIamRoleArnIV && el.awsAssumeIamRoleArnTag
              ? decryptSymmetric128BitHexKeyUTF8({
                  ciphertext: el.awsAssumeIamRoleArnCipherText,
                  iv: el.awsAssumeIamRoleArnIV,
                  tag: el.awsAssumeIamRoleArnTag,
                  key: botKey
                })
              : undefined;

          const encryptedAccess = accessToken
            ? secretManagerEncryptor({ plainText: Buffer.from(accessToken) }).cipherTextBlob
            : null;
          const encryptedAccessId = accessId
            ? secretManagerEncryptor({ plainText: Buffer.from(accessId) }).cipherTextBlob
            : null;
          const encryptedRefresh = refreshToken
            ? secretManagerEncryptor({ plainText: Buffer.from(refreshToken) }).cipherTextBlob
            : null;
          const encryptedAwsAssumeIamRoleArn = awsAssumeRoleArn
            ? secretManagerEncryptor({ plainText: Buffer.from(awsAssumeRoleArn) }).cipherTextBlob
            : null;
          return {
            ...el,
            encryptedAccess,
            encryptedRefresh,
            encryptedAccessId,
            encryptedAwsAssumeIamRoleArn
          };
        }),
        "id",
        tx
      );
      /*
       * Secret Rotation Secret Migration
       * Saving the new encrypted colum
       * */
      const projectV1SecretRotations = await secretRotationDAL.find({ projectId }, tx);
      await secretRotationDAL.secretOutputV2InsertMany(
        projectV1SecretRotations.flatMap((el) =>
          el.outputs.map((output) => ({ rotationId: el.id, key: output.key, secretId: output.secret.id }))
        ),
        tx
      );

      /*
       * approvals: we will delete all approvals this is because some secret versions may not be added yet
       * Thus doesn't make sense for rest to be there
       * */
      await secretApprovalRequestDAL.deleteByProjectId(projectId, tx);
      await projectDAL.updateById(projectId, { upgradeStatus: null, version: ProjectVersion.V3 }, tx);
    });
  });

  // eslint-disable-next-line
  queueService.listen(QueueName.ProjectV3Migration, "failed", async (job, err) => {
    if (job?.data) {
      const { projectId } = job.data;
      await projectDAL.updateById(projectId, { upgradeStatus: ProjectUpgradeStatus.Failed });
      logger.error(err, `Failed to migrate project to v3: ${projectId}`);
    }
  });

  queueService.listen(QueueName.IntegrationSync, "failed", (job, err) => {
    logger.error(err, "Failed to sync integration %s", job?.id);
  });

  queueService.start(QueueName.SecretWebhook, async (job) => {
    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: job.data.payload.projectId
    });

    await fnTriggerWebhook({
      projectId: job.data.payload.projectId,
      environment: job.data.payload.environment,
      secretPath: job.data.payload.secretPath || "/",
      projectEnvDAL,
      projectDAL,
      webhookDAL,
      event: job.data,
      auditLogService,
      secretManagerDecryptor: (value) => secretManagerDecryptor({ cipherTextBlob: value }).toString()
    });
  });

  return {
    // depth is internal only field thus no need to make it available outside
    syncSecrets,
    startSecretV2Migration,
    syncIntegrations,
    addSecretReminder,
    removeSecretReminder,
    handleSecretReminder,
    replicateSecrets
  };
};
