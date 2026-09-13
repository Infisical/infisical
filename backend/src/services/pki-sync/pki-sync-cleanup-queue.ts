import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";

import { TCertificateSyncDALFactory } from "../certificate-sync/certificate-sync-dal";
import { TPkiSyncDALFactory } from "./pki-sync-dal";
import { TPkiSyncQueueFactory } from "./pki-sync-queue";

const INELIGIBLE_LINK_BATCH = 500;
const INELIGIBLE_LINK_MAX_BATCHES_PER_RUN = 10;

type TPkiSyncCleanupQueueServiceFactoryDep = {
  cronJob: TCronJobFactory;
  pkiSyncDAL: Pick<TPkiSyncDALFactory, "findPkiSyncsWithExpiredCertificates">;
  certificateSyncDAL: Pick<TCertificateSyncDALFactory, "findIneligibleFilteredLinks">;
  pkiSyncQueue: Pick<TPkiSyncQueueFactory, "queuePkiSyncSyncCertificatesById" | "queuePkiSyncLinkMatchingCertificates">;
};

export type TPkiSyncCleanupQueueServiceFactory = ReturnType<typeof pkiSyncCleanupQueueServiceFactory>;

export const pkiSyncCleanupQueueServiceFactory = ({
  cronJob,
  pkiSyncDAL,
  certificateSyncDAL,
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

  const reconcileIneligibleFilteredLinks = async () => {
    try {
      let queued = 0;

      for (let page = 0; page < INELIGIBLE_LINK_MAX_BATCHES_PER_RUN; page += 1) {
        // eslint-disable-next-line no-await-in-loop
        const stale = await certificateSyncDAL.findIneligibleFilteredLinks(
          INELIGIBLE_LINK_BATCH,
          page * INELIGIBLE_LINK_BATCH
        );

        if (stale.length === 0) break;

        for (const { certificateId, applicationId } of stale) {
          try {
            // eslint-disable-next-line no-await-in-loop
            await pkiSyncQueue.queuePkiSyncLinkMatchingCertificates({ certificateId, applicationId });
            queued += 1;
          } catch (error) {
            logger.error(error, `Failed to queue a filter reconcile [certificateId=${certificateId}]`);
          }
        }

        if (stale.length < INELIGIBLE_LINK_BATCH) break;
      }

      if (queued === 0) return;

      logger.info(`cron[pki-sync-cleanup]: re-evaluating ${queued} certificate(s) held by a filtered sync`);
    } catch (error) {
      logger.error(error, "Failed to re-evaluate certificates held by a filtered sync");
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
          reconcileIneligibleFilteredLinks()
        ]);

        if (expiredCertificateSweep.status === "rejected") throw expiredCertificateSweep.reason;
      }
    });
  };

  return {
    init,
    syncExpiredCertificatesForPkiSyncs,
    reconcileIneligibleFilteredLinks
  };
};
