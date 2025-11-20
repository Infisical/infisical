import opentelemetry from "@opentelemetry/api";
import { AxiosError } from "axios";
import { Job } from "bullmq";

import { ProjectMembershipRole, SecretType } from "@app/db/schemas";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { triggerWorkflowIntegrationNotification } from "@app/lib/workflow-integrations/trigger-notification";
import { TriggerFeature } from "@app/lib/workflow-integrations/types";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { SecretNameSchema } from "@app/server/lib/schemas";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotDALFactory } from "@app/services/project-bot/project-bot-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { TResourceMetadataDALFactory } from "@app/services/resource-metadata/resource-metadata-dal";
import { TSecretDALFactory } from "@app/services/secret/secret-dal";
import { createManySecretsRawFnFactory, updateManySecretsRawFnFactory } from "@app/services/secret/secret-fns";
import { TSecretVersionDALFactory } from "@app/services/secret/secret-version-dal";
import { TSecretVersionTagDALFactory } from "@app/services/secret/secret-version-tag-dal";
import { TSecretBlindIndexDALFactory } from "@app/services/secret-blind-index/secret-blind-index-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretImportDALFactory } from "@app/services/secret-import/secret-import-dal";
import { fnSecretsV2FromImports } from "@app/services/secret-import/secret-import-fns";
import { TSecretSyncDALFactory } from "@app/services/secret-sync/secret-sync-dal";
import {
  SecretSync,
  SecretSyncImportBehavior,
  SecretSyncInitialSyncBehavior
} from "@app/services/secret-sync/secret-sync-enums";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { enterpriseSyncCheck, parseSyncErrorMessage, SecretSyncFns } from "@app/services/secret-sync/secret-sync-fns";
import { SECRET_SYNC_NAME_MAP } from "@app/services/secret-sync/secret-sync-maps";
import {
  SecretSyncAction,
  SecretSyncStatus,
  TQueueSecretSyncImportSecretsByIdDTO,
  TQueueSecretSyncRemoveSecretsByIdDTO,
  TQueueSecretSyncsByPathDTO,
  TQueueSecretSyncSyncSecretsByIdDTO,
  TQueueSendSecretSyncActionFailedNotificationsDTO,
  TSecretMap,
  TSecretSyncImportSecretsDTO,
  TSecretSyncRaw,
  TSecretSyncRemoveSecretsDTO,
  TSecretSyncSyncSecretsDTO,
  TSecretSyncWithCredentials,
  TSendSecretSyncFailedNotificationsJobDTO
} from "@app/services/secret-sync/secret-sync-types";
import { TSecretTagDALFactory } from "@app/services/secret-tag/secret-tag-dal";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";
import { expandSecretReferencesFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-fns";
import { TSecretVersionV2DALFactory } from "@app/services/secret-v2-bridge/secret-version-dal";
import { TSecretVersionV2TagDALFactory } from "@app/services/secret-v2-bridge/secret-version-tag-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";

import { TAppConnectionDALFactory } from "../app-connection/app-connection-dal";
import { TFolderCommitServiceFactory } from "../folder-commit/folder-commit-service";
import { TMicrosoftTeamsServiceFactory } from "../microsoft-teams/microsoft-teams-service";
import { TProjectMicrosoftTeamsConfigDALFactory } from "../microsoft-teams/project-microsoft-teams-config-dal";
import { TNotificationServiceFactory } from "../notification/notification-service";
import { NotificationType } from "../notification/notification-types";
import { TProjectSlackConfigDALFactory } from "../slack/project-slack-config-dal";

export type TSecretSyncQueueFactory = ReturnType<typeof secretSyncQueueFactory>;

type TSecretSyncQueueFactoryDep = {
  queueService: Pick<TQueueServiceFactory, "queue" | "start">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update" | "updateById">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "setItemWithExpiry" | "getItem">;
  folderDAL: TSecretFolderDALFactory;
  secretV2BridgeDAL: Pick<
    TSecretV2BridgeDALFactory,
    | "findByFolderId"
    | "find"
    | "insertMany"
    | "upsertSecretReferences"
    | "findBySecretKeys"
    | "bulkUpdate"
    | "deleteMany"
    | "invalidateSecretCacheByProjectId"
  >;
  secretImportDAL: Pick<TSecretImportDALFactory, "find" | "findByFolderIds" | "findByIds">;
  secretSyncDAL: Pick<TSecretSyncDALFactory, "findById" | "find" | "updateById" | "deleteById" | "update">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findAllProjectMembers">;
  projectDAL: TProjectDALFactory;
  smtpService: Pick<TSmtpService, "sendMail">;
  projectBotDAL: TProjectBotDALFactory;
  secretDAL: TSecretDALFactory;
  secretVersionDAL: TSecretVersionDALFactory;
  secretBlindIndexDAL: TSecretBlindIndexDALFactory;
  secretTagDAL: TSecretTagDALFactory;
  secretVersionTagDAL: TSecretVersionTagDALFactory;
  secretVersionV2BridgeDAL: Pick<TSecretVersionV2DALFactory, "insertMany" | "findLatestVersionMany">;
  secretVersionTagV2BridgeDAL: Pick<TSecretVersionV2TagDALFactory, "insertMany">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany" | "delete">;
  folderCommitService: Pick<TFolderCommitServiceFactory, "createCommit">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  projectSlackConfigDAL: Pick<TProjectSlackConfigDALFactory, "getIntegrationDetailsByProject">;
  projectMicrosoftTeamsConfigDAL: Pick<TProjectMicrosoftTeamsConfigDALFactory, "getIntegrationDetailsByProject">;
  microsoftTeamsService: Pick<TMicrosoftTeamsServiceFactory, "sendNotification">;
};

type SecretSyncActionJob = Job<
  TQueueSecretSyncSyncSecretsByIdDTO | TQueueSecretSyncImportSecretsByIdDTO | TQueueSecretSyncRemoveSecretsByIdDTO
>;

const JITTER_MS = 10 * 1000;
const REQUEUE_MS = 30 * 1000;
const REQUEUE_LIMIT = 30;
const CONNECTION_CONCURRENCY_LIMIT = 3;

const getRequeueDelay = (failureCount?: number) => {
  const jitter = Math.random() * JITTER_MS;
  if (!failureCount) return jitter;
  return REQUEUE_MS + jitter;
};

export const secretSyncQueueFactory = ({
  queueService,
  kmsService,
  appConnectionDAL,
  keyStore,
  folderDAL,
  secretV2BridgeDAL,
  secretImportDAL,
  secretSyncDAL,
  auditLogService,
  projectMembershipDAL,
  projectDAL,
  smtpService,
  projectBotDAL,
  secretDAL,
  secretVersionDAL,
  secretBlindIndexDAL,
  secretTagDAL,
  secretVersionTagDAL,
  secretVersionV2BridgeDAL,
  secretVersionTagV2BridgeDAL,
  resourceMetadataDAL,
  folderCommitService,
  licenseService,
  gatewayService,
  gatewayV2Service,
  notificationService,
  projectSlackConfigDAL,
  projectMicrosoftTeamsConfigDAL,
  microsoftTeamsService
}: TSecretSyncQueueFactoryDep) => {
  const appCfg = getConfig();

  const integrationMeter = opentelemetry.metrics.getMeter("SecretSyncs");
  const syncSecretsErrorHistogram = integrationMeter.createHistogram("secret_sync_sync_secrets_errors", {
    description: "Secret Sync - sync secrets errors",
    unit: "1"
  });
  const importSecretsErrorHistogram = integrationMeter.createHistogram("secret_sync_import_secrets_errors", {
    description: "Secret Sync - import secrets errors",
    unit: "1"
  });
  const removeSecretsErrorHistogram = integrationMeter.createHistogram("secret_sync_remove_secrets_errors", {
    description: "Secret Sync - remove secrets errors",
    unit: "1"
  });

  const $createManySecretsRawFn = createManySecretsRawFnFactory({
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

  const $updateManySecretsRawFn = updateManySecretsRawFnFactory({
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

  const $isConnectionConcurrencyLimitReached = async (connectionId: string) => {
    const concurrencyCount = await keyStore.getItem(KeyStorePrefixes.AppConnectionConcurrentJobs(connectionId));

    if (!concurrencyCount) return false;

    const count = Number.parseInt(concurrencyCount, 10);

    if (Number.isNaN(count)) return false;

    return count >= CONNECTION_CONCURRENCY_LIMIT;
  };

  const $incrementConnectionConcurrencyCount = async (connectionId: string) => {
    const concurrencyCount = await keyStore.getItem(KeyStorePrefixes.AppConnectionConcurrentJobs(connectionId));

    const currentCount = Number.parseInt(concurrencyCount || "0", 10);

    const incrementedCount = Number.isNaN(currentCount) ? 1 : currentCount + 1;

    await keyStore.setItemWithExpiry(
      KeyStorePrefixes.AppConnectionConcurrentJobs(connectionId),
      (REQUEUE_MS * REQUEUE_LIMIT) / 1000, // in seconds
      incrementedCount
    );
  };

  const $decrementConnectionConcurrencyCount = async (connectionId: string) => {
    const concurrencyCount = await keyStore.getItem(KeyStorePrefixes.AppConnectionConcurrentJobs(connectionId));

    const currentCount = Number.parseInt(concurrencyCount || "0", 10);

    const decrementedCount = Math.max(0, Number.isNaN(currentCount) ? 0 : currentCount - 1);

    await keyStore.setItemWithExpiry(
      KeyStorePrefixes.AppConnectionConcurrentJobs(connectionId),
      (REQUEUE_MS * REQUEUE_LIMIT) / 1000, // in seconds
      decrementedCount
    );
  };

  const $getInfisicalSecrets = async (
    secretSync: TSecretSyncRaw | TSecretSyncWithCredentials,
    includeImports = true
  ) => {
    const { projectId, folderId, environment, folder } = secretSync;

    if (!folderId || !environment || !folder)
      throw new SecretSyncError({
        message:
          "Invalid Secret Sync source configuration: folder no longer exists. Please update source environment and secret path.",
        shouldRetry: false
      });

    const secretMap: TSecretMap = {};

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const decryptSecretValue = (value?: Buffer | undefined | null) =>
      value ? secretManagerDecryptor({ cipherTextBlob: value }).toString() : "";

    const { expandSecretReferences } = expandSecretReferencesFactory({
      decryptSecretValue,
      secretDAL: secretV2BridgeDAL,
      folderDAL,
      projectId,
      canExpandValue: () => true
    });

    const secrets = await secretV2BridgeDAL.findByFolderId({ folderId });

    await Promise.allSettled(
      secrets.map(async (secret) => {
        const secretKey = secret.key;
        const secretValue = decryptSecretValue(secret.encryptedValue);
        const expandedSecretValue = await expandSecretReferences({
          environment: environment.slug,
          secretPath: folder.path,
          skipMultilineEncoding: secret.skipMultilineEncoding,
          value: secretValue,
          secretKey
        });
        secretMap[secretKey] = { value: expandedSecretValue || "" };

        if (secret.encryptedComment) {
          const commentValue = decryptSecretValue(secret.encryptedComment);
          secretMap[secretKey].comment = commentValue;
        }

        secretMap[secretKey].skipMultilineEncoding = Boolean(secret.skipMultilineEncoding);
        secretMap[secretKey].secretMetadata = secret.secretMetadata;
      })
    );

    if (!includeImports) return secretMap;

    const secretImports = await secretImportDAL.find({ folderId, isReplication: false });

    if (secretImports.length) {
      const importedSecrets = await fnSecretsV2FromImports({
        decryptor: decryptSecretValue,
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
          if (!secretMap[importedSecret.key]) {
            secretMap[importedSecret.key] = {
              skipMultilineEncoding: importedSecret.skipMultilineEncoding,
              comment: importedSecret.secretComment,
              value: importedSecret.secretValue || "",
              secretMetadata: importedSecret.secretMetadata
            };
          }
        }
      }
    }

    return secretMap;
  };

  const queueSecretSyncSyncSecretsById = async (payload: TQueueSecretSyncSyncSecretsByIdDTO) =>
    queueService.queue(QueueName.AppConnectionSecretSync, QueueJobs.SecretSyncSyncSecrets, payload, {
      delay: getRequeueDelay(payload.failedToAcquireLockCount), // this is for delaying re-queued jobs if sync is locked
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 3000
      },
      removeOnComplete: true,
      removeOnFail: true
    });

  const queueSecretSyncImportSecretsById = async (payload: TQueueSecretSyncImportSecretsByIdDTO) =>
    queueService.queue(QueueName.AppConnectionSecretSync, QueueJobs.SecretSyncImportSecrets, payload, {
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true
    });

  const queueSecretSyncRemoveSecretsById = async (payload: TQueueSecretSyncRemoveSecretsByIdDTO) =>
    queueService.queue(QueueName.AppConnectionSecretSync, QueueJobs.SecretSyncRemoveSecrets, payload, {
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true
    });

  const $queueSendSecretSyncFailedNotifications = async (payload: TQueueSendSecretSyncActionFailedNotificationsDTO) => {
    if (!appCfg.isSmtpConfigured) return;

    await queueService.queue(
      QueueName.AppConnectionSecretSync,
      QueueJobs.SecretSyncSendActionFailedNotifications,
      payload,
      {
        jobId: `secret-sync-${payload.secretSync.id}-failed-notifications`,
        attempts: 5,
        delay: 1000 * 60,
        backoff: {
          type: "exponential",
          delay: 3000
        },
        removeOnFail: true,
        removeOnComplete: true
      }
    );
  };

  const $importSecrets = async (
    secretSync: TSecretSyncWithCredentials,
    importBehavior: SecretSyncImportBehavior
  ): Promise<TSecretMap> => {
    const {
      projectId,
      environment,
      folder,
      destination,
      connection: { orgId }
    } = secretSync;

    await enterpriseSyncCheck(
      licenseService,
      destination,
      orgId,
      "Failed to import secrets due to plan restriction. Upgrade plan to access enterprise secret syncs."
    );

    if (!environment || !folder)
      throw new Error(
        "Invalid Secret Sync source configuration: folder no longer exists. Please update source environment and secret path."
      );

    const importedSecrets = await SecretSyncFns.getSecrets(secretSync, {
      appConnectionDAL,
      kmsService,
      gatewayService,
      gatewayV2Service
    });

    if (!Object.keys(importedSecrets).length) return {};

    let invalidNameCount = 0;
    let errorMessage = "";

    for (const [key] of Object.entries(importedSecrets)) {
      const result = SecretNameSchema.safeParse(key);
      if (!result.success) {
        invalidNameCount += 1;
        if (errorMessage === "") errorMessage = result.error.issues[0]?.message;
      }
    }

    if (invalidNameCount > 0) {
      throw new SecretSyncError({
        message: `Found ${invalidNameCount} invalid secret name${invalidNameCount === 1 ? "" : "s"}. ${errorMessage}`,
        shouldRetry: false
      });
    }

    const importedSecretMap: TSecretMap = {};

    const secretMap = await $getInfisicalSecrets(secretSync, false);

    const secretsToCreate: Parameters<typeof $createManySecretsRawFn>[0]["secrets"] = [];
    const secretsToUpdate: Parameters<typeof $updateManySecretsRawFn>[0]["secrets"] = [];

    Object.entries(importedSecrets).forEach(([key, secretData]) => {
      const { value, comment = "", skipMultilineEncoding } = secretData;

      const secret = {
        secretName: key,
        secretValue: value,
        type: SecretType.Shared,
        secretComment: comment,
        skipMultilineEncoding: skipMultilineEncoding ?? undefined
      };

      if (Object.hasOwn(secretMap, key)) {
        // Only update secrets if the source value is not empty
        if (value && value !== secretMap[key].value) {
          secretsToUpdate.push(secret);
          if (importBehavior === SecretSyncImportBehavior.PrioritizeDestination) importedSecretMap[key] = secretData;
        }
      } else {
        secretsToCreate.push(secret);
        importedSecretMap[key] = secretData;
      }
    });

    if (secretsToCreate.length) {
      await $createManySecretsRawFn({
        projectId,
        path: folder.path,
        environment: environment.slug,
        secrets: secretsToCreate
      });
    }

    if (importBehavior === SecretSyncImportBehavior.PrioritizeDestination && secretsToUpdate.length) {
      await $updateManySecretsRawFn({
        projectId,
        path: folder.path,
        environment: environment.slug,
        secrets: secretsToUpdate
      });
    }

    if (secretsToUpdate.length || secretsToCreate.length)
      await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId);

    return importedSecretMap;
  };

  const $handleSyncSecretsJob = async (job: TSecretSyncSyncSecretsDTO, secretSync: TSecretSyncRaw) => {
    const {
      data: { syncId, auditLogInfo }
    } = job;

    await enterpriseSyncCheck(
      licenseService,
      secretSync.destination as SecretSync,
      secretSync.connection.orgId,
      "Failed to sync secrets due to plan restriction. Upgrade plan to access enterprise secret syncs."
    );

    await secretSyncDAL.updateById(syncId, {
      syncStatus: SecretSyncStatus.Running
    });

    logger.info(
      `SecretSync Sync [syncId=${secretSync.id}] [destination=${secretSync.destination}] [projectId=${secretSync.projectId}] [folderId=${secretSync.folderId}] [connectionId=${secretSync.connectionId}]`
    );

    let isSynced = false;
    let syncMessage: string | null = null;
    let isFinalAttempt = job.attemptsStarted === job.opts.attempts;

    try {
      const {
        connection: { orgId, encryptedCredentials, projectId }
      } = secretSync;

      const credentials = await decryptAppConnectionCredentials({
        orgId,
        encryptedCredentials,
        kmsService,
        projectId
      });

      const secretSyncWithCredentials = {
        ...secretSync,
        connection: {
          ...secretSync.connection,
          credentials
        }
      } as TSecretSyncWithCredentials;

      const {
        lastSyncedAt,
        syncOptions: { initialSyncBehavior }
      } = secretSyncWithCredentials;

      const secretMap = await $getInfisicalSecrets(secretSync);

      if (!lastSyncedAt && initialSyncBehavior !== SecretSyncInitialSyncBehavior.OverwriteDestination) {
        const importedSecretMap = await $importSecrets(
          secretSyncWithCredentials,
          initialSyncBehavior === SecretSyncInitialSyncBehavior.ImportPrioritizeSource
            ? SecretSyncImportBehavior.PrioritizeSource
            : SecretSyncImportBehavior.PrioritizeDestination
        );

        Object.entries(importedSecretMap).forEach(([key, secretData]) => {
          secretMap[key] = secretData;
        });
      }

      await SecretSyncFns.syncSecrets(secretSyncWithCredentials, secretMap, {
        appConnectionDAL,
        kmsService,
        gatewayService,
        gatewayV2Service
      });

      isSynced = true;
    } catch (err) {
      logger.error(
        err,
        `SecretSync Sync Error [syncId=${secretSync.id}] [destination=${secretSync.destination}] [projectId=${secretSync.projectId}] [folderId=${secretSync.folderId}] [connectionId=${secretSync.connectionId}]`
      );

      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        syncSecretsErrorHistogram.record(1, {
          version: 1,
          destination: secretSync.destination,
          syncId: secretSync.id,
          projectId: secretSync.projectId,
          type: err instanceof AxiosError ? "AxiosError" : err?.constructor?.name || "UnknownError",
          status: err instanceof AxiosError ? err.response?.status : undefined,
          name: err instanceof Error ? err.name : undefined
        });
      }

      syncMessage = parseSyncErrorMessage(err);

      if (err instanceof SecretSyncError && !err.shouldRetry) {
        isFinalAttempt = true;
      } else {
        // re-throw so job fails
        throw err;
      }
    } finally {
      const ranAt = new Date();
      const syncStatus = isSynced ? SecretSyncStatus.Succeeded : SecretSyncStatus.Failed;

      await auditLogService.createAuditLog({
        projectId: secretSync.projectId,
        ...(auditLogInfo ?? {
          actor: {
            type: ActorType.PLATFORM,
            metadata: {}
          }
        }),
        event: {
          type: EventType.SECRET_SYNC_SYNC_SECRETS,
          metadata: {
            syncId: secretSync.id,
            syncOptions: secretSync.syncOptions,
            destination: secretSync.destination,
            destinationConfig: secretSync.destinationConfig,
            folderId: secretSync.folderId,
            connectionId: secretSync.connectionId,
            jobRanAt: ranAt,
            jobId: job.id!,
            syncStatus,
            syncMessage
          }
        }
      });

      if (isSynced || isFinalAttempt) {
        const updatedSecretSync = await secretSyncDAL.updateById(secretSync.id, {
          syncStatus,
          lastSyncJobId: job.id,
          lastSyncMessage: syncMessage,
          lastSyncedAt: isSynced ? ranAt : undefined
        });

        if (!isSynced) {
          await $queueSendSecretSyncFailedNotifications({
            secretSync: updatedSecretSync,
            action: SecretSyncAction.SyncSecrets,
            auditLogInfo
          });
        }
      }
    }

    logger.info("SecretSync Sync Job with ID %s Completed", job.id);
  };

  const $handleImportSecretsJob = async (job: TSecretSyncImportSecretsDTO, secretSync: TSecretSyncRaw) => {
    const {
      data: { syncId, auditLogInfo, importBehavior }
    } = job;

    await secretSyncDAL.updateById(syncId, {
      importStatus: SecretSyncStatus.Running
    });

    logger.info(
      `SecretSync Import [syncId=${secretSync.id}] [destination=${secretSync.destination}] [projectId=${secretSync.projectId}] [folderId=${secretSync.folderId}] [connectionId=${secretSync.connectionId}]`
    );

    let isSuccess = false;
    let importMessage: string | null = null;
    const isFinalAttempt = job.attemptsStarted === job.opts.attempts;

    try {
      const {
        connection: { orgId, encryptedCredentials, projectId }
      } = secretSync;

      const credentials = await decryptAppConnectionCredentials({
        orgId,
        encryptedCredentials,
        kmsService,
        projectId
      });

      await $importSecrets(
        {
          ...secretSync,
          connection: {
            ...secretSync.connection,
            credentials
          }
        } as TSecretSyncWithCredentials,
        importBehavior
      );

      isSuccess = true;
    } catch (err) {
      logger.error(
        err,
        `SecretSync Import Error [syncId=${secretSync.id}] [destination=${secretSync.destination}] [projectId=${secretSync.projectId}] [folderId=${secretSync.folderId}] [connectionId=${secretSync.connectionId}]`
      );

      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        importSecretsErrorHistogram.record(1, {
          version: 1,
          destination: secretSync.destination,
          syncId: secretSync.id,
          projectId: secretSync.projectId,
          type: err instanceof AxiosError ? "AxiosError" : err?.constructor?.name || "UnknownError",
          status: err instanceof AxiosError ? err.response?.status : undefined,
          name: err instanceof Error ? err.name : undefined
        });
      }

      importMessage = parseSyncErrorMessage(err);

      // re-throw so job fails
      throw err;
    } finally {
      const ranAt = new Date();
      const importStatus = isSuccess ? SecretSyncStatus.Succeeded : SecretSyncStatus.Failed;

      await auditLogService.createAuditLog({
        projectId: secretSync.projectId,
        ...(auditLogInfo ?? {
          actor: {
            type: ActorType.PLATFORM,
            metadata: {}
          }
        }),
        event: {
          type: EventType.SECRET_SYNC_IMPORT_SECRETS,
          metadata: {
            syncId: secretSync.id,
            syncOptions: secretSync.syncOptions,
            destination: secretSync.destination,
            destinationConfig: secretSync.destinationConfig,
            folderId: secretSync.folderId,
            connectionId: secretSync.connectionId,
            jobRanAt: ranAt,
            jobId: job.id!,
            importStatus,
            importMessage,
            importBehavior
          }
        }
      });

      if (isSuccess || isFinalAttempt) {
        const updatedSecretSync = await secretSyncDAL.updateById(secretSync.id, {
          importStatus,
          lastImportJobId: job.id,
          lastImportMessage: importMessage,
          lastImportedAt: isSuccess ? ranAt : undefined
        });

        if (!isSuccess) {
          await $queueSendSecretSyncFailedNotifications({
            secretSync: updatedSecretSync,
            action: SecretSyncAction.ImportSecrets,
            auditLogInfo
          });
        }
      }
    }

    logger.info("SecretSync Import Job with ID %s Completed", job.id);
  };

  const $handleRemoveSecretsJob = async (job: TSecretSyncRemoveSecretsDTO, secretSync: TSecretSyncRaw) => {
    const {
      data: { syncId, auditLogInfo, deleteSyncOnComplete }
    } = job;

    await enterpriseSyncCheck(
      licenseService,
      secretSync.destination as SecretSync,
      secretSync.connection.orgId,
      "Failed to remove secrets due to plan restriction. Upgrade plan to access enterprise secret syncs."
    );

    await secretSyncDAL.updateById(syncId, {
      removeStatus: SecretSyncStatus.Running
    });

    logger.info(
      `SecretSync Remove [syncId=${secretSync.id}] [destination=${secretSync.destination}] [projectId=${secretSync.projectId}] [folderId=${secretSync.folderId}] [connectionId=${secretSync.connectionId}]`
    );

    let isSuccess = false;
    let removeMessage: string | null = null;
    const isFinalAttempt = job.attemptsStarted === job.opts.attempts;

    try {
      const {
        connection: { orgId, encryptedCredentials, projectId }
      } = secretSync;

      const credentials = await decryptAppConnectionCredentials({
        orgId,
        encryptedCredentials,
        kmsService,
        projectId
      });

      const secretMap = await $getInfisicalSecrets(secretSync);

      await SecretSyncFns.removeSecrets(
        {
          ...secretSync,
          connection: {
            ...secretSync.connection,
            credentials
          }
        } as TSecretSyncWithCredentials,
        secretMap,
        {
          appConnectionDAL,
          kmsService,
          gatewayService,
          gatewayV2Service
        }
      );

      isSuccess = true;
    } catch (err) {
      logger.error(
        err,
        `SecretSync Remove Error [syncId=${secretSync.id}] [destination=${secretSync.destination}] [projectId=${secretSync.projectId}] [folderId=${secretSync.folderId}] [connectionId=${secretSync.connectionId}]`
      );

      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        removeSecretsErrorHistogram.record(1, {
          version: 1,
          destination: secretSync.destination,
          syncId: secretSync.id,
          projectId: secretSync.projectId,
          type: err instanceof AxiosError ? "AxiosError" : err?.constructor?.name || "UnknownError",
          status: err instanceof AxiosError ? err.response?.status : undefined,
          name: err instanceof Error ? err.name : undefined
        });
      }

      removeMessage = parseSyncErrorMessage(err);

      // re-throw so job fails
      throw err;
    } finally {
      const ranAt = new Date();
      const removeStatus = isSuccess ? SecretSyncStatus.Succeeded : SecretSyncStatus.Failed;

      await auditLogService.createAuditLog({
        projectId: secretSync.projectId,
        ...(auditLogInfo ?? {
          actor: {
            type: ActorType.PLATFORM,
            metadata: {}
          }
        }),
        event: {
          type: EventType.SECRET_SYNC_REMOVE_SECRETS,
          metadata: {
            syncId: secretSync.id,
            syncOptions: secretSync.syncOptions,
            destination: secretSync.destination,
            destinationConfig: secretSync.destinationConfig,
            folderId: secretSync.folderId,
            connectionId: secretSync.connectionId,
            jobRanAt: ranAt,
            jobId: job.id!,
            removeStatus,
            removeMessage
          }
        }
      });

      if (isSuccess || isFinalAttempt) {
        if (isSuccess && deleteSyncOnComplete) {
          await secretSyncDAL.deleteById(secretSync.id);
        } else {
          const updatedSecretSync = await secretSyncDAL.updateById(secretSync.id, {
            removeStatus,
            lastRemoveJobId: job.id,
            lastRemoveMessage: removeMessage,
            lastRemovedAt: isSuccess ? ranAt : undefined
          });

          if (!isSuccess) {
            await $queueSendSecretSyncFailedNotifications({
              secretSync: updatedSecretSync,
              action: SecretSyncAction.RemoveSecrets,
              auditLogInfo
            });
          }
        }
      }
    }

    logger.info("SecretSync Remove Job with ID %s Completed", job.id);
  };

  const $sendSecretSyncFailedNotifications = async (job: TSendSecretSyncFailedNotificationsJobDTO) => {
    const {
      data: { secretSync, auditLogInfo, action }
    } = job;

    const { projectId, destination, name, folder, lastSyncMessage, lastRemoveMessage, lastImportMessage, environment } =
      secretSync;

    const projectMembers = await projectMembershipDAL.findAllProjectMembers(projectId);
    const project = await projectDAL.findById(projectId);

    let projectAdmins = projectMembers.filter((member) =>
      member.roles.some((role) => role.role === ProjectMembershipRole.Admin)
    );

    const triggeredByUserId =
      auditLogInfo && auditLogInfo.actor.type === ActorType.USER && auditLogInfo.actor.metadata.userId;

    // only notify triggering user if triggered by admin
    if (triggeredByUserId && projectAdmins.map((admin) => admin.userId).includes(triggeredByUserId)) {
      projectAdmins = projectAdmins.filter((admin) => admin.userId === triggeredByUserId);
    }

    const syncDestination = SECRET_SYNC_NAME_MAP[destination as SecretSync];

    let actionLabel: string;
    let failureMessage: string | null | undefined;

    switch (action) {
      case SecretSyncAction.ImportSecrets:
        actionLabel = "Import";
        failureMessage = lastImportMessage;

        break;
      case SecretSyncAction.RemoveSecrets:
        actionLabel = "Remove";
        failureMessage = lastRemoveMessage;

        break;
      case SecretSyncAction.SyncSecrets:
      default:
        actionLabel = `Sync`;
        failureMessage = lastSyncMessage;
        break;
    }

    const baseProjectPath = `/organizations/${project.orgId}/projects/secret-management/${projectId}`;
    const overviewPath = `${baseProjectPath}/overview`;
    const syncPath = `${baseProjectPath}/integrations/secret-syncs/${destination}/${secretSync.id}`;

    const notifications = [
      triggerWorkflowIntegrationNotification({
        input: {
          notification: {
            type: TriggerFeature.SECRET_SYNC_ERROR,
            payload: {
              syncName: name,
              syncDestination,
              failureMessage: failureMessage || "An unknown error occurred",
              syncUrl: `${appCfg.SITE_URL}${syncPath}`,
              syncActionLabel: actionLabel,
              environment: environment?.name || "-",
              secretPath: folder?.path || "-",
              projectName: project.name,
              projectPath: overviewPath
            }
          },
          projectId
        },
        dependencies: {
          projectDAL,
          projectSlackConfigDAL,
          kmsService,
          microsoftTeamsService,
          projectMicrosoftTeamsConfigDAL
        }
      }),
      notificationService.createUserNotifications(
        projectAdmins.map((admin) => ({
          userId: admin.userId,
          orgId: project.orgId,
          type: NotificationType.SECRET_SYNC_FAILED,
          title: `Secret Sync Failed to ${actionLabel} Secrets`,
          body: `Your **${syncDestination}** sync **${name}** failed to complete${failureMessage ? `: \`${failureMessage}\`` : ""}`,
          link: syncPath
        }))
      ),
      smtpService.sendMail({
        recipients: projectAdmins.map((member) => member.user.email!).filter(Boolean),
        template: SmtpTemplates.SecretSyncFailed,
        subjectLine: `Secret Sync Failed to ${actionLabel} Secrets`,
        substitutions: {
          syncName: name,
          syncDestination,
          content: `Your ${syncDestination} Sync named "${name}" failed while attempting to ${action.toLowerCase()} secrets.`,
          failureMessage,
          secretPath: folder?.path,
          environment: environment?.name,
          projectName: project.name,
          syncUrl: `${appCfg.SITE_URL}${syncPath}`
        }
      })
    ];

    await Promise.allSettled(notifications);
  };

  const queueSecretSyncsSyncSecretsByPath = async ({
    secretPath,
    projectId,
    environmentSlug
  }: TQueueSecretSyncsByPathDTO) => {
    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, secretPath);

    if (!folder)
      throw new Error(
        `Could not find folder at path "${secretPath}" for environment with slug "${environmentSlug}" in project with ID "${projectId}"`
      );

    const secretSyncs = await secretSyncDAL.find({ folderId: folder.id, isAutoSyncEnabled: true });

    await secretSyncDAL.update(
      {
        $in: {
          id: secretSyncs.map((sync) => sync.id)
        }
      },
      {
        syncStatus: SecretSyncStatus.Pending
      }
    );

    await Promise.all(secretSyncs.map((secretSync) => queueSecretSyncSyncSecretsById({ syncId: secretSync.id })));
  };

  const $handleAcquireLockFailure = async (job: SecretSyncActionJob) => {
    const { syncId, auditLogInfo } = job.data;

    switch (job.name) {
      case QueueJobs.SecretSyncSyncSecrets: {
        const { failedToAcquireLockCount = 0, ...rest } = job.data as TQueueSecretSyncSyncSecretsByIdDTO;

        if (failedToAcquireLockCount < REQUEUE_LIMIT) {
          await queueSecretSyncSyncSecretsById({ ...rest, failedToAcquireLockCount: failedToAcquireLockCount + 1 });
          return;
        }

        const secretSync = await secretSyncDAL.updateById(syncId, {
          syncStatus: SecretSyncStatus.Failed,
          lastSyncMessage:
            "Failed to run job. This typically happens when a sync is already in progress. Please try again.",
          lastSyncJobId: job.id
        });

        await $queueSendSecretSyncFailedNotifications({
          secretSync,
          action: SecretSyncAction.SyncSecrets,
          auditLogInfo
        });

        break;
      }
      // Scott: the two cases below are unlikely to happen as we check the lock at the API level but including this as a fallback
      case QueueJobs.SecretSyncImportSecrets: {
        const secretSync = await secretSyncDAL.updateById(syncId, {
          importStatus: SecretSyncStatus.Failed,
          lastImportMessage:
            "Failed to run job. This typically happens when a sync is already in progress. Please try again.",
          lastImportJobId: job.id
        });

        await $queueSendSecretSyncFailedNotifications({
          secretSync,
          action: SecretSyncAction.ImportSecrets,
          auditLogInfo
        });

        break;
      }
      case QueueJobs.SecretSyncRemoveSecrets: {
        const secretSync = await secretSyncDAL.updateById(syncId, {
          removeStatus: SecretSyncStatus.Failed,
          lastRemoveMessage:
            "Failed to run job. This typically happens when a sync is already in progress. Please try again.",
          lastRemoveJobId: job.id
        });

        await $queueSendSecretSyncFailedNotifications({
          secretSync,
          action: SecretSyncAction.RemoveSecrets,
          auditLogInfo
        });

        break;
      }
      default:
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw new Error(`Unhandled Secret Sync Job ${job.name}`);
    }
  };

  queueService.start(QueueName.AppConnectionSecretSync, async (job) => {
    if (job.name === QueueJobs.SecretSyncSendActionFailedNotifications) {
      await $sendSecretSyncFailedNotifications(job as TSendSecretSyncFailedNotificationsJobDTO);
      return;
    }

    const { syncId } = job.data as
      | TQueueSecretSyncSyncSecretsByIdDTO
      | TQueueSecretSyncImportSecretsByIdDTO
      | TQueueSecretSyncRemoveSecretsByIdDTO;

    const secretSync = await secretSyncDAL.findById(syncId);

    if (!secretSync) throw new Error(`Cannot find secret sync with ID ${syncId}`);

    const { connectionId } = secretSync;

    if (job.name === QueueJobs.SecretSyncSyncSecrets) {
      const isConcurrentLimitReached = await $isConnectionConcurrencyLimitReached(connectionId);

      if (isConcurrentLimitReached) {
        logger.info(
          `SecretSync Concurrency limit reached [syncId=${syncId}] [job=${job.name}] [connectionId=${connectionId}]`
        );

        await $handleAcquireLockFailure(job as SecretSyncActionJob);

        return;
      }
    }

    let lock: Awaited<ReturnType<typeof keyStore.acquireLock>>;

    try {
      lock = await keyStore.acquireLock(
        [KeyStorePrefixes.SecretSyncLock(syncId)],
        // scott: not sure on this duration; syncs can take excessive amounts of time so we need to keep it locked,
        // but should always release below...
        5 * 60 * 1000
      );
    } catch (e) {
      logger.info(`SecretSync Failed to acquire lock [syncId=${syncId}] [job=${job.name}]`);

      await $handleAcquireLockFailure(job as SecretSyncActionJob);

      return;
    }

    try {
      switch (job.name) {
        case QueueJobs.SecretSyncSyncSecrets: {
          await $incrementConnectionConcurrencyCount(connectionId);
          await $handleSyncSecretsJob(job as TSecretSyncSyncSecretsDTO, secretSync);
          break;
        }
        case QueueJobs.SecretSyncImportSecrets:
          await $handleImportSecretsJob(job as TSecretSyncImportSecretsDTO, secretSync);
          break;
        case QueueJobs.SecretSyncRemoveSecrets:
          await $handleRemoveSecretsJob(job as TSecretSyncRemoveSecretsDTO, secretSync);
          break;
        default:
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          throw new Error(`Unhandled Secret Sync Job ${job.name}`);
      }
    } finally {
      if (job.name === QueueJobs.SecretSyncSyncSecrets) {
        await $decrementConnectionConcurrencyCount(connectionId);
      }

      await lock.release();
    }
  });

  return {
    queueSecretSyncSyncSecretsById,
    queueSecretSyncImportSecretsById,
    queueSecretSyncRemoveSecretsById,
    queueSecretSyncsSyncSecretsByPath
  };
};
