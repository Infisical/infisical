import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";

import { TPkiSyncDALFactory } from "./pki-sync-dal";
import { TPkiSyncQueueFactory } from "./pki-sync-queue";

const FILTERED_SYNC_BATCH = 500;
const FILTERED_SYNC_MAX_BATCHES_PER_RUN = 20;

type TPkiSyncCleanupQueueServiceFactoryDep = {
  cronJob: TCronJobFactory;
  pkiSyncDAL: Pick<TPkiSyncDALFactory, "findPkiSyncsWithExpiredCertificates" | "findFilteredSyncIds">;
  pkiSyncQueue: Pick<TPkiSyncQueueFactory, "queuePkiSyncSyncCertificatesById" | "queuePkiSyncReconcileFilters">;
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

  const reconcileFilteredSyncs = async () => {
    try {
      let queued = 0;
      let afterId: string | undefined;

      for (let batch = 0; batch < FILTERED_SYNC_MAX_BATCHES_PER_RUN; batch += 1) {
        // eslint-disable-next-line no-await-in-loop
        const syncIds = await pkiSyncDAL.findFilteredSyncIds(FILTERED_SYNC_BATCH, afterId);
        if (syncIds.length === 0) break;

        for (const syncId of syncIds) {
          try {
            // eslint-disable-next-line no-await-in-loop
            await pkiSyncQueue.queuePkiSyncReconcileFilters({ syncId });
            queued += 1;
          } catch (error) {
            logger.error(error, `Failed to queue a filter reconcile [pkiSyncId=${syncId}]`);
          }
        }

        afterId = syncIds[syncIds.length - 1];
        if (syncIds.length < FILTERED_SYNC_BATCH) break;
      }

      if (queued === 0) return;

      logger.info(`cron[pki-sync-cleanup]: re-evaluating the certificates held by ${queued} filtered sync(s)`);
    } catch (error) {
      logger.error(error, "Failed to re-evaluate the certificates held by filtered syncs");
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

        const [expiredCertificateSweep] = await Promise.allSettled([
          syncExpiredCertificatesForPkiSyncs(),
          reconcileFilteredSyncs()
        ]);

        if (expiredCertificateSweep.status === "rejected") throw expiredCertificateSweep.reason;
      }
    });
  };

  return {
    init,
    syncExpiredCertificatesForPkiSyncs,
    reconcileFilteredSyncs
  };
};
