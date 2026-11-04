/* eslint-disable no-await-in-loop */

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { QueueJobs } from "@app/queue";
import { ActorType } from "@app/services/auth/auth-type";
import { ActiveCerts, WildcardCerts } from "@app/services/license-client";
import { TUsageMeteringServiceFactory } from "@app/services/license-client/usage/usage-metering-service";

import { TCertificateRequestDALFactory } from "../certificate-request/certificate-request-dal";
import { TCertificateSyncDALFactory } from "../certificate-sync/certificate-sync-dal";
import { TCertificateBodyDALFactory } from "../certificate/certificate-body-dal";
import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { softDeleteCertificates } from "../certificate/certificate-fns";
import { TCertificateSecretDALFactory } from "../certificate/certificate-secret-dal";
import { TPkiCollectionItemDALFactory } from "../pki-collection/pki-collection-item-dal";
import { TPkiSyncDALFactory } from "../pki-sync/pki-sync-dal";
import { TPkiSyncQueueFactory } from "../pki-sync/pki-sync-queue";
import { TTelemetryServiceFactory } from "../telemetry/telemetry-service";
import { PostHogEventTypes } from "../telemetry/telemetry-types";
import { TCertificateCleanupConfigDALFactory } from "./certificate-cleanup-dal";
import { CLEANUP_BATCH_SIZE, CleanupRunStatus } from "./certificate-cleanup-types";

type TCertificateCleanupQueueFactoryDep = {
  db: TDbClient;
  cronJob: TCronJobFactory;
  certificateCleanupConfigDAL: TCertificateCleanupConfigDALFactory;
  certificateDAL: Pick<TCertificateDALFactory, "update">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "delete">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "delete">;
  certificateRequestDAL: Pick<TCertificateRequestDALFactory, "update">;
  pkiCollectionItemDAL: Pick<TPkiCollectionItemDALFactory, "delete">;
  certificateSyncDAL: Pick<TCertificateSyncDALFactory, "find">;
  pkiSyncDAL: Pick<TPkiSyncDALFactory, "find">;
  pkiSyncQueue: Pick<TPkiSyncQueueFactory, "queuePkiSyncSyncCertificatesById">;
  usageMeteringService: Pick<TUsageMeteringServiceFactory, "emitForProject">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
};

export type TCertificateCleanupQueueFactory = ReturnType<typeof certificateCleanupQueueFactory>;

export const certificateCleanupQueueFactory = ({
  db,
  cronJob,
  certificateCleanupConfigDAL,
  certificateDAL,
  certificateBodyDAL,
  certificateSecretDAL,
  certificateRequestDAL,
  pkiCollectionItemDAL,
  certificateSyncDAL,
  pkiSyncDAL,
  pkiSyncQueue,
  usageMeteringService,
  auditLogService,
  telemetryService
}: TCertificateCleanupQueueFactoryDep) => {
  const appCfg = getConfig();

  const processProjectCleanup = async (config: {
    id: string;
    projectId: string;
    postExpiryRetentionDays: number;
    skipCertsWithActiveSyncs: boolean;
  }) => {
    let deletedCount = 0;
    let offset = 0;
    const errorMessages: string[] = [];
    let pendingAuditSerials: string[] = [];

    const flushAuditLog = async () => {
      if (pendingAuditSerials.length === 0) return;
      await auditLogService.createAuditLog({
        projectId: config.projectId,
        actor: {
          type: ActorType.PLATFORM,
          metadata: {}
        },
        event: {
          type: EventType.CERTIFICATE_CLEANUP_COMPLETED,
          metadata: {
            deletedCount,
            certificateSerialNumbers: pendingAuditSerials
          }
        }
      });
      pendingAuditSerials = [];
    };

    const queueAutoSyncsForRemoval = async (pkiSyncIds: string[]) => {
      if (pkiSyncIds.length === 0) return;
      try {
        const pkiSyncs = await pkiSyncDAL.find({ $in: { id: pkiSyncIds }, isAutoSyncEnabled: true });
        await Promise.all(
          pkiSyncs.map((pkiSync) => pkiSyncQueue.queuePkiSyncSyncCertificatesById({ syncId: pkiSync.id }))
        );
      } catch (err) {
        logger.error(err, `CertificateCleanup: failed to queue PKI syncs for project ${config.projectId}`);
      }
    };

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.postExpiryRetentionDays);

    let hasMore = true;

    while (hasMore) {
      let query = db
        .replicaNode()(TableName.Certificate)
        .where("projectId", config.projectId)
        .where("notAfter", "<", cutoffDate)
        .whereNull("deletedAt")
        .whereNotExists((qb) => {
          void qb
            .select("id")
            .from(TableName.PkiSigners)
            .whereRaw(`"${TableName.PkiSigners}"."certificateId" = "${TableName.Certificate}"."id"`);
        })
        .orderBy("id", "asc")
        .select("id");

      query = query.offset(offset).limit(CLEANUP_BATCH_SIZE);

      const batch = await query;

      if (batch.length === 0) {
        break;
      }

      let idsToDelete = batch.map((cert) => cert.id);
      let skippedCount = 0;

      if (config.skipCertsWithActiveSyncs && idsToDelete.length > 0) {
        try {
          const certsWithSyncs: { certificateId: string }[] = await db
            .replicaNode()(TableName.CertificateSync)
            .whereIn("certificateId", idsToDelete)
            .distinct("certificateId")
            .select("certificateId");

          const syncedCertIds = new Set(certsWithSyncs.map((row) => row.certificateId));
          skippedCount = syncedCertIds.size;
          idsToDelete = idsToDelete.filter((id) => !syncedCertIds.has(id));
        } catch (err) {
          logger.error(err, "CertificateCleanup: failed to check certificate syncs");
          errorMessages.push("Failed to check certificate syncs for batch");
          skippedCount = idsToDelete.length;
          idsToDelete = [];
        }
      }

      if (idsToDelete.length > 0) {
        try {
          const { deletedCertificates: deleted, pkiSyncIdsHoldingCertificates } =
            await certificateCleanupConfigDAL.transaction((tx) =>
              softDeleteCertificates(
                { certificateIds: idsToDelete, actorType: ActorType.PLATFORM },
                {
                  certificateDAL,
                  certificateBodyDAL,
                  certificateSecretDAL,
                  certificateRequestDAL,
                  pkiCollectionItemDAL,
                  certificateSyncDAL
                },
                tx
              )
            );
          deletedCount += deleted.length;
          await queueAutoSyncsForRemoval(pkiSyncIdsHoldingCertificates);

          for (const cert of deleted) {
            pendingAuditSerials.push(cert.serialNumber);

            if (pendingAuditSerials.length >= CLEANUP_BATCH_SIZE) {
              await flushAuditLog();
            }
          }
        } catch (err) {
          logger.error(err, "CertificateCleanup: batch delete failed");
          errorMessages.push(`Batch delete failed: ${(err as Error).message}`);
          skippedCount += idsToDelete.length;
        }
      }

      offset += skippedCount;

      if (batch.length < CLEANUP_BATCH_SIZE) {
        hasMore = false;
      }
    }

    const lastRunMessage = errorMessages.length > 0 ? errorMessages.slice(0, 5).join("; ") : null;

    await certificateCleanupConfigDAL.updateById(config.id, {
      lastRunStatus: errorMessages.length > 0 ? CleanupRunStatus.Error : CleanupRunStatus.Success,
      lastRunAt: new Date(),
      lastRunCertsDeleted: deletedCount,
      lastRunMessage
    });

    await flushAuditLog();

    if (deletedCount > 0) {
      usageMeteringService.emitForProject(config.projectId, ActiveCerts.key);
      usageMeteringService.emitForProject(config.projectId, WildcardCerts.key);
    }

    return { deletedCount, errors: errorMessages.length };
  };

  const init = () => {
    cronJob.register({
      name: CronJobName.CertificateCleanup,
      pattern: "0 2 * * *",
      runHashTtlS: 3 * 24 * 60 * 60,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        logger.info(`${QueueJobs.CertificateCleanup}: started`);

        const configs = await certificateCleanupConfigDAL.find({ isEnabled: true });

        logger.info(`${QueueJobs.CertificateCleanup}: found ${configs.length} projects with cleanup enabled`);

        let totalDeleted = 0;
        let totalErrors = 0;

        for (const config of configs) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const result = await processProjectCleanup(config);
            totalDeleted += result.deletedCount;
            totalErrors += result.errors;

            if (result.deletedCount > 0) {
              logger.info(
                `${QueueJobs.CertificateCleanup}: project ${config.projectId} — deleted ${result.deletedCount} certificates`
              );
            }
          } catch (err) {
            totalErrors += 1;
            logger.error(err, `${QueueJobs.CertificateCleanup}: failed for project ${config.projectId}`);
            // eslint-disable-next-line no-await-in-loop
            await certificateCleanupConfigDAL.updateById(config.id, {
              lastRunStatus: CleanupRunStatus.Error,
              lastRunAt: new Date(),
              lastRunMessage: String((err as Error).message || "Unknown error").slice(0, 500)
            });
          }
        }

        logger.info(
          `${QueueJobs.CertificateCleanup}: completed — deleted ${totalDeleted} total, ${totalErrors} errors`
        );

        if (totalDeleted > 0) {
          await telemetryService.sendPostHogEvents({
            event: PostHogEventTypes.CertificateCleanupCompleted,
            distinctId: "platform/certificate-cleanup",
            properties: {
              deletedCount: totalDeleted,
              projectsProcessed: configs.length
            }
          });
        }
      }
    });
  };

  return { init };
};
