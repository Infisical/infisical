/* eslint-disable no-await-in-loop */
import opentelemetry from "@opentelemetry/api";
import * as x509 from "@peculiar/x509";
import { AxiosError } from "axios";
import { Job } from "bullmq";

import { ProjectMembershipRole } from "@app/db/schemas";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";

import { TAppConnectionDALFactory } from "../app-connection/app-connection-dal";
import { TCertificateBodyDALFactory } from "../certificate/certificate-body-dal";
import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { getCertificateCredentials } from "../certificate/certificate-fns";
import { TCertificateSecretDALFactory } from "../certificate/certificate-secret-dal";
import { CertStatus } from "../certificate/certificate-types";
import { TPkiSyncDALFactory } from "./pki-sync-dal";
import { PkiSyncAction } from "./pki-sync-enums";
import { PkiSyncError } from "./pki-sync-errors";
import { enterprisePkiSyncCheck, parsePkiSyncErrorMessage, PkiSyncFns } from "./pki-sync-fns";
import {
  PkiSyncStatus,
  TCertificateMap,
  TPkiSyncImportCertificatesDTO,
  TPkiSyncRaw,
  TPkiSyncRemoveCertificatesDTO,
  TPkiSyncSyncCertificatesDTO,
  TPkiSyncWithCredentials,
  TQueuePkiSyncImportCertificatesByIdDTO,
  TQueuePkiSyncRemoveCertificatesByIdDTO,
  TQueuePkiSyncSyncCertificatesByIdDTO,
  TQueueSendPkiSyncActionFailedNotificationsDTO,
  TSendPkiSyncFailedNotificationsJobDTO
} from "./pki-sync-types";

export type TPkiSyncQueueFactory = ReturnType<typeof pkiSyncQueueFactory>;

type TPkiSyncQueueFactoryDep = {
  queueService: Pick<TQueueServiceFactory, "queue" | "start">;
  kmsService: Pick<
    TKmsServiceFactory,
    "createCipherPairWithDataKey" | "decryptWithKmsKey" | "generateKmsKey" | "encryptWithKmsKey"
  >;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update" | "updateById">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "setItemWithExpiry" | "getItem">;
  pkiSyncDAL: Pick<TPkiSyncDALFactory, "findById" | "find" | "updateById" | "deleteById" | "update">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findAllProjectMembers">;
  projectDAL: TProjectDALFactory;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  certificateDAL: Pick<
    TCertificateDALFactory,
    "findLatestActiveCertForSubscriber" | "findAllActiveCertsForSubscriber" | "create"
  >;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne" | "create">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "findOne" | "create">;
};

type PkiSyncActionJob = Job<
  TQueuePkiSyncSyncCertificatesByIdDTO | TQueuePkiSyncImportCertificatesByIdDTO | TQueuePkiSyncRemoveCertificatesByIdDTO
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

export const pkiSyncQueueFactory = ({
  queueService,
  kmsService,
  appConnectionDAL,
  keyStore,
  pkiSyncDAL,
  auditLogService,
  projectMembershipDAL,
  projectDAL,
  licenseService,
  certificateDAL,
  certificateBodyDAL,
  certificateSecretDAL
}: TPkiSyncQueueFactoryDep) => {
  const appCfg = getConfig();

  const integrationMeter = opentelemetry.metrics.getMeter("PkiSyncs");
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

  const $createCertificatesInSubscriber = async (
    pkiSync: TPkiSyncWithCredentials,
    certificatesToCreate: Array<{
      name: string;
      certificate: string;
      privateKey?: string;
    }>
  ) => {
    const { projectId, subscriberId } = pkiSync;

    if (!subscriberId) {
      throw new Error("PKI Sync subscriber ID is required for certificate creation");
    }

    logger.info(`Creating ${certificatesToCreate.length} certificates in PKI subscriber ${subscriberId}`);

    for (const certData of certificatesToCreate) {
      try {
        // Validate certificate data
        if (!certData.certificate || certData.certificate.trim() === "") {
          logger.error(`Skipping certificate ${certData.name}: empty certificate data`);
          // eslint-disable-next-line no-continue
          continue;
        }

        // Parse certificate to extract metadata
        const cert = new x509.X509Certificate(certData.certificate);
        const { serialNumber } = cert;
        const { notBefore } = cert;
        const { notAfter } = cert;
        const commonName =
          cert.subject
            .split(",")
            .find((part) => part.trim().startsWith("CN="))
            ?.split("=")[1]
            ?.trim() || certData.name;

        // Get KMS key for encryption
        const kmsKeyId = await getProjectKmsCertificateKeyId({ projectId, projectDAL, kmsService });
        const kmsEncryptor = await kmsService.encryptWithKmsKey({
          kmsId: kmsKeyId
        });

        // Create certificate record
        const createdCert = await certificateDAL.create({
          pkiSubscriberId: subscriberId,
          status: CertStatus.ACTIVE,
          serialNumber,
          notBefore,
          notAfter,
          commonName,
          friendlyName: certData.name,
          projectId
        });

        // Create certificate body record with encrypted certificate
        const { cipherTextBlob: encryptedCertificate } = await kmsEncryptor({
          plainText: Buffer.from(certData.certificate)
        });

        await certificateBodyDAL.create({
          certId: createdCert.id,
          encryptedCertificate
        });

        // Create certificate secret record with encrypted private key (if available)
        if (certData.privateKey) {
          const { cipherTextBlob: encryptedPrivateKey } = await kmsEncryptor({
            plainText: Buffer.from(certData.privateKey)
          });

          await certificateSecretDAL.create({
            certId: createdCert.id,
            encryptedPrivateKey
          });
        }

        logger.info(`Successfully created certificate ${certData.name} with ID ${createdCert.id}`);
      } catch (error) {
        logger.error(`Failed to create certificate ${certData.name}: ${String(error)}`);
        // Continue with other certificates even if one fails
      }
    }
  };

  const $getInfisicalCertificates = async (
    pkiSync: TPkiSyncRaw | TPkiSyncWithCredentials
  ): Promise<TCertificateMap> => {
    const { projectId, subscriberId } = pkiSync;

    if (!subscriberId) {
      throw new PkiSyncError({
        message: "Invalid PKI Sync source configuration: subscriber no longer exists. Please update source subscriber.",
        shouldRetry: false
      });
    }

    const certificateMap: TCertificateMap = {};

    try {
      // Get all active certificates for the subscriber (not just the latest)
      const certificates = await certificateDAL.findAllActiveCertsForSubscriber({
        subscriberId
      });

      logger.info(
        { subscriberId, certificateCount: certificates.length },
        "Found active certificates for PKI sync subscriber"
      );

      for (const certificate of certificates) {
        try {
          // Only sync certificates issued by Infisical (not imported ones)
          // Imported certificates don't have caId and certificateTemplateId
          if (!certificate.caId) {
            logger.debug(
              { certificateId: certificate.id, subscriberId },
              "Skipping imported certificate - not syncing to destination"
            );
            // eslint-disable-next-line no-continue
            continue;
          }

          // Check if certificate is expired
          const now = new Date();
          if (certificate.notAfter < now) {
            logger.debug(
              { certificateId: certificate.id, subscriberId, expiredAt: certificate.notAfter },
              "Skipping expired certificate"
            );
            // eslint-disable-next-line no-continue
            continue;
          }

          // Get the certificate body and decrypt the certificate data
          const certBody = await certificateBodyDAL.findOne({ certId: certificate.id });

          if (certBody) {
            const certificateManagerKeyId = await getProjectKmsCertificateKeyId({
              projectId: certificate.projectId,
              projectDAL,
              kmsService
            });

            const kmsDecryptor = await kmsService.decryptWithKmsKey({
              kmsId: certificateManagerKeyId
            });

            const decryptedCert = await kmsDecryptor({
              cipherTextBlob: certBody.encryptedCertificate
            });

            const certObj = new x509.X509Certificate(decryptedCert);
            const certificatePem = certObj.toString("pem");

            // Get private key using getCertificateCredentials - handle cases where private key doesn't exist
            let certPrivateKey: string | undefined;
            try {
              const credentials = await getCertificateCredentials({
                certId: certificate.id,
                projectId: certificate.projectId,
                certificateSecretDAL,
                projectDAL,
                kmsService
              });
              certPrivateKey = credentials.certPrivateKey;
            } catch (credError) {
              logger.warn(
                { certificateId: certificate.id, subscriberId, error: credError },
                "Certificate private key not found - certificate may be imported or key was not stored"
              );
              // Continue without private key - some providers may only need the certificate
              certPrivateKey = undefined;
            }

            // Use Infisical-prefixed ID for clear identification in destination
            // Azure Key Vault doesn't allow underscores, so use hyphens and remove UUID hyphens
            const certificateName = `Infisical-${certificate.id.replace(/-/g, "")}`;

            certificateMap[certificateName] = {
              cert: certificatePem,
              privateKey: certPrivateKey || ""
            };

            logger.info(
              { certificateId: certificate.id, certificateName, subscriberId },
              "Successfully prepared certificate for PKI sync"
            );
          } else {
            logger.warn({ certificateId: certificate.id, subscriberId }, "Certificate body not found for certificate");
          }
        } catch (error) {
          logger.error(
            { error, subscriberId, certificateId: certificate.id },
            "Failed to decrypt certificate for PKI sync"
          );
          // Continue with other certificates
        }
      }
    } catch (error) {
      logger.error(
        error,
        `Failed to fetch certificate for subscriber [subscriberId=${subscriberId}] [projectId=${projectId}]`
      );
      throw new PkiSyncError({
        message: `Failed to fetch certificate for PKI subscriber: ${error instanceof Error ? error.message : String(error)}`,
        shouldRetry: true
      });
    }

    return certificateMap;
  };

  const queuePkiSyncSyncCertificatesById = async (payload: TQueuePkiSyncSyncCertificatesByIdDTO) =>
    queueService.queue(QueueName.PkiSync, QueueJobs.PkiSyncSyncCertificates, payload, {
      delay: getRequeueDelay(payload.failedToAcquireLockCount), // this is for delaying re-queued jobs if sync is locked
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 3000
      },
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
      removeOnComplete: true,
      removeOnFail: true
    });

  const $queueSendPkiSyncFailedNotifications = async (payload: TQueueSendPkiSyncActionFailedNotificationsDTO) => {
    if (!appCfg.isSmtpConfigured) return;

    await queueService.queue(QueueName.PkiSync, QueueJobs.PkiSyncSendActionFailedNotifications, payload, {
      jobId: `pki-sync-${payload.pkiSync.id}-failed-notifications`,
      attempts: 5,
      delay: 1000 * 60,
      backoff: {
        type: "exponential",
        delay: 3000
      },
      removeOnFail: true,
      removeOnComplete: true
    });
  };

  const $importCertificates = async (pkiSync: TPkiSyncWithCredentials): Promise<TCertificateMap> => {
    const {
      projectId,
      destination,
      connection: { orgId }
    } = pkiSync;

    await enterprisePkiSyncCheck(
      licenseService,
      orgId,
      destination,
      "Failed to import certificates due to plan restriction. Upgrade plan to access enterprise PKI syncs."
    );

    if (!projectId) {
      throw new Error("Invalid PKI Sync source configuration: project no longer exists.");
    }

    const importedCertificates = await PkiSyncFns.getCertificates(pkiSync, {
      appConnectionDAL,
      kmsService
    });

    if (!Object.keys(importedCertificates).length) return {};

    const importedCertificateMap: TCertificateMap = {};

    const certificateMap = await $getInfisicalCertificates(pkiSync);

    // Compare existing certificates with imported ones and determine which need to be created/updated
    const certificatesToCreate: Array<{
      name: string;
      certificate: string;
      privateKey?: string;
    }> = [];

    Object.entries(importedCertificates).forEach(([name, certificateData]) => {
      const { cert: certificate, privateKey } = certificateData;

      if (!Object.prototype.hasOwnProperty.call(certificateMap, name)) {
        // Certificate doesn't exist in Infisical, create it
        certificatesToCreate.push({
          name,
          certificate,
          privateKey
        });
        importedCertificateMap[name] = certificateData;
      } else {
        // Certificate exists - could compare and update if needed
        // For now, we'll skip updating existing certificates to avoid conflicts
        importedCertificateMap[name] = certificateData;
      }
    });

    // Create new certificates in Infisical
    if (certificatesToCreate.length > 0) {
      logger.info(`PKI Sync Import: Creating ${certificatesToCreate.length} new certificates`);
      await $createCertificatesInSubscriber(pkiSync, certificatesToCreate);
    }

    return importedCertificateMap;
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
    let syncMessage: string | null = null;
    let isFinalAttempt = job.attemptsStarted === job.opts.attempts;

    try {
      const {
        connection: { orgId, encryptedCredentials }
      } = pkiSync;

      const credentials = await decryptAppConnectionCredentials({
        orgId,
        encryptedCredentials,
        kmsService
      });

      const pkiSyncWithCredentials = {
        ...pkiSync,
        connection: {
          ...pkiSync.connection,
          credentials
        }
      } as TPkiSyncWithCredentials;

      const certificateMap = await $getInfisicalCertificates(pkiSync);

      const syncResult = await PkiSyncFns.syncCertificates(pkiSyncWithCredentials, certificateMap, {
        appConnectionDAL,
        kmsService
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
        // re-throw so job fails
        throw err;
      }
    } finally {
      const ranAt = new Date();
      const syncStatus = isSynced ? PkiSyncStatus.Succeeded : PkiSyncStatus.Failed;

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
            jobRanAt: ranAt
          }
        }
      });

      if (isSynced || isFinalAttempt) {
        const updatedPkiSync = await pkiSyncDAL.updateById(pkiSync.id, {
          syncStatus,
          lastSyncJobId: job.id,
          lastSyncMessage: syncMessage,
          lastSyncedAt: isSynced ? ranAt : undefined
        });

        if (!isSynced) {
          await $queueSendPkiSyncFailedNotifications({
            pkiSync: updatedPkiSync,
            action: PkiSyncAction.SyncCertificates,
            auditLogInfo
          });
        }
      }
    }

    logger.info("PkiSync Sync Job with ID %s Completed", job.id);
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
      const {
        connection: { orgId, encryptedCredentials }
      } = pkiSync;

      const credentials = await decryptAppConnectionCredentials({
        orgId,
        encryptedCredentials,
        kmsService
      });

      await $importCertificates({
        ...pkiSync,
        connection: {
          ...pkiSync.connection,
          credentials
        }
      } as TPkiSyncWithCredentials);

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
        // re-throw so job fails
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
        const updatedPkiSync = await pkiSyncDAL.updateById(pkiSync.id, {
          importStatus,
          lastImportJobId: job.id,
          lastImportMessage: importMessage,
          lastImportedAt: isSuccess ? ranAt : undefined
        });

        if (!isSuccess) {
          await $queueSendPkiSyncFailedNotifications({
            pkiSync: updatedPkiSync,
            action: PkiSyncAction.ImportCertificates,
            auditLogInfo
          });
        }
      }
    }

    logger.info("PkiSync Import Job with ID %s Completed", job.id);
  };

  const $handleRemoveCertificatesJob = async (job: TPkiSyncRemoveCertificatesDTO, pkiSync: TPkiSyncRaw) => {
    const {
      data: { syncId, auditLogInfo, deleteSyncOnComplete }
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
      const {
        connection: { orgId, encryptedCredentials }
      } = pkiSync;

      const credentials = await decryptAppConnectionCredentials({
        orgId,
        encryptedCredentials,
        kmsService
      });

      const certificateMap = await $getInfisicalCertificates(pkiSync);

      await PkiSyncFns.removeCertificates(
        {
          ...pkiSync,
          connection: {
            ...pkiSync.connection,
            credentials
          }
        } as TPkiSyncWithCredentials,
        Object.keys(certificateMap),
        {
          appConnectionDAL,
          kmsService
        }
      );

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
        // re-throw so job fails
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
          const updatedPkiSync = await pkiSyncDAL.updateById(pkiSync.id, {
            removeStatus,
            lastRemoveJobId: job.id,
            lastRemoveMessage: removeMessage,
            lastRemovedAt: isSuccess ? ranAt : undefined
          });

          if (!isSuccess) {
            await $queueSendPkiSyncFailedNotifications({
              pkiSync: updatedPkiSync,
              action: PkiSyncAction.RemoveCertificates,
              auditLogInfo
            });
          }
        }
      }
    }

    logger.info("PkiSync Remove Job with ID %s Completed", job.id);
  };

  const $sendPkiSyncFailedNotifications = async (job: TSendPkiSyncFailedNotificationsJobDTO) => {
    const {
      data: { pkiSync, auditLogInfo, action }
    } = job;

    const { projectId, name, lastSyncMessage, lastRemoveMessage, lastImportMessage } = pkiSync;

    const projectMembers = await projectMembershipDAL.findAllProjectMembers(projectId);
    const project = await projectDAL.findById(projectId);

    // Filter for project admins similar to secret sync
    let projectAdmins = projectMembers.filter((member) =>
      member.roles.some((role) => role.role === ProjectMembershipRole.Admin)
    );

    const triggeredByUserId = auditLogInfo?.actor?.type === ActorType.USER ? auditLogInfo.actor.metadata?.userId : null;

    if (triggeredByUserId) {
      // Don't send notification to the user who triggered the action
      projectAdmins = projectAdmins.filter((member) => member.user.id !== triggeredByUserId);
    }

    // Get appropriate error message based on action type
    let errorMessage: string | null = null;
    if (action === PkiSyncAction.SyncCertificates) {
      errorMessage = lastSyncMessage || null;
    } else if (action === PkiSyncAction.ImportCertificates) {
      errorMessage = lastImportMessage || null;
    } else {
      errorMessage = lastRemoveMessage || null;
    }

    // Log notification for now - actual email sending would require SMTP configuration
    if (projectAdmins.length > 0) {
      logger.info(
        `PKI Sync ${action} failure notification would be sent to ${projectAdmins.length} admin(s) for sync "${name}" in project "${project.name}". Error: ${errorMessage}`
      );
    } else {
      logger.info(
        `PKI Sync ${action} failure occurred for sync "${name}" in project "${project.name}" but no admins to notify. Error: ${errorMessage}`
      );
    }
  };

  const $handleAcquireLockFailure = async (job: PkiSyncActionJob) => {
    const { syncId, auditLogInfo } = job.data;

    switch (job.name) {
      case QueueJobs.PkiSyncSyncCertificates: {
        const { failedToAcquireLockCount = 0, ...rest } = job.data as TQueuePkiSyncSyncCertificatesByIdDTO;

        if (failedToAcquireLockCount < REQUEUE_LIMIT) {
          await queuePkiSyncSyncCertificatesById({ ...rest, failedToAcquireLockCount: failedToAcquireLockCount + 1 });
          return;
        }

        const pkiSync = await pkiSyncDAL.updateById(syncId, {
          syncStatus: PkiSyncStatus.Failed,
          lastSyncMessage:
            "Failed to run job. This typically happens when a sync is already in progress. Please try again.",
          lastSyncJobId: job.id
        });

        await $queueSendPkiSyncFailedNotifications({
          pkiSync,
          action: PkiSyncAction.SyncCertificates,
          auditLogInfo
        });

        break;
      }
      case QueueJobs.PkiSyncImportCertificates: {
        const pkiSync = await pkiSyncDAL.updateById(syncId, {
          importStatus: PkiSyncStatus.Failed,
          lastImportMessage:
            "Failed to run job. This typically happens when a sync is already in progress. Please try again.",
          lastImportJobId: job.id
        });

        await $queueSendPkiSyncFailedNotifications({
          pkiSync,
          action: PkiSyncAction.ImportCertificates,
          auditLogInfo
        });

        break;
      }
      case QueueJobs.PkiSyncRemoveCertificates: {
        const pkiSync = await pkiSyncDAL.updateById(syncId, {
          removeStatus: PkiSyncStatus.Failed,
          lastRemoveMessage:
            "Failed to run job. This typically happens when a sync is already in progress. Please try again.",
          lastRemoveJobId: job.id
        });

        await $queueSendPkiSyncFailedNotifications({
          pkiSync,
          action: PkiSyncAction.RemoveCertificates,
          auditLogInfo
        });

        break;
      }
      default:
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw new Error(`Unhandled PKI Sync Job ${job.name}`);
    }
  };

  queueService.start(QueueName.PkiSync, async (job) => {
    if (job.name === QueueJobs.PkiSyncSendActionFailedNotifications) {
      await $sendPkiSyncFailedNotifications(job as TSendPkiSyncFailedNotificationsJobDTO);
      return;
    }

    const { syncId } = job.data as
      | TQueuePkiSyncSyncCertificatesByIdDTO
      | TQueuePkiSyncImportCertificatesByIdDTO
      | TQueuePkiSyncRemoveCertificatesByIdDTO;

    const pkiSync = await pkiSyncDAL.findById(syncId);

    if (!pkiSync) throw new Error(`Cannot find PKI sync with ID ${syncId}`);

    const { connectionId } = pkiSync;

    if (job.name === QueueJobs.PkiSyncSyncCertificates) {
      const isConcurrentLimitReached = await $isConnectionConcurrencyLimitReached(connectionId);

      if (isConcurrentLimitReached) {
        logger.info(
          `PkiSync Concurrency limit reached [syncId=${syncId}] [job=${job.name}] [connectionId=${connectionId}]`
        );

        await $handleAcquireLockFailure(job as PkiSyncActionJob);

        return;
      }
    }

    let lock: Awaited<ReturnType<typeof keyStore.acquireLock>>;

    try {
      lock = await keyStore.acquireLock(
        [KeyStorePrefixes.PkiSyncLock(syncId)],
        // PKI syncs can take excessive amounts of time so we need to keep it locked
        5 * 60 * 1000
      );
    } catch (e) {
      logger.info(`PkiSync Failed to acquire lock [syncId=${syncId}] [job=${job.name}]`);

      await $handleAcquireLockFailure(job as PkiSyncActionJob);

      return;
    }

    try {
      switch (job.name) {
        case QueueJobs.PkiSyncSyncCertificates: {
          await $incrementConnectionConcurrencyCount(connectionId);
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
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          throw new Error(`Unhandled PKI Sync Job ${job.name}`);
      }
    } finally {
      if (job.name === QueueJobs.PkiSyncSyncCertificates) {
        await $decrementConnectionConcurrencyCount(connectionId);
      }

      await lock.release();
    }
  });

  return {
    queuePkiSyncSyncCertificatesById,
    queuePkiSyncImportCertificatesById,
    queuePkiSyncRemoveCertificatesById
  };
};
