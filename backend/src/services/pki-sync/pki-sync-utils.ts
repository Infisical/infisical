import { logger } from "@app/lib/logger";

import { TPkiSyncDALFactory } from "./pki-sync-dal";
import { TPkiSyncQueueFactory } from "./pki-sync-queue";

export const triggerAutoSyncForSubscriber = async (
  subscriberId: string,
  dependencies: {
    pkiSyncDAL: Pick<TPkiSyncDALFactory, "find">;
    pkiSyncQueue: Pick<TPkiSyncQueueFactory, "queuePkiSyncSyncCertificatesById">;
  }
) => {
  try {
    const pkiSyncs = await dependencies.pkiSyncDAL.find({
      subscriberId,
      isAutoSyncEnabled: true
    });

    // Queue sync jobs for each auto sync enabled PKI sync
    const syncPromises = pkiSyncs.map((pkiSync) =>
      dependencies.pkiSyncQueue.queuePkiSyncSyncCertificatesById({ syncId: pkiSync.id })
    );
    await Promise.all(syncPromises);
  } catch (error) {
    logger.error(error, `Failed to trigger auto sync for subscriber ${subscriberId}:`);
  }
};
