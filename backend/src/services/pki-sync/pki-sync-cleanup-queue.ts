import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";

import { TPkiSyncDALFactory } from "./pki-sync-dal";
import { TPkiSyncQueueFactory } from "./pki-sync-queue";

type TPkiSyncCleanupQueueServiceFactoryDep = {
  cronJob: TCronJobFactory;
  pkiSyncDAL: Pick<TPkiSyncDALFactory, "findPkiSyncsWithExpiredCertificates">;
  pkiSyncQueue: Pick<TPkiSyncQueueFactory, "queuePkiSyncSyncCertificatesById">;
};

export type TPkiSyncCleanupQueueServiceFactory = ReturnType<typeof pkiSyncCleanupQueueServiceFactory>;

export const pkiSyncCleanupQueueServiceFactory = ({
  cronJob,
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

  const init = () => {
    cronJob.register({
      name: CronJobName.PkiSyncCleanup,
      pattern: "0 0 * * *",
      runHashTtlS: 3 * 24 * 60 * 60,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        logger.info("cron[pki-sync-cleanup]: task started");
        await syncExpiredCertificatesForPkiSyncs();
      }
    });
  };

  return {
    init,
    syncExpiredCertificatesForPkiSyncs
  };
};
