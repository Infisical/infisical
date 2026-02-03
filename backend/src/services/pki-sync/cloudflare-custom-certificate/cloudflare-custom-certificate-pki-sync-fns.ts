/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import { TCertificateSyncs } from "@app/db/schemas";
import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSyncDALFactory } from "@app/services/certificate-sync/certificate-sync-dal";
import { CertificateSyncStatus } from "@app/services/certificate-sync/certificate-sync-enums";
import { createConnectionQueue, RateLimitConfig } from "@app/services/connection-queue";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { TCertificateMap } from "@app/services/pki-sync/pki-sync-types";

import { PkiSyncError } from "../pki-sync-errors";
import { TPkiSyncWithCredentials } from "../pki-sync-types";
import {
  CloudflareEdgeCertificate,
  TCloudflareCustomCertificatePkiSyncConfig
} from "./cloudflare-custom-certificate-pki-sync-types";

const CLOUDFLARE_RATE_LIMIT_CONFIG: RateLimitConfig = {
  MAX_CONCURRENT_REQUESTS: 5,
  BASE_DELAY: 1000,
  MAX_DELAY: 30000,
  MAX_RETRIES: 3,
  RATE_LIMIT_STATUS_CODES: [429, 503]
};

const cloudflareConnectionQueue = createConnectionQueue(CLOUDFLARE_RATE_LIMIT_CONFIG);

const { withRateLimitRetry, executeWithConcurrencyLimit } = cloudflareConnectionQueue;

type TCloudflareCustomCertificatePkiSyncFactoryDeps = {
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

const getCloudflareApiToken = (pkiSync: TPkiSyncWithCredentials) => {
  const credentials = pkiSync.connection.credentials as { apiToken: string; accountId: string };
  if (!credentials?.apiToken) {
    throw new PkiSyncError({
      message: "Cloudflare API token not found in connection credentials"
    });
  }
  return credentials.apiToken;
};

export const cloudflareCustomCertificatePkiSyncFactory = ({
  certificateSyncDAL,
  certificateDAL
}: TCloudflareCustomCertificatePkiSyncFactoryDeps) => {
  const listCloudflareEdgeCertificates = async (
    apiToken: string,
    zoneId: string,
    syncId = "unknown"
  ): Promise<Map<string, CloudflareEdgeCertificate>> => {
    const certificates = new Map<string, CloudflareEdgeCertificate>();

    let page = 1;
    const perPage = 50;
    let totalPages = 1;

    while (page <= totalPages) {
      const currentPage = page;
      const response = await withRateLimitRetry(
        () =>
          request.get<{
            result: CloudflareEdgeCertificate[];
            result_info: { page: number; per_page: number; total_pages: number; total_count: number };
          }>(
            `${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/zones/${encodeURIComponent(zoneId)}/custom_certificates`,
            {
              headers: {
                Authorization: `Bearer ${apiToken}`,
                "Content-Type": "application/json"
              },
              params: {
                page: currentPage,
                per_page: perPage
              }
            }
          ),
        { operation: "list-edge-certificates", syncId }
      );

      for (const cert of response.data.result) {
        certificates.set(cert.id, cert);
      }

      totalPages = response.data.result_info.total_pages;
      page += 1;
    }

    return certificates;
  };

  const syncCertificates = async (pkiSync: TPkiSyncWithCredentials, certificateMap: TCertificateMap) => {
    const apiToken = getCloudflareApiToken(pkiSync);

    const destinationConfig = pkiSync.destinationConfig as TCloudflareCustomCertificatePkiSyncConfig;
    const { zoneId } = destinationConfig;

    if (!zoneId) {
      throw new PkiSyncError({
        message: "Cloudflare zone ID is required"
      });
    }

    const existingCloudflareIds: Set<string> = new Set();
    const edgeCerts = await listCloudflareEdgeCertificates(apiToken, zoneId, pkiSync.id);
    edgeCerts.forEach((_, id) => existingCloudflareIds.add(id));

    const existingSyncRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);
    const syncRecordsByCertId = new Map<string, TCertificateSyncs>();

    existingSyncRecords.forEach((record: TCertificateSyncs) => {
      if (record.certificateId) {
        syncRecordsByCertId.set(record.certificateId, record);
      }
    });

    const syncOptions = pkiSync.syncOptions as
      | {
          certificateNameSchema?: string;
          canRemoveCertificates?: boolean;
        }
      | undefined;
    const canRemoveCertificates = syncOptions?.canRemoveCertificates ?? true;

    const certificatesToUpload: {
      key: string;
      cert: string;
      privateKey: string;
      certificateChain?: string;
      caCertificate?: string;
      certificateId?: string;
      existingCloudflareId?: string;
    }[] = [];

    const skippedCertificates: Array<{ name: string; reason: string }> = [];
    const activeExternalIdentifiers = new Set<string>();

    for (const [certName, { cert, privateKey, certificateChain, caCertificate, certificateId }] of Object.entries(
      certificateMap
    )) {
      // Skip certificates that have already been renewed
      if (typeof certificateId === "string") {
        const certificate = await certificateDAL.findById(certificateId);
        if (certificate?.renewedByCertificateId) {
          skippedCertificates.push({
            name: certName,
            reason: "Certificate has been renewed and replaced by a newer certificate"
          });
          // eslint-disable-next-line no-continue
          continue;
        }
      }

      // Validate certificate content before attempting upload
      if (!cert || !cert.includes("-----BEGIN CERTIFICATE-----")) {
        skippedCertificates.push({
          name: certName,
          reason: "Certificate is missing or not in valid PEM format"
        });
        // eslint-disable-next-line no-continue
        continue;
      }

      if (!privateKey || !privateKey.includes("-----BEGIN")) {
        skippedCertificates.push({
          name: certName,
          reason: "Private key is missing or not in valid PEM format"
        });
        // eslint-disable-next-line no-continue
        continue;
      }

      let existingCloudflareId: string | undefined;

      if (typeof certificateId === "string") {
        const existingSyncRecord = syncRecordsByCertId.get(certificateId);

        if (
          existingSyncRecord?.externalIdentifier &&
          existingCloudflareIds.has(existingSyncRecord.externalIdentifier)
        ) {
          existingCloudflareId = existingSyncRecord.externalIdentifier;
          activeExternalIdentifiers.add(existingCloudflareId);
        }
      }

      certificatesToUpload.push({
        key: certName,
        cert,
        privateKey,
        certificateChain,
        caCertificate,
        certificateId,
        existingCloudflareId
      });
    }

    const certificatesToRemove: string[] = [];

    if (canRemoveCertificates) {
      existingSyncRecords.forEach((syncRecord) => {
        if (syncRecord.externalIdentifier && !activeExternalIdentifiers.has(syncRecord.externalIdentifier)) {
          if (existingCloudflareIds.has(syncRecord.externalIdentifier)) {
            certificatesToRemove.push(syncRecord.externalIdentifier);
          }
        }
      });
    }

    const uploadResults = await executeWithConcurrencyLimit(
      certificatesToUpload,
      async ({ key, cert, privateKey, certificateChain, caCertificate, certificateId, existingCloudflareId }) => {
        try {
          // Determine if this certificate was issued by a private CA.
          // When caCertificate is present, the cert was issued by an Infisical CA (private).
          // Private CAs require bundle_method "force" with the full chain including root,
          // while public CAs should use the configured bundle method without root (Cloudflare resolves the chain).
          const isPrivateCA = !!caCertificate;

          let fullCertificate: string;
          const bundleMethod = isPrivateCA ? "force" : "ubiquitous";

          // Certificate chain ordering differs based on bundle method:
          // - Private CAs (bundle_method: "force"): Chain first, then leaf cert.
          //   Cloudflare cannot resolve private CA chains, so we provide the full chain
          // - Public CAs (bundle_method: "ubiquitous"): Leaf cert first, then chain.
          //   Cloudflare resolves and optimizes the chain itself, so we provide
          //   the leaf certificate first followed by any intermediates.
          if (isPrivateCA) {
            let chain = certificateChain?.trim() || "";
            const rootCa = caCertificate.trim();
            if (chain && !chain.includes(rootCa)) {
              chain = `${chain}\n${rootCa}`;
            } else if (!chain) {
              chain = rootCa;
            }
            fullCertificate = `${chain}\n${cert.trim()}`;
          } else if (bundleMethod === "force" && certificateChain) {
            fullCertificate = `${certificateChain.trim()}\n${cert.trim()}`;
          } else if (certificateChain) {
            fullCertificate = `${cert.trim()}\n${certificateChain.trim()}`;
          } else {
            fullCertificate = cert.trim();
          }

          let cloudflareCertId: string;

          if (existingCloudflareId) {
            const patchResponse = await withRateLimitRetry(
              () =>
                request.patch<{ result: CloudflareEdgeCertificate }>(
                  `${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/zones/${encodeURIComponent(zoneId)}/custom_certificates/${existingCloudflareId}`,
                  {
                    certificate: fullCertificate,
                    private_key: privateKey,
                    bundle_method: bundleMethod
                  },
                  {
                    headers: {
                      Authorization: `Bearer ${apiToken}`,
                      "Content-Type": "application/json"
                    }
                  }
                ),
              { operation: "patch-certificate", syncId: pkiSync.id }
            );
            cloudflareCertId = patchResponse.data.result.id;

            if (cloudflareCertId !== existingCloudflareId) {
              logger.info(
                {
                  syncId: pkiSync.id,
                  oldCertId: existingCloudflareId,
                  newCertId: cloudflareCertId,
                  certificateKey: key
                },
                "Cloudflare returned new certificate ID after PATCH (sni_custom behavior)"
              );
            }
          } else {
            const response = await withRateLimitRetry(
              () =>
                request.post<{ result: CloudflareEdgeCertificate }>(
                  `${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/zones/${encodeURIComponent(zoneId)}/custom_certificates`,
                  {
                    certificate: fullCertificate,
                    private_key: privateKey,
                    bundle_method: bundleMethod,
                    type: "sni_custom"
                  },
                  {
                    headers: {
                      Authorization: `Bearer ${apiToken}`,
                      "Content-Type": "application/json"
                    }
                  }
                ),
              { operation: "post-certificate", syncId: pkiSync.id }
            );
            cloudflareCertId = response.data.result.id;
          }

          if (certificateId) {
            const existingCertSync = await certificateSyncDAL.findByPkiSyncAndCertificate(pkiSync.id, certificateId);
            if (existingCertSync) {
              await certificateSyncDAL.updateById(existingCertSync.id, {
                externalIdentifier: cloudflareCertId,
                syncStatus: CertificateSyncStatus.Succeeded,
                lastSyncedAt: new Date()
              });
            } else {
              await certificateSyncDAL.addCertificates(pkiSync.id, [
                {
                  certificateId,
                  externalIdentifier: cloudflareCertId
                }
              ]);
            }

            const currentCertificate = await certificateDAL.findById(certificateId);
            if (currentCertificate?.renewedFromCertificateId) {
              await certificateSyncDAL.removeCertificates(pkiSync.id, [currentCertificate.renewedFromCertificateId]);
            }
          }

          return { key, success: true, cloudflareCertId };
        } catch (error) {
          if (error instanceof AxiosError) {
            const errorMessage =
              error.response?.data && typeof error.response.data === "object" && "errors" in error.response.data
                ? (error.response.data as { errors?: Array<{ message?: string }> }).errors?.[0]?.message ||
                  error.message
                : error.message;

            throw new PkiSyncError({
              message: `Failed to upload certificate ${key} to Cloudflare: ${errorMessage}`,
              cause: error,
              context: {
                certificateKey: key,
                statusCode: error.response?.status,
                responseData: error.response?.data
              }
            });
          }
          throw error;
        }
      },
      { operation: "upload-certificates", syncId: pkiSync.id }
    );

    const failedUploads = uploadResults.filter((result) => result.status === "rejected");
    const successfulUploads = uploadResults.filter((result) => result.status === "fulfilled" && result.value.success);

    let removedCertificates = 0;
    let failedRemovals = 0;

    if (certificatesToRemove.length > 0) {
      const removeResults = await executeWithConcurrencyLimit(
        certificatesToRemove,
        async (cloudflareCertId) => {
          try {
            await withRateLimitRetry(
              () =>
                request.delete(
                  `${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/zones/${encodeURIComponent(zoneId)}/custom_certificates/${cloudflareCertId}`,
                  {
                    headers: {
                      Authorization: `Bearer ${apiToken}`
                    }
                  }
                ),
              { operation: "delete-certificate", syncId: pkiSync.id }
            );

            return { id: cloudflareCertId, success: true };
          } catch (error) {
            if (error instanceof AxiosError && error.response?.status === 404) {
              return { id: cloudflareCertId, success: true, alreadyRemoved: true };
            }

            logger.error(
              { error, syncId: pkiSync.id, cloudflareCertId },
              "Failed to remove certificate from Cloudflare"
            );

            return { id: cloudflareCertId, success: false, error: error as Error };
          }
        },
        { operation: "remove-certificates", syncId: pkiSync.id }
      );

      const successfulRemovals = removeResults.filter(
        (result) => result.status === "fulfilled" && result.value.success
      );
      removedCertificates = successfulRemovals.length;
      failedRemovals = removeResults.length - removedCertificates;

      if (failedRemovals > 0) {
        logger.warn(
          {
            syncId: pkiSync.id,
            failedRemovals,
            successfulRemovals: removedCertificates
          },
          "Some certificates could not be removed from Cloudflare"
        );
      }
    }

    const details: {
      failedUploads?: Array<{ name: string; error: string }>;
      failedRemovals?: Array<{ name: string; error: string }>;
      skippedCertificates?: Array<{ name: string; reason: string }>;
    } = {};

    if (skippedCertificates.length > 0) {
      details.skippedCertificates = skippedCertificates;
      logger.info(
        {
          syncId: pkiSync.id,
          skippedCount: skippedCertificates.length,
          skippedCertificates
        },
        "Some certificates were skipped during Cloudflare sync"
      );
    }

    if (failedUploads.length > 0) {
      details.failedUploads = failedUploads.map((failure, index) => {
        const certificateName = certificatesToUpload[index]?.key || "unknown";
        let errorMessage = "Unknown error";

        if (failure.status === "rejected") {
          errorMessage = (failure.reason as Error)?.message || "Unknown error";
        }

        return {
          name: certificateName,
          error: errorMessage
        };
      });

      logger.error(
        {
          syncId: pkiSync.id,
          failedUploads: details.failedUploads,
          failedCount: failedUploads.length
        },
        "Some certificates failed to upload to Cloudflare"
      );
    }

    if (failedRemovals > 0) {
      const failedRemovalIds = certificatesToRemove.slice(-failedRemovals);
      details.failedRemovals = failedRemovalIds.map((certId) => ({
        name: certId,
        error: "Failed to remove from Cloudflare"
      }));
    }

    return {
      uploaded: successfulUploads.length,
      removed: removedCertificates,
      failedRemovals,
      skipped:
        skippedCertificates.length +
        (Object.keys(certificateMap).length - certificatesToUpload.length - skippedCertificates.length),
      details: Object.keys(details).length > 0 ? details : undefined
    };
  };

  const removeCertificates = async (
    pkiSync: TPkiSyncWithCredentials,
    certificateNames: string[],
    deps?: { certificateSyncDAL?: TCertificateSyncDALFactory; certificateMap?: TCertificateMap }
  ) => {
    const apiToken = getCloudflareApiToken(pkiSync);

    const destinationConfig = pkiSync.destinationConfig as TCloudflareCustomCertificatePkiSyncConfig;
    const { zoneId } = destinationConfig;

    const existingSyncRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);
    const cloudflareCertIdsToRemove: string[] = [];
    const certificateIdToCloudflareIdMap = new Map<string, string>();

    for (const certName of certificateNames) {
      if (deps?.certificateMap?.[certName]?.certificateId) {
        const { certificateId } = deps.certificateMap[certName];

        const syncRecord = existingSyncRecords.find((record) => record.certificateId === certificateId);

        if (syncRecord?.externalIdentifier && typeof certificateId === "string") {
          cloudflareCertIdsToRemove.push(syncRecord.externalIdentifier);
          certificateIdToCloudflareIdMap.set(certificateId, syncRecord.externalIdentifier);
        }
      }
    }

    if (cloudflareCertIdsToRemove.length === 0) {
      return {
        removed: 0,
        failed: 0,
        skipped: certificateNames.length
      };
    }

    const results = await executeWithConcurrencyLimit(
      cloudflareCertIdsToRemove,
      async (cloudflareCertId) => {
        try {
          await withRateLimitRetry(
            () =>
              request.delete(
                `${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/zones/${encodeURIComponent(zoneId)}/custom_certificates/${cloudflareCertId}`,
                {
                  headers: {
                    Authorization: `Bearer ${apiToken}`
                  }
                }
              ),
            { operation: "delete-specific-certificate", syncId: pkiSync.id }
          );

          return { id: cloudflareCertId, success: true };
        } catch (error) {
          if (error instanceof AxiosError) {
            if (error.response?.status === 404) {
              return { id: cloudflareCertId, success: true, alreadyRemoved: true };
            }

            throw new PkiSyncError({
              message: `Failed to remove certificate ${cloudflareCertId} from Cloudflare`,
              cause: error,
              context: {
                cloudflareCertId,
                statusCode: error.response?.status,
                responseData: error.response?.data
              }
            });
          }
          throw error;
        }
      },
      { operation: "remove-specific-certificates", syncId: pkiSync.id }
    );

    const failedRemovals = results.filter((result) => result.status === "rejected");

    if (failedRemovals.length > 0 && deps?.certificateSyncDAL) {
      for (const failure of failedRemovals) {
        if (failure.status === "rejected") {
          const failedCloudflareId = cloudflareCertIdsToRemove[results.indexOf(failure)];

          const certificateId = Array.from(certificateIdToCloudflareIdMap.entries()).find(
            ([, cloudflareId]) => cloudflareId === failedCloudflareId
          )?.[0];

          if (certificateId) {
            const errorMessage = (failure.reason as Error)?.message || "Unknown error";
            await deps.certificateSyncDAL.updateSyncStatus(
              pkiSync.id,
              certificateId,
              CertificateSyncStatus.Failed,
              `Failed to remove from Cloudflare: ${errorMessage}`
            );
          }
        }
      }
    }

    const successfulRemovals = results.filter((result) => result.status === "fulfilled");
    if (successfulRemovals.length > 0) {
      const successfulCloudflareIds = new Set(successfulRemovals.map((_, index) => cloudflareCertIdsToRemove[index]));

      const certificateIdsToRemove = Array.from(certificateIdToCloudflareIdMap.entries())
        .filter(([, cloudflareId]) => successfulCloudflareIds.has(cloudflareId))
        .map(([certificateId]) => certificateId);

      if (certificateIdsToRemove.length > 0) {
        await certificateSyncDAL.removeCertificates(pkiSync.id, certificateIdsToRemove);
      }
    }

    if (failedRemovals.length > 0) {
      const failedReasons = failedRemovals.map((failure) => {
        if (failure.status === "rejected") {
          return (failure.reason as Error)?.message || "Unknown error";
        }
        return "Unknown error";
      });

      throw new PkiSyncError({
        message: `Failed to remove ${failedRemovals.length} certificate(s) from Cloudflare`,
        context: {
          failedReasons,
          totalCertificates: cloudflareCertIdsToRemove.length,
          failedCount: failedRemovals.length
        }
      });
    }

    return {
      removed: cloudflareCertIdsToRemove.length - failedRemovals.length,
      failed: failedRemovals.length,
      skipped: certificateNames.length - cloudflareCertIdsToRemove.length
    };
  };

  return {
    syncCertificates,
    removeCertificates
  };
};
