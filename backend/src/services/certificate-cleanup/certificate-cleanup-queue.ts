/* eslint-disable no-await-in-loop */

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { ActorType } from "@app/services/auth/auth-type";

import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { CertStatus } from "../certificate/certificate-types";
import { TCertificateCleanupConfigDALFactory } from "./certificate-cleanup-dal";
import { CLEANUP_AUDIT_LOG_CAP, CLEANUP_BATCH_SIZE, CleanupRunStatus } from "./certificate-cleanup-types";

type TCertificateCleanupQueueFactoryDep = {
  db: TDbClient;
  queueService: TQueueServiceFactory;
  certificateCleanupConfigDAL: TCertificateCleanupConfigDALFactory;
  certificateDAL: Pick<TCertificateDALFactory, "delete">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
};

export type TCertificateCleanupQueueFactory = ReturnType<typeof certificateCleanupQueueFactory>;

export const certificateCleanupQueueFactory = ({
  db,
  queueService,
  certificateCleanupConfigDAL,
  certificateDAL,
  auditLogService
}: TCertificateCleanupQueueFactoryDep) => {
  const appCfg = getConfig();

  const processProjectCleanup = async (config: {
    id: string;
    projectId: string;
    daysBeforeDeletion: number;
    includeRevokedCertificates: boolean;
    skipCertsWithActiveSyncs: boolean;
  }) => {
    let deletedCount = 0;
    let offset = 0;
    const errorMessages: string[] = [];
    let pendingAuditCerts: { serialNumber: string; commonName: string; altNames: string | null }[] = [];

    const flushAuditLog = async () => {
      if (pendingAuditCerts.length === 0) return;
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
            certificates: pendingAuditCerts
          }
        }
      });
      pendingAuditCerts = [];
    };

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.daysBeforeDeletion);

    let hasMore = true;

    while (hasMore) {
      let query = db
        .replicaNode()(TableName.Certificate)
        .where("projectId", config.projectId)
        .orderBy("id", "asc")
        .select("id");

      if (config.includeRevokedCertificates) {
        query = query.where(function expiryOrRevoked() {
          void this.where("notAfter", "<", cutoffDate).orWhere("status", CertStatus.REVOKED);
        });
      } else {
        query = query.where("notAfter", "<", cutoffDate);
      }

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
          const deleted = await certificateDAL.delete({ $in: { id: idsToDelete } });
          deletedCount += deleted.length;

          for (const cert of deleted) {
            pendingAuditCerts.push({
              serialNumber: cert.serialNumber,
              commonName: cert.commonName,
              altNames: cert.altNames ?? null
            });

            if (pendingAuditCerts.length >= CLEANUP_AUDIT_LOG_CAP) {
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

    return { deletedCount, errors: errorMessages.length };
  };

  const init = async () => {
    if (appCfg.isSecondaryInstance) {
      return;
    }

    queueService.start(QueueName.CertificateCleanup, async () => {
      logger.info(`${QueueJobs.CertificateCleanup}: started`);

      const configs = await certificateCleanupConfigDAL.find({ isEnabled: true });

      logger.info(`${QueueJobs.CertificateCleanup}: found ${configs.length} projects with cleanup enabled`);

      let totalDeleted = 0;
      let totalErrors = 0;

      for (const config of configs) {
        try {
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

          await certificateCleanupConfigDAL.updateById(config.id, {
            lastRunStatus: CleanupRunStatus.Error,
            lastRunAt: new Date(),
            lastRunCertsDeleted: 0,
            lastRunMessage: String((err as Error).message || "Unknown error").slice(0, 500)
          });
        }
      }

      logger.info(`${QueueJobs.CertificateCleanup}: completed — deleted ${totalDeleted} total, ${totalErrors} errors`);
    });

    await queueService.stopRepeatableJob(
      QueueName.CertificateCleanup,
      QueueJobs.CertificateCleanup,
      { pattern: "0 2 * * *", utc: true },
      QueueJobs.CertificateCleanup
    );

    await queueService.queue(QueueName.CertificateCleanup, QueueJobs.CertificateCleanup, undefined, {
      jobId: QueueJobs.CertificateCleanup,
      repeat: {
        pattern: "0 2 * * *",
        utc: true,
        key: QueueJobs.CertificateCleanup
      },
      removeOnComplete: true,
      removeOnFail: true
    });

    queueService.listen(QueueName.CertificateCleanup, "failed", (_, err) => {
      logger.error(err, `${QueueName.CertificateCleanup}: job failed`);
    });
  };

  return { init };
};
