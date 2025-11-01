import { Knex } from "knex";

import { logger } from "@app/lib/logger";

import { TCertificateSyncDALFactory } from "../certificate-sync/certificate-sync-dal";
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

export const triggerAutoSyncForCertificate = async (
  certificateId: string,
  dependencies: {
    certificateSyncDAL: Pick<TCertificateSyncDALFactory, "findPkiSyncIdsByCertificateId">;
    pkiSyncDAL: Pick<TPkiSyncDALFactory, "find">;
    pkiSyncQueue: Pick<TPkiSyncQueueFactory, "queuePkiSyncSyncCertificatesById">;
  }
) => {
  try {
    const pkiSyncIds = await dependencies.certificateSyncDAL.findPkiSyncIdsByCertificateId(certificateId);

    if (pkiSyncIds.length === 0) {
      return;
    }

    const allPkiSyncs = await dependencies.pkiSyncDAL.find({
      isAutoSyncEnabled: true
    });

    const pkiSyncs = allPkiSyncs.filter((sync) => pkiSyncIds.includes(sync.id));

    const syncPromises = pkiSyncs.map((pkiSync) =>
      dependencies.pkiSyncQueue.queuePkiSyncSyncCertificatesById({ syncId: pkiSync.id })
    );
    await Promise.all(syncPromises);
  } catch (error) {
    logger.error(error, `Failed to trigger auto sync for certificate ${certificateId}:`);
  }
};

export const addRenewedCertificateToSyncs = async (
  oldCertificateId: string,
  newCertificateId: string,
  dependencies: {
    certificateSyncDAL: Pick<
      TCertificateSyncDALFactory,
      "findPkiSyncIdsByCertificateId" | "removeCertificates" | "addCertificates"
    >;
  },
  tx?: Knex
) => {
  try {
    const pkiSyncIds = await dependencies.certificateSyncDAL.findPkiSyncIdsByCertificateId(oldCertificateId);

    if (pkiSyncIds.length === 0) {
      return;
    }

    const addPromises = pkiSyncIds.map(async (pkiSyncId) => {
      await dependencies.certificateSyncDAL.addCertificates(pkiSyncId, [newCertificateId], tx);
    });

    await Promise.all(addPromises);

    logger.info(`Successfully added renewed certificate ${newCertificateId} to ${pkiSyncIds.length} PKI sync(s)`);
  } catch (error) {
    logger.error(error, `Failed to add renewed certificate ${newCertificateId} to syncs:`);
    throw error;
  }
};
