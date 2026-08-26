/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";
import { Job } from "bullmq";
import { randomUUID } from "crypto";

import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { highCardinalityMeter } from "@app/lib/telemetry/metrics";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { TPkiApplicationDALFactory } from "@app/services/pki-application/pki-application-dal";
import { hydratePkiSyncCredentials } from "@app/services/pki-sync/pki-sync-credentials-fns";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { TAppConnectionDALFactory } from "../app-connection/app-connection-dal";
import { TCertificateBodyDALFactory } from "../certificate/certificate-body-dal";
import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { TCertificateSecretDALFactory } from "../certificate/certificate-secret-dal";
import { TCertificateAuthorityCertDALFactory } from "../certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "../certificate-authority/certificate-authority-dal";
import { TCertificateSyncDALFactory } from "../certificate-sync/certificate-sync-dal";
import { CertificateSyncStatus } from "../certificate-sync/certificate-sync-enums";
import { buildCertificateMap } from "./pki-sync-certificate-map-fns";
import { TPkiSyncDALFactory } from "./pki-sync-dal";
import {
  PKI_SYNC_CONNECTION_CONCURRENCY_LIMIT,
  PKI_SYNC_CONNECTION_CONCURRENCY_TTL_S,
  PKI_SYNC_CONNECTION_LOCK_RETRY,
  PkiSyncFailureKind,
  PkiSyncStatus
} from "./pki-sync-enums";
import { PkiSyncError } from "./pki-sync-errors";
import { notifyPkiSyncFailure } from "./pki-sync-failure-notification-fns";
import {
  enterprisePkiSyncCheck,
  getPkiSyncProviderCapabilities,
  parsePkiSyncErrorMessage,
  PkiSyncFns,
  truncateSyncMessage
} from "./pki-sync-fns";
import {
  buildHealthCheckCommandFailureMessage,
  didHealthCheckFail,
  getHealthCheckCommand,
  THealthCheckCommandResult
} from "./pki-sync-health-check-command-fns";
import {
  buildPostSyncCommandFailureMessage,
  getPostSyncCommand,
  TPostSyncCommandResult
} from "./pki-sync-post-sync-command-fns";
import {
  TCertificateMap,
  TPkiSyncImportCertificatesDTO,
  TPkiSyncRaw,
  TPkiSyncRemoveCertificatesDTO,
  TPkiSyncSyncCertificatesDTO,
  TQueuePkiSyncImportCertificatesByIdDTO,
  TQueuePkiSyncRemoveCertificatesByIdDTO,
  TQueuePkiSyncSyncCertificatesByIdDTO
} from "./pki-sync-types";

export type TPkiSyncQueueFactory = ReturnType<typeof pkiSyncQueueFactory>;

type TPkiSyncQueueFactoryDep = {
  queueService: Pick<TQueueServiceFactory, "queue" | "start">;
  kmsService: Pick<
    TKmsServiceFactory,
    "createCipherPairWithDataKey" | "decryptWithKmsKey" | "generateKmsKey" | "encryptWithKmsKey"
  >;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update" | "updateById">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "incrementByAndRefreshExpiryIfUnderLimit" | "decrementByOrDelete">;
  pkiSyncDAL: Pick<
    TPkiSyncDALFactory,
    "findById" | "find" | "updateById" | "deleteById" | "update" | "findFailureNotificationRecipients"
  >;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  pkiApplicationDAL: Pick<TPkiApplicationDALFactory, "findById">;
  projectDAL: TProjectDALFactory;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  certificateDAL: TCertificateDALFactory;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne" | "create">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "findOne" | "create">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "findById">;
  certificateSyncDAL: TCertificateSyncDALFactory;
  gatewayV2Service?: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
};

type PkiSyncActionJob = Job<
  TQueuePkiSyncSyncCertificatesByIdDTO | TQueuePkiSyncImportCertificatesByIdDTO | TQueuePkiSyncRemoveCertificatesByIdDTO
>;

const JITTER_MS = 10 * 1000;
const HOST_SERIALISATION_LOCK_TTL_MS = 5 * 60 * 1000;

const REQUEUE_MS = 30 * 1000;
const REQUEUE_LIMIT = 30;

const getRequeueDelay = (failureCount?: number) => {
  const jitter = Math.random() * JITTER_MS;
  if (!failureCount) return jitter;
  return REQUEUE_MS + jitter;
};

export const pkiSyncQueueFactory = ({
  queueService,
  kmsService,
  appConnectionDAL,
  keyStore,
  pkiSyncDAL,
  auditLogService,
  notificationService,
  pkiApplicationDAL,
  projectDAL,
  licenseService,
  certificateDAL,
  certificateBodyDAL,
  certificateSecretDAL,
  certificateAuthorityDAL,
  certificateAuthorityCertDAL,
  certificateSyncDAL,
  gatewayV2Service,
  gatewayPoolService,
  telemetryService
}: TPkiSyncQueueFactoryDep) => {
  const appCfg = getConfig();

  const integrationMeter = highCardinalityMeter("PkiSyncs");
  const syncCertificatesErrorHistogram = integrationMeter.createHistogram("pki_sync_sync_certificates_errors", {
    description: "PKI Sync - sync certificates errors",
    unit: "1"
  });
  const importCertificatesErrorHistogram = integrationMeter.createHistogram("pki_sync_import_certificates_errors", {
    description: "PKI Sync - import certificates errors",
    unit: "1"
  });
  const removeCertificatesErrorHistogram = integrationMeter.createHistogram("pki_sync_remove_certificates_errors", {
    description: "PKI Sync - remove certificates errors",
    unit: "1"
  });

  const $tryAdmitConnectionConcurrency = async (connectionId: string) => {
    const count = await keyStore.incrementByAndRefreshExpiryIfUnderLimit(
      KeyStorePrefixes.AppConnectionConcurrentJobs(connectionId),
      PKI_SYNC_CONNECTION_CONCURRENCY_LIMIT,
      PKI_SYNC_CONNECTION_CONCURRENCY_TTL_S
    );

    return count !== -1;
  };

  const $releaseConnectionConcurrency = async (connectionId: string) => {
    await keyStore.decrementByOrDelete(KeyStorePrefixes.AppConnectionConcurrentJobs(connectionId));
  };

  const $certificatesForSync = (pkiSync: TPkiSyncRaw) =>
    buildCertificateMap(pkiSync, {
      certificateDAL,
      certificateBodyDAL,
      certificateSecretDAL,
      certificateAuthorityDAL,
      certificateAuthorityCertDAL,
      certificateSyncDAL,
      projectDAL,
      kmsService
    });

  const queuePkiSyncSyncCertificatesById = async (payload: TQueuePkiSyncSyncCertificatesByIdDTO) =>
    queueService.queue(QueueName.PkiSync, QueueJobs.PkiSyncSyncCertificates, payload, {
      delay: getRequeueDelay(payload.failedToAcquireLockCount), // this is for delaying re-queued jobs if sync is locked
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 3000
      },
      jobId: randomUUID(),
      removeOnComplete: true,
      removeOnFail: true
    });

  const queuePkiSyncImportCertificatesById = async (payload: TQueuePkiSyncImportCertificatesByIdDTO) =>
    queueService.queue(QueueName.PkiSync, QueueJobs.PkiSyncImportCertificates, payload, {
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 3000
      },
      jobId: randomUUID(),
      removeOnComplete: true,
      removeOnFail: true
    });

  const queuePkiSyncRemoveCertificatesById = async (payload: TQueuePkiSyncRemoveCertificatesByIdDTO) =>
    queueService.queue(QueueName.PkiSync, QueueJobs.PkiSyncRemoveCertificates, payload, {
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 3000
      },
      jobId: randomUUID(),
      removeOnComplete: true,
      removeOnFail: true
    });

  const $importCertificates = async (): Promise<TCertificateMap> => {
    throw new Error("Certificate import functionality is not implemented");
  };

  const $handleSyncCertificatesJob = async (job: TPkiSyncSyncCertificatesDTO, pkiSync: TPkiSyncRaw) => {
    const {
      data: { syncId, auditLogInfo }
    } = job;

    await enterprisePkiSyncCheck(
      licenseService,
      pkiSync.connection.orgId,
      pkiSync.destination,
      "Failed to sync certificates due to plan restriction. Upgrade plan to access enterprise PKI syncs."
    );

    await pkiSyncDAL.updateById(syncId, {
      syncStatus: PkiSyncStatus.Running
    });

    logger.info(
      `PkiSync Sync [syncId=${pkiSync.id}] [destination=${pkiSync.destination}] [projectId=${pkiSync.projectId}] [subscriberId=${pkiSync.subscriberId}] [connectionId=${pkiSync.connectionId}]`
    );

    let isSynced = false;
    let certSyncFailureCount = 0;
    let syncMessage: string | null = null;
    let postSyncCommandResult: TPostSyncCommandResult | undefined;
    let healthCheckResult: THealthCheckCommandResult | undefined;
    let isFinalAttempt = job.attemptsStarted === job.opts.attempts;

    const configuredPostSyncCommand = getPostSyncCommand(pkiSync.syncOptions);
    const configuredHealthCheckCommand = getHealthCheckCommand(pkiSync.syncOptions);

    try {
      const pkiSyncWithCredentials = await hydratePkiSyncCredentials({
        pkiSync,
        appConnectionDAL,
        projectDAL,
        kmsService
      });

      const { certificateMap, certificateMetadata } = await $certificatesForSync(pkiSync);

      const statusUpdates = Array.from(certificateMetadata.entries()).map(([, metadata]) => ({
        pkiSyncId: pkiSync.id,
        certificateId: metadata.id,
        status: CertificateSyncStatus.Running,
        message: "Syncing certificate to destination"
      }));

      if (statusUpdates.length > 0) {
        await certificateSyncDAL.bulkUpdateSyncStatus(statusUpdates);
      }

      const syncResult = await PkiSyncFns.syncCertificates(pkiSyncWithCredentials, certificateMap, {
        appConnectionDAL,
        kmsService,
        certificateDAL,
        certificateSyncDAL,
        gatewayV2Service,
        gatewayPoolService
      });

      logger.info(
        {
          syncId: pkiSync.id,
          uploaded: syncResult.uploaded || 0,
          removed: syncResult.removed || 0,
          failedRemovals: syncResult.failedRemovals || 0,
          skipped: syncResult.skipped || 0
        },
        "PKI sync operation completed with certificate cleanup"
      );

      const postSyncUpdates: Array<{
        pkiSyncId: string;
        certificateId: string;
        status: string;
        message?: string;
      }> = [];

      for (const [, metadata] of certificateMetadata.entries()) {
        postSyncUpdates.push({
          pkiSyncId: pkiSync.id,
          certificateId: metadata.id,
          status: CertificateSyncStatus.Succeeded,
          message: "Certificate successfully synced to destination"
        });
      }

      if (syncResult.details?.validationErrors) {
        for (const validationError of syncResult.details.validationErrors) {
          const metadata = certificateMetadata.get(validationError.name);
          if (metadata) {
            const updateIndex = postSyncUpdates.findIndex((u) => u.certificateId === metadata.id);
            if (updateIndex >= 0) {
              postSyncUpdates[updateIndex] = {
                pkiSyncId: pkiSync.id,
                certificateId: metadata.id,
                status: CertificateSyncStatus.Failed,
                message: `${validationError.error}`
              };
            }
          }
        }
      }

      if (syncResult.details?.failedUploads) {
        for (const failure of syncResult.details.failedUploads) {
          const metadata = certificateMetadata.get(failure.name);
          if (metadata) {
            const updateIndex = postSyncUpdates.findIndex((u) => u.certificateId === metadata.id);
            if (updateIndex >= 0) {
              postSyncUpdates[updateIndex] = {
                pkiSyncId: pkiSync.id,
                certificateId: metadata.id,
                status: CertificateSyncStatus.Failed,
                message: `Failed to sync certificate: ${failure.error}`
              };
            }
          }
        }
      }

      if (syncResult.details?.skippedCertificates) {
        for (const skip of syncResult.details.skippedCertificates) {
          const metadata = certificateMetadata.get(skip.name);
          if (metadata) {
            const updateIndex = postSyncUpdates.findIndex((u) => u.certificateId === metadata.id);
            if (updateIndex >= 0) {
              postSyncUpdates[updateIndex] = {
                pkiSyncId: pkiSync.id,
                certificateId: metadata.id,
                status: CertificateSyncStatus.Failed,
                message: `Certificate skipped: ${skip.reason}`
              };
            }
          }
        }
      }

      if (postSyncUpdates.length > 0) {
        await certificateSyncDAL.bulkUpdateSyncStatus(postSyncUpdates);
      }

      const failedCertificateCount = postSyncUpdates.filter(
        (update) => update.status === CertificateSyncStatus.Failed
      ).length;
      certSyncFailureCount = failedCertificateCount + (syncResult.failedRemovals ?? 0);

      const processedCertificateIds = new Set(Array.from(certificateMetadata.values()).map((meta) => meta.id));
      const nonTerminalStatuses = new Set<string>([
        CertificateSyncStatus.Pending,
        CertificateSyncStatus.Running,
        CertificateSyncStatus.Syncing
      ]);
      const trackedRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);
      const strandedCertificateIds = trackedRecords
        .filter(
          (record) =>
            record.certificateId &&
            !processedCertificateIds.has(record.certificateId) &&
            nonTerminalStatuses.has(record.syncStatus ?? "")
        )
        .map((record) => record.certificateId)
        .filter((id): id is string => typeof id === "string");
      if (strandedCertificateIds.length > 0) {
        const stillEligible = (await certificateDAL.findActiveCertificatesByIds(strandedCertificateIds)).filter(
          (cert) => !cert.renewedByCertificateId
        );
        if (stillEligible.length > 0) {
          await certificateSyncDAL.bulkUpdateSyncStatus(
            stillEligible.map((cert) => ({
              pkiSyncId: pkiSync.id,
              certificateId: cert.id,
              status: CertificateSyncStatus.Failed,
              message:
                "Certificate could not be prepared for syncing (its data could not be loaded, or it resolved to the same file name as another certificate)"
            }))
          );
          certSyncFailureCount += stillEligible.length;
        }
      }

      postSyncCommandResult = syncResult.postSyncCommand;
      healthCheckResult = syncResult.healthCheck;

      const reasons =
        healthCheckResult && didHealthCheckFail(healthCheckResult)
          ? [buildHealthCheckCommandFailureMessage(healthCheckResult)]
          : [
              certSyncFailureCount > 0
                ? `${certSyncFailureCount} certificate(s) failed to sync to the destination`
                : null,
              postSyncCommandResult?.status === PkiSyncStatus.Failed
                ? buildPostSyncCommandFailureMessage(postSyncCommandResult)
                : null
            ].filter(Boolean);

      if (reasons.length > 0) {
        syncMessage = truncateSyncMessage(reasons.join(". "));
      }

      isSynced = true;
    } catch (err) {
      logger.error(
        err,
        `PkiSync Sync Error [syncId=${pkiSync.id}] [destination=${pkiSync.destination}] [projectId=${pkiSync.projectId}] [subscriberId=${pkiSync.subscriberId}] [connectionId=${pkiSync.connectionId}]`
      );

      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        syncCertificatesErrorHistogram.record(1, {
          version: 1,
          destination: pkiSync.destination,
          syncId: pkiSync.id,
          projectId: pkiSync.projectId,
          type: err instanceof AxiosError ? "AxiosError" : err?.constructor?.name || "UnknownError",
          status: err instanceof AxiosError ? err.response?.status : undefined,
          name: err instanceof Error ? err.name : undefined
        });
      }

      syncMessage = parsePkiSyncErrorMessage(err);

      if (err instanceof PkiSyncError && !err.shouldRetry) {
        isFinalAttempt = true;
      } else {
        throw err;
      }
    } finally {
      const ranAt = new Date();
      const postSyncCommandFailed = postSyncCommandResult?.status === PkiSyncStatus.Failed;
      const fullySynced =
        isSynced && certSyncFailureCount === 0 && !postSyncCommandFailed && !didHealthCheckFail(healthCheckResult);
      const syncStatus = fullySynced ? PkiSyncStatus.Succeeded : PkiSyncStatus.Failed;

      await auditLogService.createAuditLog({
        projectId: pkiSync.projectId,
        ...(auditLogInfo ?? {
          actor: {
            type: ActorType.PLATFORM,
            metadata: {}
          }
        }),
        event: {
          type: EventType.PKI_SYNC_SYNC_CERTIFICATES,
          metadata: {
            syncId: pkiSync.id,
            syncMessage,
            jobId: job.id!,
            jobRanAt: ranAt,
            healthCheck: configuredHealthCheckCommand
              ? { command: configuredHealthCheckCommand, result: healthCheckResult }
              : undefined,
            postSyncCommand: configuredPostSyncCommand
              ? { command: configuredPostSyncCommand, result: postSyncCommandResult }
              : undefined
          }
        }
      });

      if (isSynced || isFinalAttempt) {
        if (!fullySynced) {
          let failureKind = PkiSyncFailureKind.Sync;
          if (didHealthCheckFail(healthCheckResult)) failureKind = PkiSyncFailureKind.HealthCheck;
          else if (postSyncCommandFailed) failureKind = PkiSyncFailureKind.PostSyncCommand;

          await notifyPkiSyncFailure(
            { pkiSync, kind: failureKind, message: syncMessage ?? "The sync did not complete." },
            { pkiSyncDAL, projectDAL, pkiApplicationDAL, notificationService }
          );
        }

        await pkiSyncDAL.updateById(pkiSync.id, {
          syncStatus,
          lastSyncJobId: job.id,
          lastSyncMessage: syncMessage,
          lastSyncedAt: fullySynced ? ranAt : undefined,
          ...(healthCheckResult
            ? {
                lastHealthCheckRanAt: ranAt,
                lastHealthCheckStatus: didHealthCheckFail(healthCheckResult)
                  ? PkiSyncStatus.Failed
                  : PkiSyncStatus.Succeeded,
                lastHealthCheckMessage: didHealthCheckFail(healthCheckResult)
                  ? truncateSyncMessage(buildHealthCheckCommandFailureMessage(healthCheckResult))
                  : null
              }
            : {})
        });

        await telemetryService.sendPostHogEvents({
          event: PostHogEventTypes.PkiSyncExecuted,
          distinctId: `platform/${pkiSync.projectId}`,
          organizationId: pkiSync.connection.orgId,
          properties: {
            orgId: pkiSync.connection.orgId,
            projectId: pkiSync.projectId,
            destination: pkiSync.destination,
            success: fullySynced
          }
        });
      }
    }
  };

  const $handleImportCertificatesJob = async (job: TPkiSyncImportCertificatesDTO, pkiSync: TPkiSyncRaw) => {
    const {
      data: { syncId, auditLogInfo }
    } = job;

    await pkiSyncDAL.updateById(syncId, {
      importStatus: PkiSyncStatus.Running
    });

    logger.info(
      `PkiSync Import [syncId=${pkiSync.id}] [destination=${pkiSync.destination}] [projectId=${pkiSync.projectId}] [subscriberId=${pkiSync.subscriberId}] [connectionId=${pkiSync.connectionId}]`
    );

    let isSuccess = false;
    let importMessage: string | null = null;
    let isFinalAttempt = job.attemptsStarted === job.opts.attempts;

    try {
      await $importCertificates();

      isSuccess = true;
    } catch (err) {
      logger.error(
        err,
        `PkiSync Import Error [syncId=${pkiSync.id}] [destination=${pkiSync.destination}] [projectId=${pkiSync.projectId}] [subscriberId=${pkiSync.subscriberId}] [connectionId=${pkiSync.connectionId}]`
      );

      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        importCertificatesErrorHistogram.record(1, {
          version: 1,
          destination: pkiSync.destination,
          syncId: pkiSync.id,
          projectId: pkiSync.projectId,
          type: err instanceof AxiosError ? "AxiosError" : err?.constructor?.name || "UnknownError",
          status: err instanceof AxiosError ? err.response?.status : undefined,
          name: err instanceof Error ? err.name : undefined
        });
      }

      importMessage = parsePkiSyncErrorMessage(err);

      if (err instanceof PkiSyncError && !err.shouldRetry) {
        isFinalAttempt = true;
      } else {
        throw err;
      }
    } finally {
      const ranAt = new Date();
      const importStatus = isSuccess ? PkiSyncStatus.Succeeded : PkiSyncStatus.Failed;

      await auditLogService.createAuditLog({
        projectId: pkiSync.projectId,
        ...(auditLogInfo ?? {
          actor: {
            type: ActorType.PLATFORM,
            metadata: {}
          }
        }),
        event: {
          type: EventType.PKI_SYNC_IMPORT_CERTIFICATES,
          metadata: {
            syncId: pkiSync.id,
            importMessage,
            jobId: job.id!,
            jobRanAt: ranAt
          }
        }
      });

      if (isSuccess || isFinalAttempt) {
        await pkiSyncDAL.updateById(pkiSync.id, {
          importStatus,
          lastImportJobId: job.id,
          lastImportMessage: importMessage,
          lastImportedAt: isSuccess ? ranAt : undefined
        });
      }
    }
  };

  const $handleRemoveCertificatesJob = async (job: TPkiSyncRemoveCertificatesDTO, pkiSync: TPkiSyncRaw) => {
    const {
      data: { syncId, auditLogInfo, deleteSyncOnComplete, certificateIds: certificateIdsToRemove }
    } = job;

    await enterprisePkiSyncCheck(
      licenseService,
      pkiSync.connection.orgId,
      pkiSync.destination,
      "Failed to remove certificates due to plan restriction. Upgrade plan to access enterprise PKI syncs."
    );

    await pkiSyncDAL.updateById(syncId, {
      removeStatus: PkiSyncStatus.Running
    });

    logger.info(
      `PkiSync Remove [syncId=${pkiSync.id}] [destination=${pkiSync.destination}] [projectId=${pkiSync.projectId}] [subscriberId=${pkiSync.subscriberId}] [connectionId=${pkiSync.connectionId}]`
    );

    let isSuccess = false;
    let removeMessage: string | null = null;
    let isFinalAttempt = job.attemptsStarted === job.opts.attempts;

    try {
      const pkiSyncWithCredentials = await hydratePkiSyncCredentials({
        pkiSync,
        appConnectionDAL,
        projectDAL,
        kmsService
      });

      const certificateMap: TCertificateMap = certificateIdsToRemove?.length
        ? Object.fromEntries(
            certificateIdsToRemove.map((certId, index) => [
              `certificate-${index}`,
              { cert: "", privateKey: "", certificateId: certId }
            ])
          )
        : (await $certificatesForSync(pkiSync)).certificateMap;

      await PkiSyncFns.removeCertificates(pkiSyncWithCredentials, Object.keys(certificateMap), {
        appConnectionDAL,
        kmsService,
        certificateSyncDAL,
        certificateDAL,
        certificateMap,
        gatewayV2Service,
        gatewayPoolService
      });

      isSuccess = true;
    } catch (err) {
      logger.error(
        err,
        `PkiSync Remove Error [syncId=${pkiSync.id}] [destination=${pkiSync.destination}] [projectId=${pkiSync.projectId}] [subscriberId=${pkiSync.subscriberId}] [connectionId=${pkiSync.connectionId}]`
      );

      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        removeCertificatesErrorHistogram.record(1, {
          version: 1,
          destination: pkiSync.destination,
          syncId: pkiSync.id,
          projectId: pkiSync.projectId,
          type: err instanceof AxiosError ? "AxiosError" : err?.constructor?.name || "UnknownError",
          status: err instanceof AxiosError ? err.response?.status : undefined,
          name: err instanceof Error ? err.name : undefined
        });
      }

      removeMessage = parsePkiSyncErrorMessage(err);

      if (err instanceof PkiSyncError && !err.shouldRetry) {
        isFinalAttempt = true;
      } else {
        throw err;
      }
    } finally {
      const ranAt = new Date();
      const removeStatus = isSuccess ? PkiSyncStatus.Succeeded : PkiSyncStatus.Failed;

      await auditLogService.createAuditLog({
        projectId: pkiSync.projectId,
        ...(auditLogInfo ?? {
          actor: {
            type: ActorType.PLATFORM,
            metadata: {}
          }
        }),
        event: {
          type: EventType.PKI_SYNC_REMOVE_CERTIFICATES,
          metadata: {
            syncId: pkiSync.id,
            removeMessage,
            jobId: job.id!,
            jobRanAt: ranAt
          }
        }
      });

      if (isSuccess || isFinalAttempt) {
        if (isSuccess && deleteSyncOnComplete) {
          await pkiSyncDAL.deleteById(pkiSync.id);
        } else {
          await pkiSyncDAL.updateById(pkiSync.id, {
            removeStatus,
            lastRemoveJobId: job.id,
            lastRemoveMessage: removeMessage,
            lastRemovedAt: isSuccess ? ranAt : undefined
          });
        }
      }
    }
  };

  const $handleAcquireLockFailure = async (job: PkiSyncActionJob) => {
    const { syncId } = job.data;

    switch (job.name) {
      case QueueJobs.PkiSyncSyncCertificates: {
        const { failedToAcquireLockCount = 0, ...rest } = job.data as TQueuePkiSyncSyncCertificatesByIdDTO;

        if (failedToAcquireLockCount < REQUEUE_LIMIT) {
          const current = await pkiSyncDAL.findById(syncId);
          if (current?.syncStatus !== PkiSyncStatus.Running) {
            await pkiSyncDAL.updateById(syncId, { syncStatus: PkiSyncStatus.Pending, lastSyncMessage: null });
          }
          await queuePkiSyncSyncCertificatesById({ ...rest, failedToAcquireLockCount: failedToAcquireLockCount + 1 });
          return;
        }

        await pkiSyncDAL.updateById(syncId, {
          syncStatus: PkiSyncStatus.Failed,
          lastSyncMessage:
            "Failed to run job. This typically happens when a sync is already in progress. Please try again.",
          lastSyncJobId: job.id
        });

        break;
      }
      case QueueJobs.PkiSyncImportCertificates: {
        await pkiSyncDAL.updateById(syncId, {
          importStatus: PkiSyncStatus.Failed,
          lastImportMessage:
            "Failed to run job. This typically happens when a sync is already in progress. Please try again.",
          lastImportJobId: job.id
        });

        break;
      }
      case QueueJobs.PkiSyncRemoveCertificates: {
        await pkiSyncDAL.updateById(syncId, {
          removeStatus: PkiSyncStatus.Failed,
          lastRemoveMessage:
            "Failed to run job. This typically happens when a sync is already in progress. Please try again.",
          lastRemoveJobId: job.id
        });

        break;
      }
      default:
        throw new Error(`Unhandled PKI Sync Job ${String(job.name)}`);
    }
  };

  queueService.start(QueueName.PkiSync, async (job) => {
    const { syncId } = job.data;

    const pkiSync = await pkiSyncDAL.findById(syncId);

    if (!pkiSync) throw new Error(`Cannot find PKI sync with ID ${syncId}`);

    const { connectionId } = pkiSync;

    const needsConnectionSlot = job.name === QueueJobs.PkiSyncSyncCertificates;

    const needsHostSerialisation =
      needsConnectionSlot && getPkiSyncProviderCapabilities(pkiSync.destination).canRunHealthCheckCommand;

    let connectionLock: Awaited<ReturnType<typeof keyStore.acquireLock>> | null = null;
    if (needsHostSerialisation) {
      connectionLock = await keyStore
        .acquireLock(
          [KeyStorePrefixes.AppConnectionCommandLock(connectionId)],
          HOST_SERIALISATION_LOCK_TTL_MS,
          PKI_SYNC_CONNECTION_LOCK_RETRY
        )
        .catch(() => null);

      if (!connectionLock) {
        await $handleAcquireLockFailure(job as PkiSyncActionJob);

        return;
      }
    }

    if (needsConnectionSlot && !(await $tryAdmitConnectionConcurrency(connectionId))) {
      await connectionLock?.release();
      await $handleAcquireLockFailure(job as PkiSyncActionJob);

      return;
    }

    let lock: Awaited<ReturnType<typeof keyStore.acquireLock>>;

    try {
      lock = await keyStore.acquireLock(
        [KeyStorePrefixes.PkiSyncLock(syncId)],
        // PKI syncs can take excessive amounts of time so we need to keep it locked
        5 * 60 * 1000
      );
    } catch (e) {
      if (needsConnectionSlot) await $releaseConnectionConcurrency(connectionId);
      await connectionLock?.release();
      await $handleAcquireLockFailure(job as PkiSyncActionJob);

      return;
    }

    try {
      switch (job.name) {
        case QueueJobs.PkiSyncSyncCertificates: {
          await $handleSyncCertificatesJob(job as TPkiSyncSyncCertificatesDTO, pkiSync);
          break;
        }
        case QueueJobs.PkiSyncImportCertificates:
          await $handleImportCertificatesJob(job as TPkiSyncImportCertificatesDTO, pkiSync);
          break;
        case QueueJobs.PkiSyncRemoveCertificates:
          await $handleRemoveCertificatesJob(job as TPkiSyncRemoveCertificatesDTO, pkiSync);
          break;
        default:
          throw new Error(`Unhandled PKI Sync Job ${String(job.name)}`);
      }
    } finally {
      if (needsConnectionSlot) await $releaseConnectionConcurrency(connectionId);

      await Promise.allSettled([lock.release(), connectionLock?.release()]);
    }
  });

  return {
    queuePkiSyncSyncCertificatesById,
    queuePkiSyncImportCertificatesById,
    queuePkiSyncRemoveCertificatesById
  };
};
