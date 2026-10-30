import { Knex } from "knex";

import { AuditLogInfo, EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";

import { TCertificateSyncDALFactory } from "../certificate-sync/certificate-sync-dal";
import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { TPkiApplicationDALFactory } from "../pki-application/pki-application-dal";
import { PkiSync } from "./pki-sync-enums";
import { hasAnyPkiSyncFilter } from "./pki-sync-filter-fns";
import { assertPkiSyncCanHoldCertificateCount, getPkiSyncUnlinkAssertion } from "./pki-sync-fns";
import {
  TPkiSyncCertificateDiff,
  TPkiSyncCertificateRef,
  TPkiSyncFilters,
  TPkiSyncRemovalOptions,
  TQueuePkiSyncRemoveCertificatesByIdDTO,
  TQueuePkiSyncSyncCertificatesByIdDTO
} from "./pki-sync-types";

export type TPkiSyncReconcileTarget = {
  id: string;
  name: string;
  projectId: string;
  applicationId?: string | null;
  destination: string;
  destinationConfig: Record<string, unknown>;
  syncOptions: unknown;
  isAutoSyncEnabled: boolean;
};

type TPkiSyncFilterReconcileDeps = {
  certificateDAL: Pick<TCertificateDALFactory, "findCertificatesMatchingSyncFilters" | "find">;
  certificateSyncDAL: Pick<
    TCertificateSyncDALFactory,
    | "findCertificateIdsByPkiSyncId"
    | "findByPkiSyncId"
    | "addCertificates"
    | "removeCertificates"
    | "transaction"
    | "primaryNode"
  >;
  pkiSyncQueue: {
    queuePkiSyncSyncCertificatesById: (payload: TQueuePkiSyncSyncCertificatesByIdDTO) => Promise<unknown>;
    queuePkiSyncRemoveCertificatesById: (payload: TQueuePkiSyncRemoveCertificatesByIdDTO) => Promise<unknown>;
  };
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  pkiApplicationDAL: Pick<TPkiApplicationDALFactory, "findById">;
};

const PKI_SYNC_FILTER_LOCK_TTL_MS = 60 * 1000;

export const withPkiSyncFilterLock = async <T>(
  keyStore: Pick<TKeyStoreFactory, "acquireLock">,
  syncId: string,
  run: () => Promise<T>
): Promise<T> => {
  let lock: Awaited<ReturnType<TKeyStoreFactory["acquireLock"]>>;

  try {
    lock = await keyStore.acquireLock([KeyStorePrefixes.PkiSyncFilterLock(syncId)], PKI_SYNC_FILTER_LOCK_TTL_MS, {
      retryCount: 20,
      retryDelay: 500
    });
  } catch (error) {
    logger.error(error, `Failed to acquire the PKI sync filter lock [pkiSyncId=${syncId}]`);
    throw new BadRequestError({
      message: "Another change to this PKI sync's certificates is still being applied. Try again in a moment."
    });
  }

  try {
    return await run();
  } finally {
    await lock.release();
  }
};

const getPkiSyncLinkDestinationTargets = (record: {
  externalIdentifier?: string | null;
  syncMetadata?: unknown;
}): string[] => {
  const files = (record.syncMetadata as { files?: string[] } | null)?.files ?? [];
  return [...(record.externalIdentifier ? [record.externalIdentifier] : []), ...files];
};

export const findPkiSyncUnlinkIdsAtDestination = async (
  pkiSyncId: string,
  unlinkIds: Set<string>,
  certificateSyncDAL: Pick<TCertificateSyncDALFactory, "findByPkiSyncId" | "primaryNode">
) => {
  if (!unlinkIds.size) return [];

  const linkRecords = await certificateSyncDAL.findByPkiSyncId(pkiSyncId, certificateSyncDAL.primaryNode());

  const destinationTargetsStillHeld = new Set(
    linkRecords
      .filter((record) => record.certificateId && !unlinkIds.has(record.certificateId))
      .flatMap((record) => getPkiSyncLinkDestinationTargets(record))
  );

  return linkRecords
    .filter((record) => {
      if (!record.certificateId || !unlinkIds.has(record.certificateId)) return false;

      const targets = getPkiSyncLinkDestinationTargets(record);
      return targets.length > 0 && targets.every((target) => !destinationTargetsStillHeld.has(target));
    })
    .map((record) => record.certificateId);
};

export const assertPkiSyncUnlinkAllowed = async (
  pkiSync: TPkiSyncReconcileTarget,
  diff: TPkiSyncCertificateDiff,
  certificateSyncDAL: Pick<TCertificateSyncDALFactory, "findByPkiSyncId" | "primaryNode">,
  removalOptions?: TPkiSyncRemovalOptions
) => {
  const assertion = getPkiSyncUnlinkAssertion(pkiSync.destination as PkiSync);
  if (!assertion || !diff.toUnlink.length) return;

  const idsAtDestination = await findPkiSyncUnlinkIdsAtDestination(
    pkiSync.id,
    new Set(diff.toUnlink.map((certificate) => certificate.id)),
    certificateSyncDAL
  );
  assertion({
    pkiSync,
    remainingCertificateCount: diff.matched.length,
    unlinkedAtDestinationCount: idsAtDestination.length,
    removalOptions
  });
};

export const describePkiSyncApplication = async (
  applicationId: string | null | undefined,
  pkiApplicationDAL: Pick<TPkiApplicationDALFactory, "findById">
): Promise<{ applicationId?: string; applicationName?: string }> => {
  if (!applicationId) return {};

  const application = await pkiApplicationDAL.findById(applicationId);
  return { applicationId, ...(application?.name ? { applicationName: application.name } : {}) };
};

export const computePkiSyncCertificateDiff = async (
  pkiSync: TPkiSyncReconcileTarget,
  filters: TPkiSyncFilters | null | undefined,
  { certificateDAL, certificateSyncDAL }: Pick<TPkiSyncFilterReconcileDeps, "certificateDAL" | "certificateSyncDAL">
): Promise<TPkiSyncCertificateDiff> => {
  if (!pkiSync.applicationId) return { matched: [], toLink: [], toUnlink: [] };

  const matched = hasAnyPkiSyncFilter(filters)
    ? await certificateDAL.findCertificatesMatchingSyncFilters(filters, {
        projectId: pkiSync.projectId,
        applicationId: pkiSync.applicationId
      })
    : [];

  const linkedIds = await certificateSyncDAL.findCertificateIdsByPkiSyncId(
    pkiSync.id,
    certificateSyncDAL.primaryNode()
  );
  const linkedIdSet = new Set(linkedIds);
  const matchedIdSet = new Set(matched.map((certificate) => certificate.id));

  const toLink = matched.filter((certificate) => !linkedIdSet.has(certificate.id));
  const unlinkIds = linkedIds.filter((id) => !matchedIdSet.has(id));

  const toUnlink: TPkiSyncCertificateRef[] = unlinkIds.length
    ? (await certificateDAL.find({ projectId: pkiSync.projectId, $in: { id: unlinkIds } })).map(
        ({ id, commonName, altNames }) => ({ id, commonName, altNames })
      )
    : [];

  return { matched, toLink, toUnlink };
};

export const assertPkiSyncCanHoldMatchedCertificates = (pkiSync: TPkiSyncReconcileTarget, matchedCount: number) =>
  assertPkiSyncCanHoldCertificateCount(
    pkiSync.destination as PkiSync,
    pkiSync.syncOptions as Record<string, unknown> | undefined,
    pkiSync.destinationConfig,
    matchedCount
  );

export const applyPkiSyncCertificateDiff = async (
  pkiSync: TPkiSyncReconcileTarget,
  diff: TPkiSyncCertificateDiff,
  deps: TPkiSyncFilterReconcileDeps,
  auditLogInfo?: AuditLogInfo,
  writeFilters?: (tx: Knex) => Promise<void>,
  removalOptions?: TPkiSyncRemovalOptions
): Promise<{ linked: TPkiSyncCertificateRef[]; unlinked: TPkiSyncCertificateRef[] }> => {
  const { certificateSyncDAL, pkiSyncQueue, auditLogService, pkiApplicationDAL } = deps;
  const { toLink, toUnlink } = diff;

  const unlinkIds = new Set(toUnlink.map((certificate) => certificate.id));
  const canRemoveCertificates = Boolean(
    (pkiSync.syncOptions as { canRemoveCertificates?: boolean } | undefined)?.canRemoveCertificates
  );

  const idsAtDestination = canRemoveCertificates
    ? await findPkiSyncUnlinkIdsAtDestination(pkiSync.id, unlinkIds, certificateSyncDAL)
    : [];

  const idsOnlyLinked = [...unlinkIds].filter((id) => !idsAtDestination.includes(id));

  await certificateSyncDAL.transaction(async (tx) => {
    if (writeFilters) await writeFilters(tx);

    if (toLink.length > 0) {
      await certificateSyncDAL.addCertificates(
        pkiSync.id,
        toLink.map((certificate) => ({ certificateId: certificate.id })),
        tx
      );
    }

    if (idsOnlyLinked.length > 0) {
      await certificateSyncDAL.removeCertificates(pkiSync.id, idsOnlyLinked, tx);
    }
  });

  if (toLink.length === 0 && toUnlink.length === 0) return { linked: [], unlinked: [] };

  const auditActor: AuditLogInfo = auditLogInfo ?? { actor: { type: ActorType.PLATFORM, metadata: {} } };
  const applicationLabel = await describePkiSyncApplication(pkiSync.applicationId, pkiApplicationDAL);

  if (toLink.length > 0) {
    await auditLogService.createAuditLog({
      ...auditActor,
      projectId: pkiSync.projectId,
      event: {
        type: EventType.PKI_SYNC_LINK_CERTIFICATES,
        metadata: {
          pkiSyncId: pkiSync.id,
          name: pkiSync.name,
          count: toLink.length,
          certificates: toLink.map(({ id, commonName }) => ({ id, commonName })),
          ...applicationLabel
        }
      }
    });
  }

  if (toUnlink.length > 0) {
    if (idsAtDestination.length > 0) {
      await pkiSyncQueue.queuePkiSyncRemoveCertificatesById({
        syncId: pkiSync.id,
        certificateIds: idsAtDestination,
        removalOptions
      });
    }

    await auditLogService.createAuditLog({
      ...auditActor,
      projectId: pkiSync.projectId,
      event: {
        type: EventType.PKI_SYNC_UNLINK_CERTIFICATES,
        metadata: {
          pkiSyncId: pkiSync.id,
          name: pkiSync.name,
          count: toUnlink.length,
          certificates: toUnlink,
          removedFromDestination: idsAtDestination.length > 0,
          ...applicationLabel
        }
      }
    });
  }

  if (toLink.length > 0 && pkiSync.isAutoSyncEnabled) {
    await pkiSyncQueue.queuePkiSyncSyncCertificatesById({ syncId: pkiSync.id });
  }

  return { linked: toLink, unlinked: toUnlink };
};
