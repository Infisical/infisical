import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TPkiSyncDALFactory } from "./pki-sync-dal";
import { TPkiSyncQueueFactory } from "./pki-sync-queue";

type TPkiSyncCleanupQueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  pkiSyncDAL: Pick<TPkiSyncDALFactory, "findPkiSyncsWithExpiredCertificates">;
  pkiSyncQueue: Pick<TPkiSyncQueueFactory, "queuePkiSyncSyncCertificatesById">;
};

export type TPkiSyncCleanupQueueServiceFactory = ReturnType<typeof pkiSyncCleanupQueueServiceFactory>;

export const pkiSyncCleanupQueueServiceFactory = ({
  queueService,
  pkiSyncDAL,
  pkiSyncQueue
}: TPkiSyncCleanupQueueServiceFactoryDep) => {
  const appCfg = getConfig();

  const syncExpiredCertificatesForPkiSyncs = async () => {
    try {
      const pkiSyncsWithExpiredCerts = await pkiSyncDAL.findPkiSyncsWithExpiredCertificates();

      if (pkiSyncsWithExpiredCerts.length === 0) {
        logger.info("No PKI syncs found with certificates that expired the previous day");
        return;
      }

      logger.info(
        `Found ${pkiSyncsWithExpiredCerts.length} PKI sync(s) with certificates that expired the previous day`
      );

      // Trigger sync for each PKI sync that has expired certificates
      for (const { id: syncId, subscriberId } of pkiSyncsWithExpiredCerts) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await pkiSyncQueue.queuePkiSyncSyncCertificatesById({
            syncId
          });
          logger.info(
            `Successfully queued PKI sync ${syncId} for subscriber ${subscriberId} due to expired certificates`
          );
        } catch (error) {
          logger.error(error, `Failed to queue PKI sync ${syncId} for subscriber ${subscriberId}`);
        }
      }
    } catch (error) {
      logger.error(error, "Failed to sync expired certificates for PKI syncs");
      throw error;
    }
  };

  const init = async () => {
    if (appCfg.isSecondaryInstance) {
      return;
    }

    await queueService.stopRepeatableJob(
      QueueName.PkiSyncCleanup,
      QueueJobs.PkiSyncCleanup,
      { pattern: "0 0 * * *", utc: true },
      QueueName.PkiSyncCleanup // just a job id
    );

    queueService.start(QueueName.PkiSyncCleanup, async () => {
      try {
        logger.info(`${QueueName.PkiSyncCleanup}: queue task started`);
        await syncExpiredCertificatesForPkiSyncs();
        logger.info(`${QueueName.PkiSyncCleanup}: queue task completed`);
      } catch (error) {
        logger.error(error, `${QueueName.PkiSyncCleanup}: PKI sync cleanup failed`);
        throw error;
      }
    });

    await queueService.schedulePg(QueueJobs.PkiSyncCleanup, "0 0 * * *", undefined, { tz: "UTC" });
  };

  return {
    init,
    syncExpiredCertificatesForPkiSyncs
  };
};
