/* eslint-disable no-continue */
/* eslint-disable no-await-in-loop */
import { TCertificateSyncs } from "@app/db/schemas";
import {
  createChefDataBagItem,
  listChefDataBagItems,
  removeChefDataBagItem,
  updateChefDataBagItem
} from "@app/ee/services/app-connections/chef";
import { TChefDataBagItemContent } from "@app/ee/services/secret-sync/chef";
import { logger } from "@app/lib/logger";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSyncDALFactory } from "@app/services/certificate-sync/certificate-sync-dal";
import { CertificateSyncStatus } from "@app/services/certificate-sync/certificate-sync-enums";
import { createConnectionQueue, RateLimitConfig } from "@app/services/connection-queue";
import { matchesCertificateNameSchema } from "@app/services/pki-sync/pki-sync-fns";
import { TCertificateMap, TPkiSyncWithCredentials } from "@app/services/pki-sync/pki-sync-types";

import { CHEF_PKI_SYNC_DEFAULTS } from "./chef-pki-sync-constants";
import { ChefCertificateDataBagItem, SyncCertificatesResult, TChefPkiSyncWithCredentials } from "./chef-pki-sync-types";

const CHEF_RATE_LIMIT_CONFIG: RateLimitConfig = {
  MAX_CONCURRENT_REQUESTS: 5, // Chef servers generally have lower rate limits
  BASE_DELAY: 1500,
  MAX_DELAY: 30000,
  MAX_RETRIES: 3,
  RATE_LIMIT_STATUS_CODES: [429, 503]
};

const chefConnectionQueue = createConnectionQueue(CHEF_RATE_LIMIT_CONFIG);
const { withRateLimitRetry } = chefConnectionQueue;

const isInfisicalManagedCertificate = (certificateName: string, pkiSync: TPkiSyncWithCredentials): boolean => {
  const syncOptions = pkiSync.syncOptions as { certificateNameSchema?: string } | undefined;
  const certificateNameSchema = syncOptions?.certificateNameSchema;

  if (certificateNameSchema) {
    const environment = CHEF_PKI_SYNC_DEFAULTS.DEFAULT_ENVIRONMENT;
    return matchesCertificateNameSchema(certificateName, environment, certificateNameSchema);
  }

  return certificateName.startsWith(CHEF_PKI_SYNC_DEFAULTS.INFISICAL_PREFIX);
};

const parseErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    const { message } = error as { message: unknown };
    if (typeof message === "string") {
      return message;
    }
  }

  return "Unknown error occurred";
};

type TChefPkiSyncFactoryDeps = {
  certificateDAL: Pick<TCertificateDALFactory, "findById">;
  certificateSyncDAL: Pick<
    TCertificateSyncDALFactory,
    | "removeCertificates"
    | "addCertificates"
    | "findByPkiSyncAndCertificate"
    | "updateById"
    | "findByPkiSyncId"
    | "updateSyncStatus"
  >;
};

export const chefPkiSyncFactory = ({ certificateDAL, certificateSyncDAL }: TChefPkiSyncFactoryDeps) => {
  const $getChefDataBagItems = async (
    pkiSync: TChefPkiSyncWithCredentials,
    syncId = "unknown"
  ): Promise<Record<string, boolean>> => {
    const {
      connection,
      destinationConfig: { dataBagName }
    } = pkiSync;
    const { serverUrl, userName, privateKey, orgName } = connection.credentials;

    const dataBagItems = await withRateLimitRetry(
      () =>
        listChefDataBagItems(
          {
            credentials: { serverUrl, userName, privateKey, orgName }
          } as Parameters<typeof listChefDataBagItems>[0],
          dataBagName
        ),
      {
        operation: "list-chef-data-bag-items",
        syncId
      }
    );

    const chefDataBagItems: Record<string, boolean> = {};
    dataBagItems.forEach((item) => {
      chefDataBagItems[item.name] = true;
    });

    return chefDataBagItems;
  };

  const syncCertificates = async (
    pkiSync: TPkiSyncWithCredentials,
    certificateMap: TCertificateMap
  ): Promise<SyncCertificatesResult> => {
    const chefPkiSync = pkiSync as unknown as TChefPkiSyncWithCredentials;
    const {
      connection,
      destinationConfig: { dataBagName }
    } = chefPkiSync;
    const { serverUrl, userName, privateKey, orgName } = connection.credentials;

    const chefDataBagItems = await $getChefDataBagItems(chefPkiSync, pkiSync.id);

    const existingSyncRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);
    const syncRecordsByCertId = new Map<string, TCertificateSyncs>();
    const syncRecordsByExternalId = new Map<string, TCertificateSyncs>();

    existingSyncRecords.forEach((record: TCertificateSyncs) => {
      if (record.certificateId) {
        syncRecordsByCertId.set(record.certificateId, record);
      }
      if (record.externalIdentifier) {
        syncRecordsByExternalId.set(record.externalIdentifier, record);
      }
    });

    type CertificateUploadData = {
      key: string;
      name: string;
      cert: string;
      privateKey: string;
      certificateChain?: string;
      caCertificate?: string;
      certificateId: string;
      isUpdate: boolean;
      targetItemName: string;
      oldCertificateIdToRemove?: string;
    };

    const setCertificates: CertificateUploadData[] = [];

    const validationErrors: Array<{ name: string; error: string }> = [];

    const syncOptions = pkiSync.syncOptions as
      | {
          canRemoveCertificates?: boolean;
          preserveItemOnRenewal?: boolean;
          fieldMappings?: {
            certificate?: string;
            privateKey?: string;
            certificateChain?: string;
            caCertificate?: string;
            metadata?: string;
          };
        }
      | undefined;
    const canRemoveCertificates = syncOptions?.canRemoveCertificates ?? true;
    const preserveItemOnRenewal = syncOptions?.preserveItemOnRenewal ?? true;

    const fieldMappings = {
      certificate: syncOptions?.fieldMappings?.certificate ?? "certificate",
      privateKey: syncOptions?.fieldMappings?.privateKey ?? "private_key",
      certificateChain: syncOptions?.fieldMappings?.certificateChain ?? "certificate_chain",
      caCertificate: syncOptions?.fieldMappings?.caCertificate ?? "ca_certificate"
    };

    const activeExternalIdentifiers = new Set<string>();

    for (const [certName, certData] of Object.entries(certificateMap)) {
      const { cert, privateKey: certPrivateKey, certificateChain, caCertificate, certificateId } = certData;

      if (!cert || cert.trim().length === 0) {
        validationErrors.push({
          name: certName,
          error: "Certificate content is empty or missing"
        });
        continue;
      }

      if (!certPrivateKey || certPrivateKey.trim().length === 0) {
        validationErrors.push({
          name: certName,
          error: "Private key content is empty or missing"
        });
        continue;
      }

      if (!certificateId || typeof certificateId !== "string") {
        continue;
      }

      const targetCertificateName = certName;

      const certificate = await certificateDAL.findById(certificateId);

      if (certificate?.renewedByCertificateId) {
        continue;
      }

      const syncRecordLookupId = certificate?.renewedFromCertificateId || certificateId;
      const existingSyncRecord = syncRecordsByCertId.get(syncRecordLookupId);

      let shouldProcess = true;
      let isUpdate = false;
      let targetItemName = targetCertificateName;

      if (existingSyncRecord?.externalIdentifier) {
        const existingChefItem = chefDataBagItems[existingSyncRecord.externalIdentifier];

        if (existingChefItem) {
          if (certificate?.renewedFromCertificateId && preserveItemOnRenewal) {
            targetItemName = existingSyncRecord.externalIdentifier;
            isUpdate = true;
          } else if (!certificate?.renewedFromCertificateId) {
            shouldProcess = false;
          }
        }
      }

      if (!shouldProcess) {
        continue;
      }

      setCertificates.push({
        key: certName,
        name: certName,
        cert,
        privateKey: certPrivateKey,
        certificateChain,
        caCertificate,
        certificateId,
        isUpdate,
        targetItemName,
        oldCertificateIdToRemove:
          certificate?.renewedFromCertificateId && preserveItemOnRenewal
            ? certificate.renewedFromCertificateId
            : undefined
      });

      activeExternalIdentifiers.add(targetItemName);
    }

    type UploadResult =
      | { status: "fulfilled"; certificate: CertificateUploadData }
      | { status: "rejected"; certificate: CertificateUploadData; error: unknown };

    const uploadPromises = setCertificates.map(async (certificateData): Promise<UploadResult> => {
      const {
        targetItemName,
        cert,
        privateKey: certPrivateKey,
        certificateChain,
        caCertificate,
        certificateId
      } = certificateData;

      try {
        const chefDataBagItem: ChefCertificateDataBagItem = {
          id: targetItemName,
          [fieldMappings.certificate]: cert,
          [fieldMappings.privateKey]: certPrivateKey,
          ...(certificateChain && { [fieldMappings.certificateChain]: certificateChain }),
          ...(caCertificate && { [fieldMappings.caCertificate]: caCertificate })
        };

        const itemExists = chefDataBagItems[targetItemName] === true;

        if (itemExists) {
          await withRateLimitRetry(
            () =>
              updateChefDataBagItem({
                serverUrl,
                userName,
                privateKey,
                orgName,
                dataBagName,
                dataBagItemName: targetItemName,
                data: chefDataBagItem as unknown as TChefDataBagItemContent
              }),
            {
              operation: "update-chef-data-bag-item",
              syncId: pkiSync.id
            }
          );
        } else {
          await withRateLimitRetry(
            () =>
              createChefDataBagItem({
                serverUrl,
                userName,
                privateKey,
                orgName,
                dataBagName,
                data: chefDataBagItem as unknown as TChefDataBagItemContent
              }),
            {
              operation: "create-chef-data-bag-item",
              syncId: pkiSync.id
            }
          );
        }

        return { status: "fulfilled" as const, certificate: certificateData };
      } catch (error) {
        logger.error(
          {
            syncId: pkiSync.id,
            certificateId,
            targetItemName,
            error: error instanceof Error ? error.message : String(error)
          },
          "Failed to sync certificate to Chef"
        );
        return { status: "rejected" as const, certificate: certificateData, error };
      }
    });

    const uploadResults = await Promise.allSettled(uploadPromises);

    const successfulUploads = uploadResults.filter(
      (result): result is PromiseFulfilledResult<UploadResult> =>
        result.status === "fulfilled" && result.value.status === "fulfilled"
    );
    const failedUploads = uploadResults.filter(
      (
        result
      ): result is
        | PromiseRejectedResult
        | PromiseFulfilledResult<{ status: "rejected"; certificate: CertificateUploadData; error: unknown }> =>
        result.status === "rejected" || (result.status === "fulfilled" && result.value.status === "rejected")
    );

    let removedCount = 0;
    let failedRemovals: Array<{ name: string; error: string }> = [];

    if (canRemoveCertificates) {
      const itemsToRemove: string[] = [];

      Object.keys(chefDataBagItems).forEach((itemName) => {
        if (!activeExternalIdentifiers.has(itemName) && isInfisicalManagedCertificate(itemName, pkiSync)) {
          itemsToRemove.push(itemName);
        }
      });

      if (itemsToRemove.length > 0) {
        const removalPromises = itemsToRemove.map(async (itemName) => {
          try {
            await withRateLimitRetry(
              () =>
                removeChefDataBagItem({
                  serverUrl,
                  userName,
                  privateKey,
                  orgName,
                  dataBagName,
                  dataBagItemName: itemName
                }),
              {
                operation: "remove-chef-data-bag-item",
                syncId: pkiSync.id
              }
            );

            const syncRecord = syncRecordsByExternalId.get(itemName);
            if (syncRecord?.certificateId) {
              await certificateSyncDAL.removeCertificates(pkiSync.id, [syncRecord.certificateId]);
            }

            return { status: "fulfilled" as const, itemName };
          } catch (error) {
            logger.error(
              {
                syncId: pkiSync.id,
                itemName,
                error: error instanceof Error ? error.message : String(error)
              },
              "Failed to remove Chef data bag item"
            );
            return { status: "rejected" as const, itemName, error };
          }
        });

        const removalResults = await Promise.allSettled(removalPromises);

        const successfulRemovals = removalResults.filter(
          (result): result is PromiseFulfilledResult<{ status: "fulfilled"; itemName: string }> =>
            result.status === "fulfilled" && result.value.status === "fulfilled"
        );
        removedCount = successfulRemovals.length;

        const failedRemovalPromises = removalResults.filter(
          (
            result
          ): result is
            | PromiseRejectedResult
            | PromiseFulfilledResult<{ status: "rejected"; itemName: string; error: unknown }> =>
            result.status === "rejected" || (result.status === "fulfilled" && result.value.status === "rejected")
        );

        failedRemovals = failedRemovalPromises.map((result) => {
          if (result.status === "rejected") {
            return {
              name: "unknown",
              error: parseErrorMessage(result.reason)
            };
          }
          const { itemName, error } = result.value;
          return {
            name: String(itemName),
            error: parseErrorMessage(error)
          };
        });
      }
    }

    for (const result of successfulUploads) {
      const { certificateId, targetItemName, oldCertificateIdToRemove } = result.value.certificate;

      if (certificateId && typeof certificateId === "string") {
        const existingCertSync = await certificateSyncDAL.findByPkiSyncAndCertificate(pkiSync.id, certificateId);
        if (existingCertSync) {
          await certificateSyncDAL.updateById(existingCertSync.id, {
            externalIdentifier: targetItemName,
            syncStatus: CertificateSyncStatus.Succeeded,
            lastSyncedAt: new Date(),
            lastSyncMessage: "Certificate successfully synced to destination"
          });
        } else {
          await certificateSyncDAL.addCertificates(pkiSync.id, [
            {
              certificateId,
              externalIdentifier: targetItemName
            }
          ]);

          const newCertSync = await certificateSyncDAL.findByPkiSyncAndCertificate(pkiSync.id, certificateId);
          if (newCertSync) {
            await certificateSyncDAL.updateById(newCertSync.id, {
              syncStatus: CertificateSyncStatus.Succeeded,
              lastSyncedAt: new Date(),
              lastSyncMessage: "Certificate successfully synced to destination"
            });
          }
        }

        if (oldCertificateIdToRemove) {
          await certificateSyncDAL.removeCertificates(pkiSync.id, [oldCertificateIdToRemove]);
        }
      }
    }

    await Promise.all(
      failedUploads.map(async (result) => {
        let certificateId: string;
        let errorMessage: string;

        if (result.status === "rejected") {
          certificateId = "unknown";
          errorMessage = result.reason instanceof Error ? result.reason.message : String(result.reason);
          return;
        }

        const { certificate, error } = result.value;
        certificateId = certificate.certificateId;
        errorMessage = error instanceof Error ? error.message : String(error);

        const existingSyncRecord = syncRecordsByCertId.get(certificateId);
        if (existingSyncRecord) {
          await certificateSyncDAL.updateSyncStatus(
            pkiSync.id,
            certificateId,
            CertificateSyncStatus.Failed,
            errorMessage
          );
        }
      })
    );

    return {
      uploaded: successfulUploads.filter((result) => !result.value.certificate.isUpdate).length,
      updated: successfulUploads.filter((result) => result.value.certificate.isUpdate).length,
      removed: removedCount,
      failedRemovals: failedRemovals.length,
      skipped: validationErrors.length,
      details: {
        failedUploads: failedUploads.map((result) => {
          if (result.status === "rejected") {
            return {
              name: "unknown",
              error: result.reason instanceof Error ? result.reason.message : String(result.reason)
            };
          }
          const { certificate, error } = result.value;
          return {
            name: certificate.name,
            error: error instanceof Error ? error.message : String(error)
          };
        }),
        failedRemovals,
        validationErrors
      }
    };
  };

  const importCertificates = async (): Promise<SyncCertificatesResult> => {
    throw new Error("Chef PKI Sync does not support importing certificates from Chef data bags");
  };

  const removeCertificates = async (
    sync: TPkiSyncWithCredentials,
    certificateNames: string[],
    deps?: { certificateSyncDAL?: TCertificateSyncDALFactory; certificateMap?: TCertificateMap }
  ): Promise<void> => {
    const chefPkiSync = sync as unknown as TChefPkiSyncWithCredentials;
    const {
      connection,
      destinationConfig: { dataBagName }
    } = chefPkiSync;
    const { serverUrl, userName, privateKey, orgName } = connection.credentials;

    const existingSyncRecords = await certificateSyncDAL.findByPkiSyncId(sync.id);
    const certificateIdsToRemove: string[] = [];
    const itemsToRemove: string[] = [];

    for (const certName of certificateNames) {
      const certificateData = deps?.certificateMap?.[certName];
      if (certificateData?.certificateId && typeof certificateData.certificateId === "string") {
        const syncRecord = existingSyncRecords.find((record) => record.certificateId === certificateData.certificateId);
        if (syncRecord) {
          certificateIdsToRemove.push(certificateData.certificateId);
          if (syncRecord.externalIdentifier) {
            itemsToRemove.push(syncRecord.externalIdentifier);
          }
        }
      } else {
        const targetName = certName;
        const syncRecord = existingSyncRecords.find((record) => record.externalIdentifier === targetName);
        if (syncRecord && syncRecord.certificateId) {
          certificateIdsToRemove.push(syncRecord.certificateId);
          itemsToRemove.push(targetName);
        }
      }
    }

    const removalPromises = itemsToRemove.map(async (itemName) => {
      try {
        await withRateLimitRetry(
          () =>
            removeChefDataBagItem({
              serverUrl,
              userName,
              privateKey,
              orgName,
              dataBagName,
              dataBagItemName: itemName
            }),
          {
            operation: "remove-chef-data-bag-item",
            syncId: sync.id
          }
        );
      } catch (error) {
        logger.error(
          {
            syncId: sync.id,
            itemName,
            error: error instanceof Error ? error.message : String(error)
          },
          "Failed to remove Chef data bag item during certificate removal"
        );
      }
    });

    await Promise.allSettled(removalPromises);

    if (certificateIdsToRemove.length > 0) {
      await certificateSyncDAL.removeCertificates(sync.id, certificateIdsToRemove);
    }
  };

  return {
    syncCertificates,
    importCertificates,
    removeCertificates
  };
};
