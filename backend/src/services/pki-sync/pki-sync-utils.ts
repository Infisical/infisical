import { Knex } from "knex";

import { AuditLogInfo, EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";

import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { TCertificateSyncDALFactory } from "../certificate-sync/certificate-sync-dal";
import { TPkiApplicationDALFactory } from "../pki-application/pki-application-dal";
import { TPkiSyncDALFactory } from "./pki-sync-dal";
import { PkiSync } from "./pki-sync-enums";
import { hasAnyPkiSyncFilter } from "./pki-sync-filter-fns";
import {
  applyPkiSyncCertificateDiff,
  assertPkiSyncCanHoldMatchedCertificates,
  computePkiSyncCertificateDiff,
  describePkiSyncApplication,
  TPkiSyncReconcileTarget
} from "./pki-sync-filter-reconcile-fns";
import { assertPkiSyncCanHoldCertificateCount } from "./pki-sync-fns";
import {
  TPkiSyncFilters,
  TQueuePkiSyncRemoveCertificatesByIdDTO,
  TQueuePkiSyncSyncCertificatesByIdDTO
} from "./pki-sync-types";

type TPkiSyncQueueForReconcile = {
  queuePkiSyncLinkMatchingCertificates: (payload: { certificateId: string; applicationId: string }) => Promise<unknown>;
};

type TPkiSyncRunQueue = {
  queuePkiSyncSyncCertificatesById: (payload: TQueuePkiSyncSyncCertificatesByIdDTO) => Promise<unknown>;
};

export const triggerAutoSyncForSubscriber = async (
  subscriberId: string,
  dependencies: {
    pkiSyncDAL: Pick<TPkiSyncDALFactory, "find">;
    pkiSyncQueue: TPkiSyncRunQueue;
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
    pkiSyncQueue: TPkiSyncRunQueue;
  }
) => {
  try {
    const pkiSyncIds = await dependencies.certificateSyncDAL.findPkiSyncIdsByCertificateId(certificateId);

    if (pkiSyncIds.length === 0) {
      return;
    }

    const allPkiSyncs = await dependencies.pkiSyncDAL.find({
      isAutoSyncEnabled: true,
      $in: {
        id: pkiSyncIds
      }
    });

    const syncPromises = allPkiSyncs.map((pkiSync) =>
      dependencies.pkiSyncQueue.queuePkiSyncSyncCertificatesById({ syncId: pkiSync.id })
    );
    await Promise.all(syncPromises);
  } catch (error) {
    logger.error(error, `Failed to trigger auto sync for certificate ${certificateId}:`);
  }
};

export const queueCertificateFilterReconcile = async (
  certificateId: string,
  applicationId: string,
  pkiSyncQueue: Pick<TPkiSyncQueueForReconcile, "queuePkiSyncLinkMatchingCertificates">
) => {
  try {
    await pkiSyncQueue.queuePkiSyncLinkMatchingCertificates({ certificateId, applicationId });
  } catch (error) {
    logger.error(
      error,
      `Failed to queue a filter reconcile [certificateId=${certificateId}] [applicationId=${applicationId}]`
    );
  }
};

export const findPkiSyncIdsHoldingCertificate = async (
  certificateId: string,
  dependencies: {
    certificateSyncDAL: Pick<TCertificateSyncDALFactory, "findPkiSyncIdsByCertificateId" | "primaryNode">;
  }
) => {
  try {
    return await dependencies.certificateSyncDAL.findPkiSyncIdsByCertificateId(
      certificateId,
      dependencies.certificateSyncDAL.primaryNode()
    );
  } catch (error) {
    logger.error(error, `Failed to read PKI sync links for certificate ${certificateId}`);
    return [];
  }
};

export const triggerSyncsForDeletedCertificate = async (
  certificateId: string,
  pkiSyncIds: string[],
  dependencies: {
    pkiSyncDAL: Pick<TPkiSyncDALFactory, "find">;
    pkiSyncQueue: TPkiSyncRunQueue;
    auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
    pkiApplicationDAL: Pick<TPkiApplicationDALFactory, "findById">;
  },
  certificate: { commonName: string; projectId: string; applicationId?: string | null },
  auditLogInfo?: AuditLogInfo
) => {
  if (pkiSyncIds.length === 0) return;

  try {
    const pkiSyncs = await dependencies.pkiSyncDAL.find({ $in: { id: pkiSyncIds } });
    const applicationLabel = await describePkiSyncApplication(
      certificate.applicationId,
      dependencies.pkiApplicationDAL
    );

    await Promise.all(
      pkiSyncs.map((pkiSync) =>
        dependencies.auditLogService.createAuditLog({
          ...(auditLogInfo ?? { actor: { type: ActorType.PLATFORM, metadata: {} } }),
          projectId: certificate.projectId,
          event: {
            type: EventType.PKI_SYNC_UNLINK_CERTIFICATES,
            metadata: {
              pkiSyncId: pkiSync.id,
              name: pkiSync.name,
              count: 1,
              certificates: [{ id: certificateId, commonName: certificate.commonName }],
              removedFromDestination: Boolean(
                (pkiSync.syncOptions as { canRemoveCertificates?: boolean } | null)?.canRemoveCertificates
              ),
              ...applicationLabel
            }
          }
        })
      )
    );

    await Promise.all(
      pkiSyncs
        .filter((pkiSync) => pkiSync.isAutoSyncEnabled)
        .map((pkiSync) => dependencies.pkiSyncQueue.queuePkiSyncSyncCertificatesById({ syncId: pkiSync.id }))
    );
  } catch (error) {
    logger.error(error, `Failed to reconcile PKI syncs after deleting certificate ${certificateId}`);
  }
};

export const addRenewedCertificateToSyncs = async (
  oldCertificateId: string,
  newCertificateId: string,
  dependencies: {
    certificateSyncDAL: Pick<
      TCertificateSyncDALFactory,
      "findPkiSyncIdsByCertificateId" | "addCertificates" | "findByPkiSyncAndCertificate" | "updateSyncMetadata"
    >;
  },
  tx?: Knex
) => {
  try {
    const pkiSyncIds = await dependencies.certificateSyncDAL.findPkiSyncIdsByCertificateId(oldCertificateId, tx);

    if (pkiSyncIds.length === 0) {
      return;
    }

    const addPromises = pkiSyncIds.map(async (pkiSyncId) => {
      const oldCertificateRecord = await dependencies.certificateSyncDAL.findByPkiSyncAndCertificate(
        pkiSyncId,
        oldCertificateId,
        tx
      );

      await dependencies.certificateSyncDAL.addCertificates(
        pkiSyncId,
        [
          {
            certificateId: newCertificateId,
            externalIdentifier: oldCertificateRecord?.externalIdentifier || undefined
          }
        ],
        tx
      );

      const oldSyncMetadata = oldCertificateRecord?.syncMetadata as { isDefault?: boolean } | null;
      if (oldSyncMetadata?.isDefault) {
        await dependencies.certificateSyncDAL.updateSyncMetadata(pkiSyncId, newCertificateId, { isDefault: true }, tx);
        await dependencies.certificateSyncDAL.updateSyncMetadata(pkiSyncId, oldCertificateId, null, tx);
      }
    });
    await Promise.all(addPromises);

    logger.info(`Successfully added renewed certificate ${newCertificateId} to PKI sync(s)`);
  } catch (error) {
    logger.error(error, `Failed to add renewed certificate ${newCertificateId} to syncs:`);
    throw error;
  }
};

type TReconcileCertificateAgainstSyncsDeps = {
  certificateDAL: Pick<
    TCertificateDALFactory,
    "findActiveCertificatesByIds" | "findCertificatesMatchingSyncFilters" | "find" | "primaryNode"
  >;
  certificateSyncDAL: Pick<
    TCertificateSyncDALFactory,
    | "findCertificateIdsByPkiSyncId"
    | "addCertificates"
    | "findByPkiSyncId"
    | "removeCertificates"
    | "transaction"
    | "primaryNode"
  >;
  pkiSyncDAL: Pick<TPkiSyncDALFactory, "find" | "findById" | "primaryNode">;
  pkiSyncQueue: TPkiSyncRunQueue & {
    queuePkiSyncRemoveCertificatesById: (payload: TQueuePkiSyncRemoveCertificatesByIdDTO) => Promise<unknown>;
  };
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  pkiApplicationDAL: Pick<TPkiApplicationDALFactory, "findById">;
  withSyncFilterLock: <T>(syncId: string, run: () => Promise<T>) => Promise<T>;
};

const $reconcileCertificateAgainstSync = async (
  certificateId: string,
  applicationId: string,
  pkiSync: Awaited<ReturnType<TPkiSyncDALFactory["find"]>>[number],
  dependencies: TReconcileCertificateAgainstSyncsDeps
) => {
  const filters = pkiSync.filters as TPkiSyncFilters | null;
  const matched = hasAnyPkiSyncFilter(filters)
    ? await dependencies.certificateDAL.findCertificatesMatchingSyncFilters(filters, {
        projectId: pkiSync.projectId,
        applicationId,
        certificateId
      })
    : [];

  const existingCertificateIds = await dependencies.certificateSyncDAL.findCertificateIdsByPkiSyncId(
    pkiSync.id,
    dependencies.certificateSyncDAL.primaryNode()
  );
  const isLinked = existingCertificateIds.includes(certificateId);

  if (matched.length === 0) {
    if (!isLinked) return;

    const [certificate] = await dependencies.certificateDAL.find({
      projectId: pkiSync.projectId,
      $in: { id: [certificateId] }
    });

    await applyPkiSyncCertificateDiff(
      pkiSync as TPkiSyncReconcileTarget,
      {
        matched: [],
        toLink: [],
        toUnlink: [{ id: certificateId, commonName: certificate?.commonName ?? "" }]
      },
      dependencies
    );

    logger.info(
      `Unlinked certificate from PKI sync by filter [certificateId=${certificateId}] [pkiSyncId=${pkiSync.id}]`
    );
    return;
  }

  if (isLinked) return;

  const liveCertificates = await dependencies.certificateDAL.findActiveCertificatesByIds(
    existingCertificateIds,
    dependencies.certificateDAL.primaryNode()
  );
  const prospectiveCount = liveCertificates.length + 1;
  try {
    assertPkiSyncCanHoldCertificateCount(
      pkiSync.destination as PkiSync,
      pkiSync.syncOptions as Record<string, unknown> | undefined,
      pkiSync.destinationConfig,
      prospectiveCount
    );
  } catch (limitError) {
    logger.warn(
      limitError,
      `Certificate matched a sync's filters but the sync cannot hold it [certificateId=${certificateId}] [pkiSyncId=${pkiSync.id}]`
    );

    await dependencies.auditLogService.createAuditLog({
      projectId: pkiSync.projectId,
      actor: { type: ActorType.PLATFORM, metadata: {} },
      event: {
        type: EventType.PKI_SYNC_SKIP_CERTIFICATE,
        metadata: {
          pkiSyncId: pkiSync.id,
          name: pkiSync.name,
          certificateId,
          commonName: matched[0].commonName,
          reason: limitError instanceof Error ? limitError.message : "This sync cannot hold another certificate.",
          ...(await describePkiSyncApplication(pkiSync.applicationId, dependencies.pkiApplicationDAL))
        }
      }
    });
    return;
  }

  await applyPkiSyncCertificateDiff(
    pkiSync as TPkiSyncReconcileTarget,
    { matched, toLink: [{ id: certificateId, commonName: matched[0].commonName }], toUnlink: [] },
    dependencies
  );

  logger.info(`Linked certificate to PKI sync by filter [certificateId=${certificateId}] [pkiSyncId=${pkiSync.id}]`);
};

export const reconcileSyncFilters = async (syncId: string, dependencies: TReconcileCertificateAgainstSyncsDeps) => {
  await dependencies.withSyncFilterLock(syncId, async () => {
    const pkiSync = await dependencies.pkiSyncDAL.findById(syncId, dependencies.pkiSyncDAL.primaryNode());
    if (!pkiSync?.applicationId) return;

    const target = pkiSync as TPkiSyncReconcileTarget;
    const diff = await computePkiSyncCertificateDiff(target, pkiSync.filters as TPkiSyncFilters | null, dependencies);
    if (diff.toLink.length === 0 && diff.toUnlink.length === 0) return;

    let applicableDiff = diff;
    try {
      assertPkiSyncCanHoldMatchedCertificates(target, diff.matched.length);
    } catch (capError) {
      logger.warn(
        capError,
        `A filtered PKI sync matches more certificates than it can hold, so only detachments were applied [pkiSyncId=${syncId}]`
      );
      applicableDiff = { ...diff, toLink: [] };
      if (applicableDiff.toUnlink.length === 0) return;
    }

    const { linked, unlinked } = await applyPkiSyncCertificateDiff(target, applicableDiff, dependencies);
    logger.info(
      `Reconciled a filtered PKI sync [pkiSyncId=${syncId}] [linked=${linked.length}] [unlinked=${unlinked.length}]`
    );
  });
};

export const reconcileCertificateAgainstMatchingSyncs = async (
  certificateId: string,
  applicationId: string | null | undefined,
  dependencies: TReconcileCertificateAgainstSyncsDeps
) => {
  if (!applicationId) return;

  const pkiSyncs = await dependencies.pkiSyncDAL.find({ applicationId });

  await Promise.all(
    pkiSyncs.map(({ id }) =>
      dependencies.withSyncFilterLock(id, async () => {
        const pkiSync = await dependencies.pkiSyncDAL.findById(id, dependencies.pkiSyncDAL.primaryNode());
        if (!pkiSync) return;

        await $reconcileCertificateAgainstSync(certificateId, applicationId, pkiSync, dependencies);
      })
    )
  );
};
