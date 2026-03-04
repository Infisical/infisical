/* eslint-disable no-await-in-loop */
import opentelemetry from "@opentelemetry/api";
import * as x509 from "@peculiar/x509";
import { AxiosError } from "axios";
import { Job } from "bullmq";
import { randomUUID } from "crypto";
import handlebars from "handlebars";

import { TCertificates } from "@app/db/schemas";
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

import { TAppConnectionDALFactory } from "../app-connection/app-connection-dal";
import { TCertificateBodyDALFactory } from "../certificate/certificate-body-dal";
import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { getCertificateCredentials } from "../certificate/certificate-fns";
import { TCertificateSecretDALFactory } from "../certificate/certificate-secret-dal";
import { TCertificateAuthorityCertDALFactory } from "../certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "../certificate-authority/certificate-authority-dal";
import { getCaCertChain } from "../certificate-authority/certificate-authority-fns";
import { extractRootCaFromChain, removeRootCaFromChain } from "../certificate-common/certificate-utils";
import { TCertificateSyncDALFactory } from "../certificate-sync/certificate-sync-dal";
import { CertificateSyncStatus } from "../certificate-sync/certificate-sync-enums";
import { TPkiSyncDALFactory } from "./pki-sync-dal";
import { PkiSyncStatus } from "./pki-sync-enums";
import { PkiSyncError } from "./pki-sync-errors";
import { enterprisePkiSyncCheck, parsePkiSyncErrorMessage, PkiSyncFns } from "./pki-sync-fns";
import {
  TCertificateMap,
  TPkiSyncImportCertificatesDTO,
  TPkiSyncRaw,
  TPkiSyncRemoveCertificatesDTO,
  TPkiSyncSyncCertificatesDTO,
  TPkiSyncWithCredentials,
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
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "setItemWithExpiry" | "getItem">;
  pkiSyncDAL: Pick<TPkiSyncDALFactory, "findById" | "find" | "updateById" | "deleteById" | "update">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  projectDAL: TProjectDALFactory;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  certificateDAL: TCertificateDALFactory;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne" | "create">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "findOne" | "create">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "findById">;
  certificateSyncDAL: TCertificateSyncDALFactory;
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
  projectDAL,
  licenseService,
  certificateDAL,
  certificateBodyDAL,
  certificateSecretDAL,
  certificateAuthorityDAL,
  certificateAuthorityCertDAL,
  certificateSyncDAL
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

  const $getInfisicalCertificates = async (
    pkiSync: TPkiSyncRaw | TPkiSyncWithCredentials
  ): Promise<{ certificateMap: TCertificateMap; certificateMetadata: Map<string, { id: string; name: string }> }> => {
    const { projectId, subscriberId, id: pkiSyncId } = pkiSync;

    const certificateMap: TCertificateMap = {};
    const certificateMetadata = new Map<string, { id: string; name: string }>();
    let certificates: Array<{ id: string; projectId: string; caCertId?: string | null }> = [];

    try {
      if (subscriberId) {
        const subscriberCertificates = await certificateDAL.findAllActiveCertsForSubscriber({
          subscriberId
        });
        certificates.push(...subscriberCertificates);
      }

      const certificateIds = await certificateSyncDAL.findCertificateIdsByPkiSyncId(pkiSyncId);
      if (certificateIds.length > 0) {
        const directCertificates = await certificateDAL.findActiveCertificatesByIds(certificateIds);
        certificates.push(...directCertificates);
      }

      const uniqueCertificates = certificates.filter(
        (cert, index, self) => self.findIndex((c) => c.id === cert.id) === index
      );

      const activeCertificates = uniqueCertificates.filter((cert) => {
        const typedCert = cert as TCertificates;
        return !typedCert.renewedByCertificateId;
      });

      if (activeCertificates.length === 0) {
        return { certificateMap, certificateMetadata };
      }

      certificates = activeCertificates;

      for (const certificate of certificates) {
        const cert = certificate as TCertificates;
        try {
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

            let certificateChain: string | undefined;
            let caCertificate: string | undefined;
            try {
              if (certBody.encryptedCertificateChain) {
                const decryptedCertChain = await kmsDecryptor({
                  cipherTextBlob: certBody.encryptedCertificateChain
                });
                certificateChain = decryptedCertChain.toString();
              }
              if (certificate.caCertId) {
                const { caCert, caCertChain } = await getCaCertChain({
                  caCertId: certificate.caCertId,
                  certificateAuthorityDAL,
                  certificateAuthorityCertDAL,
                  projectDAL,
                  kmsService
                });
                if (!certBody.encryptedCertificateChain) {
                  certificateChain = `${caCert}\n${caCertChain}`.trim();
                }
                caCertificate = certificateChain ? extractRootCaFromChain(certificateChain) : caCert;
              }
            } catch (chainError) {
              logger.warn(
                { certificateId: certificate.id, subscriberId, error: chainError },
                "Certificate chain not found or could not be decrypted - certificate may be imported or chain was not stored"
              );
              // Continue without certificate chain
              certificateChain = undefined;
              caCertificate = undefined;
            }

            let certificateName: string;
            const syncOptions = pkiSync.syncOptions as
              | {
                  certificateNameSchema?: string;
                  includeRootCa?: boolean;
                }
              | undefined;
            const certificateNameSchema = syncOptions?.certificateNameSchema;

            if (certificateNameSchema) {
              const environment = "global";
              const templateData = {
                certificateId: certificate.id.replace(/-/g, ""),
                profileId: cert.profileId?.replace(/-/g, "") || certificate.id.replace(/-/g, ""),
                commonName: cert.commonName || "",
                friendlyName: cert.friendlyName || "",
                environment
              };
              certificateName = handlebars.compile(certificateNameSchema)(templateData);
            } else {
              const stableId = cert.profileId
                ? `${cert.profileId.replace(/-/g, "")}-${(cert.commonName || "").replace(/[^a-zA-Z0-9]/g, "")}`
                : certificate.id.replace(/-/g, "");
              certificateName = `Infisical-${stableId}`;
            }

            const alternativeNames: string[] = [];

            const legacyName = `Infisical-${certificate.id.replace(/-/g, "")}`;
            if (legacyName !== certificateName) {
              alternativeNames.push(legacyName);
            }

            if (cert.renewedFromCertificateId) {
              const originalLegacyName = `Infisical-${cert.renewedFromCertificateId.replace(/-/g, "")}`;
              alternativeNames.push(originalLegacyName);
            }

            let processedCertificateChain = certificateChain;
            if (certificateChain && syncOptions?.includeRootCa === false) {
              processedCertificateChain = removeRootCaFromChain(certificateChain);
            }

            certificateMap[certificateName] = {
              cert: certificatePem,
              privateKey: certPrivateKey || "",
              certificateChain: processedCertificateChain,
              caCertificate,
              alternativeNames,
              certificateId: certificate.id
            };

            certificateMetadata.set(certificateName, {
              id: certificate.id,
              name: certificateName
            });
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

    return { certificateMap, certificateMetadata };
  };

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
    let syncMessage: string | null = null;
    let isFinalAttempt = job.attemptsStarted === job.opts.attempts;

    try {
      const {
        connection: { id: connectionId, orgId, projectId: appConnectionProjectId }
      } = pkiSync;

      const appConnection = await appConnectionDAL.findById(connectionId);
      if (!appConnection) {
        throw new Error(`App connection not found: ${connectionId}`);
      }

      const credentials = await decryptAppConnectionCredentials({
        orgId,
        encryptedCredentials: appConnection.encryptedCredentials,
        kmsService,
        projectId: appConnectionProjectId
      });

      const pkiSyncWithCredentials = {
        ...pkiSync,
        connection: {
          ...pkiSync.connection,
          credentials
        }
      } as TPkiSyncWithCredentials;

      const { certificateMap, certificateMetadata } = await $getInfisicalCertificates(pkiSync);

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
        certificateSyncDAL
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

      if (postSyncUpdates.length > 0) {
        await certificateSyncDAL.bulkUpdateSyncStatus(postSyncUpdates);
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
        await pkiSyncDAL.updateById(pkiSync.id, {
          syncStatus,
          lastSyncJobId: job.id,
          lastSyncMessage: syncMessage,
          lastSyncedAt: isSynced ? ranAt : undefined
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
        connection: { id: connectionId, orgId, projectId: appConnectionProjectId }
      } = pkiSync;

      const appConnection = await appConnectionDAL.findById(connectionId);
      if (!appConnection) {
        throw new Error(`App connection not found: ${connectionId}`);
      }

      const credentials = await decryptAppConnectionCredentials({
        orgId,
        encryptedCredentials: appConnection.encryptedCredentials,
        kmsService,
        projectId: appConnectionProjectId
      });

      const { certificateMap } = await $getInfisicalCertificates(pkiSync);

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
          kmsService,
          certificateSyncDAL,
          certificateDAL,
          certificateMap
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

    if (job.name === QueueJobs.PkiSyncSyncCertificates) {
      const isConcurrentLimitReached = await $isConnectionConcurrencyLimitReached(connectionId);

      if (isConcurrentLimitReached) {
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
          throw new Error(`Unhandled PKI Sync Job ${String(job.name)}`);
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
