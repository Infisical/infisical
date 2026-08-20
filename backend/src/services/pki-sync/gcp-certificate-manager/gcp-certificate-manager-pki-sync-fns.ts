/* eslint-disable no-await-in-loop */
import RE2 from "re2";

import { TCertificateSyncs } from "@app/db/schemas";
import { logger } from "@app/lib/logger";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSyncDALFactory } from "@app/services/certificate-sync/certificate-sync-dal";
import { CertificateSyncStatus } from "@app/services/certificate-sync/certificate-sync-enums";

import { PkiSyncError } from "../pki-sync-errors";
import { TCertificateMap, TPkiSyncSyncResult, TPkiSyncWithCredentials } from "../pki-sync-types";
import { getGcpAccessToken } from "./gcp-certificate-manager-pki-sync-auth-fns";
import {
  createGcpCertificateManagerClient,
  executeWithConcurrencyLimit,
  isCertificateInUseError,
  mapGcpError
} from "./gcp-certificate-manager-pki-sync-client";
import {
  GCP_CERTIFICATE_ID_LABEL_KEY,
  GCP_MANAGED_BY_LABEL_KEY,
  GCP_MANAGED_BY_LABEL_VALUE,
  GCP_MAX_CERTIFICATES_PER_MAP_ENTRY,
  GCP_PRIMARY_MATCHER
} from "./gcp-certificate-manager-pki-sync-constants";
import { GcpCertificateManagerScope } from "./gcp-certificate-manager-pki-sync-enums";
import { assertKeyAlgorithmSupported } from "./gcp-certificate-manager-pki-sync-key-fns";
import {
  buildGcpCertificateMapEntryResourceName,
  buildGcpCertificateResourceName,
  toGcpCertificateId,
  toGcpCertificateMapEntryId
} from "./gcp-certificate-manager-pki-sync-name-fns";
import {
  TGcpCertificate,
  TGcpCertificateManagerPkiSyncConfig,
  TGcpCertificateManagerPkiSyncOptions,
  TGcpCertificateMapEntry
} from "./gcp-certificate-manager-pki-sync-types";
import { buildGcpTooManyCertificatesMessage } from "./gcp-certificate-manager-pki-sync-update-fns";

type TGcpCertificateManagerPkiSyncFactoryDeps = {
  certificateSyncDAL: Pick<
    TCertificateSyncDALFactory,
    | "removeCertificates"
    | "addCertificates"
    | "findByPkiSyncAndCertificate"
    | "updateById"
    | "findByPkiSyncId"
    | "updateSyncStatus"
  >;
  certificateDAL: Pick<TCertificateDALFactory, "findById">;
};

type TPlannedCertificate = { skipReason: string } | { target: TUploadTarget };

type TUploadTarget = {
  key: string;
  certificateId: string;
  resourceName: string;
  pemCertificate: string;
  pemPrivateKey: string;
  infisicalCertificateId?: string;
  renewedFromCertificateId?: string;
  shouldPatch: boolean;
};

const getConfig = (pkiSync: TPkiSyncWithCredentials) => {
  const config = pkiSync.destinationConfig as TGcpCertificateManagerPkiSyncConfig;

  if (!config?.gcpProjectId || !config?.location) {
    throw new PkiSyncError({
      shouldRetry: false,
      message: "GCP Certificate Manager sync is missing its project or location configuration."
    });
  }

  return config;
};

const DASH_REGEX = new RE2("-", "g");

const ENTRY_RESOURCE_NAME_REGEX = new RE2("/certificateMaps/([^/]+)/certificateMapEntries/([^/]+)$");

const buildLabels = (userLabels: TGcpCertificateManagerPkiSyncOptions["labels"], infisicalCertificateId?: string) => ({
  ...Object.fromEntries((userLabels ?? []).map(({ key, value }) => [key, value])),
  [GCP_MANAGED_BY_LABEL_KEY]: GCP_MANAGED_BY_LABEL_VALUE,
  ...(infisicalCertificateId ? { [GCP_CERTIFICATE_ID_LABEL_KEY]: infisicalCertificateId.replace(DASH_REGEX, "") } : {})
});

const isInfisicalManaged = (labels?: Record<string, string>) =>
  labels?.[GCP_MANAGED_BY_LABEL_KEY] === GCP_MANAGED_BY_LABEL_VALUE;

// GCP expects the leaf certificate first, followed by any intermediates. The root is already stripped
// upstream when includeRootCa is disabled.
const buildPemChain = (cert: string, certificateChain?: string) => {
  const leaf = cert.trim();
  const chain = certificateChain?.trim();
  return chain ? `${leaf}\n${chain}` : leaf;
};

export const gcpCertificateManagerPkiSyncFactory = ({
  certificateSyncDAL,
  certificateDAL
}: TGcpCertificateManagerPkiSyncFactoryDeps) => {
  const sameCertificateSet = (current: string[] | undefined, desired: string[]) => {
    if ((current?.length ?? 0) !== desired.length) return false;
    const have = new Set(current ?? []);
    return desired.every((name) => have.has(name));
  };

  const $reconcileCertificateMapEntry = async ({
    client,
    pkiSync,
    gcpProjectId,
    certificateMapBinding,
    certificateResourceNames,
    userLabels
  }: {
    client: ReturnType<typeof createGcpCertificateManagerClient>;
    pkiSync: TPkiSyncWithCredentials;
    gcpProjectId: string;
    certificateMapBinding: NonNullable<TGcpCertificateManagerPkiSyncConfig["certificateMapBinding"]>;
    certificateResourceNames: string[];
    userLabels: TGcpCertificateManagerPkiSyncOptions["labels"];
  }) => {
    const { certificateMap, hostname } = certificateMapBinding;
    const entryId = toGcpCertificateMapEntryId(pkiSync.id);
    const entryResourceName = buildGcpCertificateMapEntryResourceName({ gcpProjectId, certificateMap, entryId });

    let entries: Map<string, TGcpCertificateMapEntry>;
    try {
      entries = await client.listCertificateMapEntries(certificateMap);
    } catch (error) {
      throw mapGcpError(error, {
        operation: "certificate map entry list",
        gcpProjectId,
        resource: `certificate map "${certificateMap}"`,
        permission: "certificatemanager.certificatemapentries.list"
      });
    }

    const existingEntry = entries.get(entryResourceName);

    if (existingEntry && !isInfisicalManaged(existingEntry.labels)) {
      throw new PkiSyncError({
        shouldRetry: false,
        message: `Certificate map entry "${entryId}" already exists in map "${certificateMap}" and is not managed by Infisical. Remove or rename it before enabling certificate map binding.`
      });
    }

    if (!existingEntry && !hostname) {
      const conflictingPrimary = Array.from(entries.values()).find((entry) => entry.matcher === GCP_PRIMARY_MATCHER);
      if (conflictingPrimary) {
        throw new PkiSyncError({
          shouldRetry: false,
          message: `Certificate map "${certificateMap}" already has a primary entry ("${conflictingPrimary.name
            .split("/")
            .pop()}"). Set a hostname on this sync instead.`
        });
      }
    }

    try {
      if (!existingEntry) {
        await client.createCertificateMapEntry({
          certificateMap,
          entryId,
          certificateResourceNames,
          hostname,
          labels: buildLabels(userLabels)
        });
        return;
      }

      // hostname and matcher are immutable on a certificate map entry, so a change to either
      // means deleting and recreating rather than patching
      const desiredMatcher = hostname ? undefined : GCP_PRIMARY_MATCHER;
      if (existingEntry.hostname !== hostname || existingEntry.matcher !== desiredMatcher) {
        await client.deleteCertificateMapEntry({ certificateMap, entryId });
        await client.createCertificateMapEntry({
          certificateMap,
          entryId,
          certificateResourceNames,
          hostname,
          labels: buildLabels(userLabels)
        });
        return;
      }

      if (sameCertificateSet(existingEntry.certificates, certificateResourceNames)) return;

      await client.updateCertificateMapEntryCertificates({
        certificateMap,
        entryId,
        certificateResourceNames,
        labels: buildLabels(userLabels)
      });
    } catch (error) {
      if (error instanceof PkiSyncError) throw error;
      throw mapGcpError(error, {
        operation: existingEntry ? "certificate map entry update" : "certificate map entry creation",
        gcpProjectId,
        resource: `certificate map entry "${entryId}"`,
        permission: existingEntry
          ? "certificatemanager.certificatemapentries.update"
          : "certificatemanager.certificatemapentries.create"
      });
    }
  };

  // A certificate cannot be deleted while a certificate map entry references it, so our entry is
  // removed first when it still points at the certificate being deleted.
  const $detachAndDeleteCertificate = async ({
    client,
    pkiSync,
    gcpProjectId,
    certificateMapBinding,
    certificateId,
    resourceName
  }: {
    client: ReturnType<typeof createGcpCertificateManagerClient>;
    pkiSync: TPkiSyncWithCredentials;
    gcpProjectId: string;
    certificateMapBinding?: TGcpCertificateManagerPkiSyncConfig["certificateMapBinding"];
    certificateId: string;
    resourceName: string;
  }) => {
    if (certificateMapBinding) {
      const entryId = toGcpCertificateMapEntryId(pkiSync.id);
      const entryResourceName = buildGcpCertificateMapEntryResourceName({
        gcpProjectId,
        certificateMap: certificateMapBinding.certificateMap,
        entryId
      });

      try {
        const entries = await client.listCertificateMapEntries(certificateMapBinding.certificateMap);
        const entry = entries.get(entryResourceName);

        if (entry && isInfisicalManaged(entry.labels) && entry.certificates?.includes(resourceName)) {
          const remaining = entry.certificates.filter((name) => name !== resourceName);

          if (remaining.length) {
            await client.updateCertificateMapEntryCertificates({
              certificateMap: certificateMapBinding.certificateMap,
              entryId,
              certificateResourceNames: remaining,
              labels: entry.labels ?? {}
            });
          } else {
            await client.deleteCertificateMapEntry({
              certificateMap: certificateMapBinding.certificateMap,
              entryId
            });
          }
        }
      } catch (error) {
        if (error instanceof PkiSyncError) throw error;
        throw mapGcpError(error, {
          operation: "certificate map entry detach",
          gcpProjectId,
          resource: `certificate map entry "${entryId}" in map "${certificateMapBinding.certificateMap}"`,
          permission: "certificatemanager.certificatemapentries.update"
        });
      }
    }

    try {
      await client.deleteCertificate(certificateId);
    } catch (error) {
      if (error instanceof PkiSyncError) throw error;

      if (isCertificateInUseError(error)) {
        throw new PkiSyncError({
          shouldRetry: false,
          message: `Certificate "${certificateId}" is still referenced by a certificate map entry in GCP project "${gcpProjectId}". Detach it from the certificate map before removing it from this sync.`
        });
      }

      throw mapGcpError(error, {
        operation: "certificate deletion",
        gcpProjectId,
        resource: `certificate "${certificateId}"`,
        permission: "certificatemanager.certificates.delete"
      });
    }
  };

  const $reapOrphanedMapEntries = async ({
    client,
    pkiSync,
    certificates,
    currentCertificateMap
  }: {
    client: ReturnType<typeof createGcpCertificateManagerClient>;
    pkiSync: TPkiSyncWithCredentials;
    certificates: Map<string, TGcpCertificate>;
    currentCertificateMap?: string;
  }) => {
    const entryId = toGcpCertificateMapEntryId(pkiSync.id);
    const orphans = new Map<string, string>();

    certificates.forEach((certificate) => {
      if (!isInfisicalManaged(certificate.labels)) return;
      (certificate.usedBy ?? []).forEach(({ name }) => {
        const match = ENTRY_RESOURCE_NAME_REGEX.exec(name);
        if (!match) return;
        const [, certificateMap, usedEntryId] = match;
        if (usedEntryId !== entryId) return;
        if (certificateMap === currentCertificateMap) return;
        orphans.set(name, certificateMap);
      });
    });

    for (const [name, certificateMap] of orphans) {
      try {
        await client.deleteCertificateMapEntry({ certificateMap, entryId });
        logger.info({ syncId: pkiSync.id, entry: name }, "Removed orphaned GCP certificate map entry");
      } catch (error) {
        logger.warn({ syncId: pkiSync.id, entry: name, error }, "Failed to remove orphaned GCP certificate map entry");
      }
    }
  };

  const $planCertificate = async ({
    certName,
    entry,
    syncRecordsByCertId,
    existingCertificates,
    gcpProjectId,
    location,
    preserveItemOnRenewal
  }: {
    certName: string;
    entry: TCertificateMap[string];
    syncRecordsByCertId: Map<string, TCertificateSyncs>;
    existingCertificates: Map<string, TGcpCertificate>;
    gcpProjectId: string;
    location: string;
    preserveItemOnRenewal: boolean;
  }): Promise<TPlannedCertificate> => {
    const { cert, privateKey, certificateChain, certificateId } = entry;

    const certificate = typeof certificateId === "string" ? await certificateDAL.findById(certificateId) : undefined;
    if (certificate?.renewedByCertificateId) {
      return { skipReason: "Certificate has been renewed and replaced by a newer certificate" };
    }
    const { renewedFromCertificateId } = certificate ?? {};

    if (!cert || !cert.includes("-----BEGIN CERTIFICATE-----")) {
      return { skipReason: "Certificate is missing or not in valid PEM format" };
    }

    if (!privateKey || !privateKey.includes("-----BEGIN")) {
      return { skipReason: "Private key is missing or not in valid PEM format" };
    }

    try {
      assertKeyAlgorithmSupported(cert);
    } catch (error) {
      return { skipReason: error instanceof Error ? error.message : "Unsupported key algorithm" };
    }

    const syncRecordLookupId = renewedFromCertificateId || certificateId;
    const existingSyncRecord =
      typeof syncRecordLookupId === "string" ? syncRecordsByCertId.get(syncRecordLookupId) : undefined;
    const reusableResourceName =
      preserveItemOnRenewal &&
      existingSyncRecord?.externalIdentifier &&
      existingCertificates.has(existingSyncRecord.externalIdentifier)
        ? existingSyncRecord.externalIdentifier
        : undefined;

    const gcpCertificateId = reusableResourceName
      ? (reusableResourceName.split("/").pop() as string)
      : toGcpCertificateId(certName);
    const resourceName = buildGcpCertificateResourceName({ gcpProjectId, location, certificateId: gcpCertificateId });
    const existing = existingCertificates.get(resourceName);

    if (existing && !isInfisicalManaged(existing.labels)) {
      return {
        skipReason: `A certificate named "${gcpCertificateId}" already exists in GCP and is not managed by Infisical. Rename the certificate name schema or remove the existing certificate.`
      };
    }

    return {
      target: {
        key: certName,
        certificateId: gcpCertificateId,
        resourceName,
        pemCertificate: buildPemChain(cert, certificateChain),
        pemPrivateKey: privateKey.trim(),
        infisicalCertificateId: certificateId,
        renewedFromCertificateId: renewedFromCertificateId ?? undefined,
        shouldPatch: Boolean(existing)
      }
    };
  };

  const $planUploads = async ({
    certificateMap,
    syncRecordsByCertId,
    existingCertificates,
    gcpProjectId,
    location,
    preserveItemOnRenewal
  }: {
    certificateMap: TCertificateMap;
    syncRecordsByCertId: Map<string, TCertificateSyncs>;
    existingCertificates: Map<string, TGcpCertificate>;
    gcpProjectId: string;
    location: string;
    preserveItemOnRenewal: boolean;
  }) => {
    const skippedCertificates: Array<{ name: string; reason: string }> = [];
    const uploadTargets: TUploadTarget[] = [];
    const activeResourceNames = new Set<string>();
    const trackedCertificateIds = new Set<string>();

    for (const [certName, entry] of Object.entries(certificateMap)) {
      if (entry.certificateId) trackedCertificateIds.add(entry.certificateId);

      const planned = await $planCertificate({
        certName,
        entry,
        syncRecordsByCertId,
        existingCertificates,
        gcpProjectId,
        location,
        preserveItemOnRenewal
      });

      if ("skipReason" in planned) {
        skippedCertificates.push({ name: certName, reason: planned.skipReason });
      } else {
        activeResourceNames.add(planned.target.resourceName);
        uploadTargets.push(planned.target);
      }
    }

    return { uploadTargets, skippedCertificates, activeResourceNames, trackedCertificateIds };
  };

  const $uploadCertificate = async ({
    client,
    pkiSync,
    target,
    gcpProjectId,
    scope,
    userLabels
  }: {
    client: ReturnType<typeof createGcpCertificateManagerClient>;
    pkiSync: TPkiSyncWithCredentials;
    target: TUploadTarget;
    gcpProjectId: string;
    scope: GcpCertificateManagerScope;
    userLabels: TGcpCertificateManagerPkiSyncOptions["labels"];
  }) => {
    try {
      await client.upsertCertificate({
        certificateId: target.certificateId,
        pemCertificate: target.pemCertificate,
        pemPrivateKey: target.pemPrivateKey,
        labels: buildLabels(userLabels, target.infisicalCertificateId),
        scope,
        shouldPatch: target.shouldPatch
      });
    } catch (error) {
      if (error instanceof PkiSyncError) throw error;
      throw mapGcpError(error, {
        operation: target.shouldPatch ? "certificate update" : "certificate upload",
        gcpProjectId,
        resource: `certificate "${target.certificateId}"`,
        permission: target.shouldPatch
          ? "certificatemanager.certificates.update"
          : "certificatemanager.certificates.create"
      });
    }

    if (!target.infisicalCertificateId) return target;

    const existingCertSync = await certificateSyncDAL.findByPkiSyncAndCertificate(
      pkiSync.id,
      target.infisicalCertificateId
    );

    if (existingCertSync) {
      await certificateSyncDAL.updateById(existingCertSync.id, {
        externalIdentifier: target.resourceName,
        syncStatus: CertificateSyncStatus.Succeeded,
        lastSyncedAt: new Date()
      });
    } else {
      await certificateSyncDAL.addCertificates(pkiSync.id, [
        { certificateId: target.infisicalCertificateId, externalIdentifier: target.resourceName }
      ]);
    }

    if (target.renewedFromCertificateId) {
      await certificateSyncDAL.removeCertificates(pkiSync.id, [target.renewedFromCertificateId]);
    }

    return target;
  };

  const $removeStaleCertificates = async ({
    client,
    pkiSync,
    gcpProjectId,
    certificateMapBinding,
    existingSyncRecords,
    existingCertificates,
    activeResourceNames,
    uploadedCertificateIds,
    trackedCertificateIds
  }: {
    client: ReturnType<typeof createGcpCertificateManagerClient>;
    pkiSync: TPkiSyncWithCredentials;
    gcpProjectId: string;
    certificateMapBinding?: TGcpCertificateManagerPkiSyncConfig["certificateMapBinding"];
    existingSyncRecords: TCertificateSyncs[];
    existingCertificates: Map<string, TGcpCertificate>;
    activeResourceNames: Set<string>;
    uploadedCertificateIds: Set<string>;
    trackedCertificateIds: Set<string>;
  }) => {
    const candidates = existingSyncRecords.flatMap((record) => {
      const { externalIdentifier, certificateId } = record;
      if (!externalIdentifier || !certificateId) return [];
      if (activeResourceNames.has(externalIdentifier) || !existingCertificates.has(externalIdentifier)) return [];
      if (trackedCertificateIds.has(certificateId) && !uploadedCertificateIds.has(certificateId)) return [];

      return [
        {
          certificateId: externalIdentifier.split("/").pop() as string,
          resourceName: externalIdentifier,
          infisicalCertificateId: certificateId,
          keepSyncRecord: uploadedCertificateIds.has(certificateId)
        }
      ];
    });

    let removed = 0;
    const failedRemovals: Array<{ name: string; error: string }> = [];

    for (const candidate of candidates) {
      try {
        await $detachAndDeleteCertificate({
          client,
          pkiSync,
          gcpProjectId,
          certificateMapBinding,
          certificateId: candidate.certificateId,
          resourceName: candidate.resourceName
        });
        if (!candidate.keepSyncRecord) {
          await certificateSyncDAL.removeCertificates(pkiSync.id, [candidate.infisicalCertificateId]);
        }
        removed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        failedRemovals.push({ name: candidate.certificateId, error: message });
        await certificateSyncDAL.updateSyncStatus(
          pkiSync.id,
          candidate.infisicalCertificateId,
          CertificateSyncStatus.Failed,
          message
        );
        logger.warn(
          { syncId: pkiSync.id, certificateId: candidate.certificateId, error },
          "Failed to remove certificate from GCP Certificate Manager"
        );
      }
    }

    return { removed, failedRemovals };
  };

  const syncCertificates = async (
    pkiSync: TPkiSyncWithCredentials,
    certificateMap: TCertificateMap
  ): Promise<TPkiSyncSyncResult> => {
    const { gcpProjectId, location, scope, certificateMapBinding } = getConfig(pkiSync);
    const syncOptions = pkiSync.syncOptions as TGcpCertificateManagerPkiSyncOptions | undefined;
    const canRemoveCertificates = syncOptions?.canRemoveCertificates ?? true;
    const userLabels = syncOptions?.labels;

    const accessToken = await getGcpAccessToken(pkiSync);
    const client = createGcpCertificateManagerClient({ accessToken, gcpProjectId, location, syncId: pkiSync.id });

    if (certificateMapBinding) {
      try {
        await client.assertCertificateMapExists(certificateMapBinding.certificateMap);
      } catch (error) {
        throw mapGcpError(error, {
          operation: "certificate map lookup",
          gcpProjectId,
          resource: `certificate map "${certificateMapBinding.certificateMap}"`,
          permission: "certificatemanager.certificatemaps.get"
        });
      }
    }

    let existingCertificates: Map<string, TGcpCertificate>;
    try {
      existingCertificates = await client.listCertificates();
    } catch (error) {
      throw mapGcpError(error, {
        operation: "certificate list",
        gcpProjectId,
        permission: "certificatemanager.certificates.list"
      });
    }

    const existingSyncRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);
    const syncRecordsByCertId = new Map<string, TCertificateSyncs>();
    existingSyncRecords.forEach((record) => {
      if (record.certificateId) syncRecordsByCertId.set(record.certificateId, record);
    });

    const { uploadTargets, skippedCertificates, activeResourceNames, trackedCertificateIds } = await $planUploads({
      certificateMap,
      syncRecordsByCertId,
      existingCertificates,
      gcpProjectId,
      location,
      preserveItemOnRenewal: syncOptions?.preserveItemOnRenewal ?? true
    });

    if (certificateMapBinding && uploadTargets.length > GCP_MAX_CERTIFICATES_PER_MAP_ENTRY) {
      throw new PkiSyncError({
        shouldRetry: false,
        message: buildGcpTooManyCertificatesMessage(certificateMapBinding.certificateMap, uploadTargets.length)
      });
    }

    const uploadResults = await executeWithConcurrencyLimit(
      uploadTargets,
      (target) => $uploadCertificate({ client, pkiSync, target, gcpProjectId, scope, userLabels }),
      { operation: "upload-certificates", syncId: pkiSync.id }
    );

    const successfulUploads = uploadResults.filter(
      (result): result is PromiseFulfilledResult<TUploadTarget> => result.status === "fulfilled"
    );

    await $reapOrphanedMapEntries({
      client,
      pkiSync,
      certificates: existingCertificates,
      currentCertificateMap: certificateMapBinding?.certificateMap
    });

    let failedMapEntry: string | undefined;
    if (certificateMapBinding && successfulUploads.length) {
      try {
        await $reconcileCertificateMapEntry({
          client,
          pkiSync,
          gcpProjectId,
          certificateMapBinding,
          certificateResourceNames: successfulUploads.map(({ value }) => value.resourceName),
          userLabels
        });
      } catch (error) {
        failedMapEntry = error instanceof Error ? error.message : "Unknown error";
        logger.error(
          { syncId: pkiSync.id, certificateMap: certificateMapBinding.certificateMap, error },
          "Certificates synced to GCP Certificate Manager but the certificate map entry could not be reconciled"
        );
      }
    }

    const { removed, failedRemovals } = canRemoveCertificates
      ? await $removeStaleCertificates({
          client,
          pkiSync,
          gcpProjectId,
          certificateMapBinding,
          existingSyncRecords,
          existingCertificates,
          activeResourceNames,
          trackedCertificateIds,
          uploadedCertificateIds: new Set(
            successfulUploads.map(({ value }) => value.infisicalCertificateId).filter((id): id is string => Boolean(id))
          )
        })
      : { removed: 0, failedRemovals: [] };

    const failedUploads = uploadResults
      .map((result, index) => ({ result, target: uploadTargets[index] }))
      .filter(({ result }) => result.status === "rejected")
      .map(({ result, target }) => ({
        name: target?.key ?? "unknown",
        error:
          (result as PromiseRejectedResult).reason instanceof Error
            ? ((result as PromiseRejectedResult).reason as Error).message
            : "Unknown error"
      }));

    if (failedUploads.length) {
      logger.error(
        { syncId: pkiSync.id, failedUploads },
        "Some certificates failed to sync to GCP Certificate Manager"
      );
    }

    const details: TPkiSyncSyncResult["details"] = {};
    if (skippedCertificates.length) details.skippedCertificates = skippedCertificates;
    if (failedUploads.length) details.failedUploads = failedUploads;
    if (failedRemovals.length) details.failedRemovals = failedRemovals;
    const partialFailureMessage = failedMapEntry
      ? `${successfulUploads.length} certificate(s) reached GCP Certificate Manager, but the certificate map entry could not be updated: ${failedMapEntry}`
      : undefined;

    return {
      uploaded: successfulUploads.length,
      removed,
      failedRemovals: failedRemovals.length,
      skipped: skippedCertificates.length,
      details: Object.keys(details).length ? details : undefined,
      partialFailureMessage
    };
  };

  const removeCertificates = async (
    pkiSync: TPkiSyncWithCredentials,
    certificateNames: string[],
    deps?: { certificateSyncDAL?: TCertificateSyncDALFactory; certificateMap?: TCertificateMap }
  ) => {
    const { gcpProjectId, location, certificateMapBinding } = getConfig(pkiSync);

    const accessToken = await getGcpAccessToken(pkiSync);
    const client = createGcpCertificateManagerClient({ accessToken, gcpProjectId, location, syncId: pkiSync.id });

    const existingSyncRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);
    const targets = certificateNames.flatMap((certName) => {
      const infisicalCertificateId = deps?.certificateMap?.[certName]?.certificateId;
      if (!infisicalCertificateId) return [];

      const record = existingSyncRecords.find((row) => row.certificateId === infisicalCertificateId);
      if (!record?.externalIdentifier) return [];

      return [
        {
          certificateId: record.externalIdentifier.split("/").pop() as string,
          resourceName: record.externalIdentifier,
          infisicalCertificateId
        }
      ];
    });

    if (!targets.length) {
      return { removed: 0, failed: 0, skipped: certificateNames.length };
    }

    const failures: string[] = [];
    let removed = 0;

    for (const target of targets) {
      try {
        await $detachAndDeleteCertificate({
          client,
          pkiSync,
          gcpProjectId,
          certificateMapBinding,
          certificateId: target.certificateId,
          resourceName: target.resourceName
        });
        await certificateSyncDAL.removeCertificates(pkiSync.id, [target.infisicalCertificateId]);
        removed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        failures.push(message);
        await certificateSyncDAL.updateSyncStatus(
          pkiSync.id,
          target.infisicalCertificateId,
          CertificateSyncStatus.Failed,
          message
        );
      }
    }

    if (failures.length) {
      throw new PkiSyncError({
        shouldRetry: false,
        message: `Failed to remove ${failures.length} certificate(s) from GCP Certificate Manager: ${failures.join("; ")}`,
        context: { totalCertificates: targets.length, failedCount: failures.length }
      });
    }

    return { removed, failed: 0, skipped: certificateNames.length - targets.length };
  };

  return {
    syncCertificates,
    removeCertificates
  };
};
