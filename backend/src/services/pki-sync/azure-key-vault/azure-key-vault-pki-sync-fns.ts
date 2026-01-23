/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";
import * as crypto from "crypto";

import { TCertificateSyncs } from "@app/db/schemas/certificate-syncs";
import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { getAzureConnectionAccessToken } from "@app/services/app-connection/azure-key-vault";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSyncDALFactory } from "@app/services/certificate-sync/certificate-sync-dal";
import { CertificateSyncStatus } from "@app/services/certificate-sync/certificate-sync-enums";
import { createConnectionQueue, RateLimitConfig } from "@app/services/connection-queue";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { matchesCertificateNameSchema } from "@app/services/pki-sync/pki-sync-fns";
import { TCertificateMap } from "@app/services/pki-sync/pki-sync-types";

import { PkiSyncError } from "../pki-sync-errors";
import { TPkiSyncWithCredentials } from "../pki-sync-types";
import { GetAzureKeyVaultCertificate, TAzureKeyVaultPkiSyncConfig } from "./azure-key-vault-pki-sync-types";

const AZURE_RATE_LIMIT_CONFIG: RateLimitConfig = {
  MAX_CONCURRENT_REQUESTS: 10,
  BASE_DELAY: 1000,
  MAX_DELAY: 30000,
  MAX_RETRIES: 3,
  RATE_LIMIT_STATUS_CODES: [429, 503]
};

const azureConnectionQueue = createConnectionQueue(AZURE_RATE_LIMIT_CONFIG);

const { withRateLimitRetry, executeWithConcurrencyLimit } = azureConnectionQueue;

const extractCertificateNameFromId = (certificateId: string): string => {
  return certificateId.substring(certificateId.lastIndexOf("/") + 1);
};

const isInfisicalManagedCertificate = (certificateName: string, pkiSync: TPkiSyncWithCredentials): boolean => {
  const syncOptions = pkiSync.syncOptions as
    | { certificateNameSchema?: string; canRemoveCertificates?: boolean }
    | undefined;
  const certificateNameSchema = syncOptions?.certificateNameSchema;

  if (certificateNameSchema) {
    const environment = "global";
    return matchesCertificateNameSchema(certificateName, environment, certificateNameSchema);
  }

  return certificateName.startsWith("Infisical-PKI-Sync-");
};

type TAzureKeyVaultPkiSyncFactoryDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
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

const parseCertificateX509Props = (certPem: string) => {
  try {
    const cert = new crypto.X509Certificate(certPem);

    const { subject } = cert;

    const sans = {
      dns_names: [] as string[],
      emails: [] as string[],
      upns: [] as string[]
    };

    if (cert.subjectAltName) {
      const sanEntries = cert.subjectAltName.split(", ");
      for (const entry of sanEntries) {
        if (entry.startsWith("DNS:")) {
          sans.dns_names.push(entry.substring(4));
        } else if (entry.startsWith("email:")) {
          sans.emails.push(entry.substring(6));
        } else if (entry.startsWith("othername:UPN:")) {
          sans.upns.push(entry.substring(14));
        }
      }
    }

    return {
      subject,
      sans
    };
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to parse certificate X.509 properties, using empty values"
    );
    return {
      subject: "",
      sans: {
        dns_names: [],
        emails: [],
        upns: []
      }
    };
  }
};

const parseCertificateKeyProps = (certPem: string) => {
  try {
    const publicKeyObject = crypto.createPublicKey(certPem);
    const keyDetails = publicKeyObject.asymmetricKeyDetails;

    if (!keyDetails) {
      if (publicKeyObject.asymmetricKeyType === "rsa") {
        const pubKeyStr = publicKeyObject.export({ type: "spki", format: "der" }).toString("hex");
        const estimatedBits = pubKeyStr.length * 4;

        let keySize = 2048;
        if (estimatedBits >= 4000) {
          keySize = 4096;
        } else if (estimatedBits >= 3000) {
          keySize = 3072;
        } else if (estimatedBits >= 2000) {
          keySize = 2048;
        } else if (estimatedBits >= 1000) {
          keySize = 1024;
        }

        return {
          kty: "RSA",
          key_size: keySize
        };
      }

      if (publicKeyObject.asymmetricKeyType === "ec") {
        return {
          kty: "EC",
          curve: "P-256"
        };
      }

      return {
        kty: "RSA",
        key_size: 2048
      };
    }

    if (publicKeyObject.asymmetricKeyType === "rsa") {
      const modulusLength = keyDetails.modulusLength || 2048;
      return {
        kty: "RSA",
        key_size: modulusLength
      };
    }

    if (publicKeyObject.asymmetricKeyType === "ec") {
      const { namedCurve } = keyDetails;
      let curveName = "P-256";

      switch (namedCurve) {
        case "prime256v1":
        case "secp256r1":
          curveName = "P-256";
          break;
        case "secp384r1":
          curveName = "P-384";
          break;
        case "secp521r1":
          curveName = "P-521";
          break;
        default:
          curveName = "P-256";
      }

      return {
        kty: "EC",
        curve: curveName
      };
    }

    const keyType = publicKeyObject.asymmetricKeyType;
    if (keyType && !["rsa", "ec"].includes(keyType)) {
      throw new Error(`Unsupported certificate key type: ${keyType}. Azure Key Vault only supports RSA and EC keys.`);
    }

    logger.warn({ keyType }, "Unable to determine certificate key type, defaulting to RSA 2048");
    return {
      kty: "RSA",
      key_size: 2048
    };
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to parse certificate key properties, defaulting to RSA 2048"
    );
    return {
      kty: "RSA",
      key_size: 2048
    };
  }
};

export const azureKeyVaultPkiSyncFactory = ({
  kmsService,
  appConnectionDAL,
  certificateSyncDAL,
  certificateDAL
}: TAzureKeyVaultPkiSyncFactoryDeps) => {
  const $getAzureKeyVaultCertificates = async (accessToken: string, vaultBaseUrl: string, syncId = "unknown") => {
    const paginateAzureKeyVaultCertificates = async () => {
      let result: GetAzureKeyVaultCertificate[] = [];

      let currentUrl = `${vaultBaseUrl}/certificates?api-version=7.4`;

      while (currentUrl) {
        const urlToFetch = currentUrl; // Capture current URL to avoid loop function issue
        const res = await withRateLimitRetry(
          () =>
            request.get<{ value: GetAzureKeyVaultCertificate[]; nextLink: string }>(urlToFetch, {
              headers: {
                Authorization: `Bearer ${accessToken}`
              }
            }),
          { operation: "list-certificates", syncId }
        );

        result = result.concat(res.data.value);
        currentUrl = res.data.nextLink;
      }

      return result;
    };

    const getAzureKeyVaultCertificates = await paginateAzureKeyVaultCertificates();

    const enabledAzureKeyVaultCertificates = getAzureKeyVaultCertificates.filter((cert) => cert.attributes.enabled);

    // disabled certificates to skip sending updates to
    const disabledAzureKeyVaultCertificateKeys = getAzureKeyVaultCertificates
      .filter(({ attributes }) => !attributes.enabled)
      .map((certificate) => extractCertificateNameFromId(certificate.id));

    // Use rate-limited concurrent execution for fetching certificate details
    const certificateResults = await executeWithConcurrencyLimit(
      enabledAzureKeyVaultCertificates,
      async (getAzureKeyVaultCertificate) => {
        const azureKeyVaultCertificate = await request.get<GetAzureKeyVaultCertificate>(
          `${getAzureKeyVaultCertificate.id}?api-version=7.4`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          }
        );

        let certPem = "";
        if (azureKeyVaultCertificate.data.cer) {
          try {
            // Azure Key Vault stores certificate in base64 DER format
            // We need to convert it to PEM format with proper headers
            const base64Cert = azureKeyVaultCertificate.data.cer;
            const base64Lines = base64Cert.match(/.{1,64}/g);
            if (!base64Lines) {
              throw new Error("Failed to format base64 certificate data");
            }
            certPem = `-----BEGIN CERTIFICATE-----\n${base64Lines.join("\n")}\n-----END CERTIFICATE-----`;
          } catch (error) {
            logger.warn(
              {
                error: error instanceof Error ? error.message : String(error),
                certificateId: getAzureKeyVaultCertificate.id
              },
              "Failed to convert Azure Key Vault certificate to PEM format, skipping certificate"
            );
            certPem = ""; // Skip this certificate if we can't convert it properly
          }
        }

        return {
          ...azureKeyVaultCertificate.data,
          key: extractCertificateNameFromId(getAzureKeyVaultCertificate.id),
          cert: certPem,
          privateKey: "" // Private keys cannot be extracted from Azure Key Vault for security reasons
        };
      },
      { operation: "fetch-certificate-details", syncId }
    );

    const successfulCertificates = certificateResults
      .filter(
        (
          result
        ): result is PromiseFulfilledResult<
          GetAzureKeyVaultCertificate & {
            key: string;
            cert: string;
            privateKey: string;
          }
        > => result.status === "fulfilled"
      )
      .map((result) => result.value);

    // Log any failures
    const failedFetches = certificateResults.filter((result) => result.status === "rejected");
    if (failedFetches.length > 0) {
      logger.warn(
        {
          syncId,
          failedCount: failedFetches.length,
          totalCount: enabledAzureKeyVaultCertificates.length
        },
        "Some certificate details could not be fetched from Azure Key Vault"
      );
    }

    const res: Record<string, { cert: string; privateKey: string }> = successfulCertificates.reduce(
      (obj, certificate) => ({
        ...obj,
        [certificate.key]: {
          cert: certificate.cert,
          privateKey: certificate.privateKey
        }
      }),
      {} as Record<string, { cert: string; privateKey: string }>
    );

    return {
      vaultCertificates: res,
      disabledAzureKeyVaultCertificateKeys
    };
  };

  const syncCertificates = async (pkiSync: TPkiSyncWithCredentials, certificateMap: TCertificateMap) => {
    const { accessToken } = await getAzureConnectionAccessToken(pkiSync.connection.id, appConnectionDAL, kmsService);

    // Cast destination config to Azure Key Vault config
    const destinationConfig = pkiSync.destinationConfig as TAzureKeyVaultPkiSyncConfig;

    const { vaultCertificates, disabledAzureKeyVaultCertificateKeys } = await $getAzureKeyVaultCertificates(
      accessToken,
      destinationConfig.vaultBaseUrl,
      pkiSync.id
    );

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

    const setCertificates: {
      key: string;
      cert: string;
      privateKey: string;
      certificateChain?: string;
      certificateId?: string;
    }[] = [];

    const syncOptions = pkiSync.syncOptions as
      | { certificateNameSchema?: string; canRemoveCertificates?: boolean; enableVersioning?: boolean }
      | undefined;
    const canRemoveCertificates = syncOptions?.canRemoveCertificates ?? true;
    const enableVersioning = syncOptions?.enableVersioning ?? true;

    const activeExternalIdentifiers = new Set<string>();

    // Iterate through certificates to sync to Azure Key Vault
    for (const [certName, { cert, privateKey, certificateChain, certificateId }] of Object.entries(certificateMap)) {
      if (disabledAzureKeyVaultCertificateKeys.includes(certName)) {
        // eslint-disable-next-line no-continue
        continue;
      }

      if (enableVersioning && typeof certificateId === "string") {
        const certificate = await certificateDAL.findById(certificateId);
        if (certificate?.renewedByCertificateId) {
          // eslint-disable-next-line no-continue
          continue;
        }
      }

      let targetCertName = certName;
      let shouldCreateNew = false;

      if (typeof certificateId === "string") {
        const existingSyncRecord = syncRecordsByCertId.get(certificateId);

        if (existingSyncRecord?.externalIdentifier) {
          const existingAzureCert = vaultCertificates[existingSyncRecord.externalIdentifier];

          if (existingAzureCert && enableVersioning) {
            targetCertName = existingSyncRecord.externalIdentifier;
            activeExternalIdentifiers.add(targetCertName);

            const shouldUpdateCert = existingAzureCert.cert !== cert;
            if (shouldUpdateCert) {
              shouldCreateNew = true;
            }
          } else if (!existingAzureCert) {
            shouldCreateNew = true;
          } else if (!enableVersioning) {
            shouldCreateNew = true;
          }
        } else {
          shouldCreateNew = true;
        }
      } else {
        shouldCreateNew = true;
      }

      if (shouldCreateNew || !vaultCertificates[targetCertName] || vaultCertificates[targetCertName].cert !== cert) {
        setCertificates.push({
          key: targetCertName,
          cert,
          privateKey,
          certificateChain,
          certificateId
        });
      }

      if (targetCertName) {
        activeExternalIdentifiers.add(targetCertName);
      }
    }

    const certificatesToRemove: string[] = [];

    if (canRemoveCertificates) {
      existingSyncRecords.forEach((syncRecord) => {
        if (syncRecord.externalIdentifier && !activeExternalIdentifiers.has(syncRecord.externalIdentifier)) {
          if (vaultCertificates[syncRecord.externalIdentifier]) {
            certificatesToRemove.push(syncRecord.externalIdentifier);
          }
        }
      });

      Object.keys(vaultCertificates).forEach((certificateName) => {
        const isInfisicalManaged = isInfisicalManagedCertificate(certificateName, pkiSync);

        if (isInfisicalManaged) {
          const isTrackedInSyncRecords = existingSyncRecords.some(
            (record) => record.externalIdentifier === certificateName
          );

          const isInActiveSet = activeExternalIdentifiers.has(certificateName);

          if (!isTrackedInSyncRecords && !isInActiveSet && !certificatesToRemove.includes(certificateName)) {
            certificatesToRemove.push(certificateName);
          }
        }
      });
    }

    // Upload certificates to Azure Key Vault with rate limiting
    const uploadResults = await executeWithConcurrencyLimit(
      setCertificates,
      async ({ key, cert, privateKey, certificateChain, certificateId }) => {
        try {
          // Combine private key, certificate, and certificate chain in PEM format for Azure Key Vault
          let combinedPem = "";

          if (privateKey) {
            combinedPem = privateKey.trim();
          }

          if (combinedPem) {
            combinedPem = `${combinedPem}\n${cert.trim()}`;
          } else {
            combinedPem = cert.trim();
          }

          if (certificateChain) {
            const trimmedChain = certificateChain.trim();
            if (trimmedChain) {
              combinedPem = `${combinedPem}\n${trimmedChain}`;
            }
          }

          // Convert to base64 for Azure Key Vault import
          const base64Cert = Buffer.from(combinedPem).toString("base64");

          // Parse certificate to extract X.509 properties and key properties
          const x509Props = parseCertificateX509Props(cert);
          const keyProps = parseCertificateKeyProps(cert);

          // Build key_props based on key type
          const keyPropsConfig = {
            exportable: true,
            reuse_key: false,
            ...keyProps
          };

          const importData = {
            value: base64Cert,
            policy: {
              key_props: keyPropsConfig,
              secret_props: {
                contentType: "application/x-pem-file"
              },
              x509_props: x509Props
            },
            attributes: {
              enabled: true,
              exportable: true
            }
          };

          const response = await request.post(
            `${destinationConfig.vaultBaseUrl}/certificates/${encodeURIComponent(key)}/import?api-version=7.4`,
            importData,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
              }
            }
          );

          if (certificateId) {
            const existingCertSync = await certificateSyncDAL.findByPkiSyncAndCertificate(pkiSync.id, certificateId);
            if (existingCertSync) {
              await certificateSyncDAL.updateById(existingCertSync.id, {
                externalIdentifier: key,
                syncStatus: CertificateSyncStatus.Succeeded,
                lastSyncedAt: new Date()
              });
            } else {
              await certificateSyncDAL.addCertificates(pkiSync.id, [
                {
                  certificateId,
                  externalIdentifier: key
                }
              ]);
            }

            if (enableVersioning) {
              const currentCertificate = await certificateDAL.findById(certificateId);
              if (currentCertificate?.renewedFromCertificateId) {
                await certificateSyncDAL.removeCertificates(pkiSync.id, [currentCertificate.renewedFromCertificateId]);
              }
            }
          }

          return { key, success: true, response: response.data as unknown };
        } catch (error) {
          if (error instanceof AxiosError) {
            const errorMessage =
              error.response?.data && typeof error.response.data === "object" && "error" in error.response.data
                ? (error.response.data as { error?: { message?: string } }).error?.message || error.message
                : error.message;

            // Check if the error is due to certificate in deleted but recoverable state
            const isDeletedButRecoverable =
              errorMessage.includes("deleted but recoverable state") || errorMessage.includes("name cannot be reused");

            if (isDeletedButRecoverable) {
              logger.warn(
                { certificateKey: key, syncId: pkiSync.id },
                "Certificate exists in deleted but recoverable state in Azure Key Vault - skipping upload"
              );
              return { key, success: false, skipped: true, reason: "Certificate in deleted but recoverable state" };
            }

            throw new PkiSyncError({
              message: `Failed to upload certificate ${key} to Azure Key Vault: ${errorMessage}`,
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

    const results = uploadResults;
    const failedUploads = results.filter((result) => result.status === "rejected");
    const fulfilledResults = results.filter((result) => result.status === "fulfilled");

    // Separate successful uploads from skipped certificates
    const successfulUploads = fulfilledResults.filter(
      (result) => result.status === "fulfilled" && result.value.success
    );
    const skippedUploads = fulfilledResults.filter((result) => result.status === "fulfilled" && result.value.skipped);

    // Remove expired/removed certificates from Azure Key Vault
    let removedCertificates = 0;
    let failedRemovals = 0;

    if (certificatesToRemove.length > 0) {
      const removeResults = await executeWithConcurrencyLimit(
        certificatesToRemove,
        async (certName) => {
          try {
            await request.delete(
              `${destinationConfig.vaultBaseUrl}/certificates/${encodeURIComponent(certName)}?api-version=7.4`,
              {
                headers: {
                  Authorization: `Bearer ${accessToken}`
                }
              }
            );

            return { key: certName, success: true };
          } catch (error) {
            // If certificate doesn't exist (404), consider it as successfully removed
            if (error instanceof AxiosError && error.response?.status === 404) {
              return { key: certName, success: true, alreadyRemoved: true };
            }

            logger.error(
              { error, syncId: pkiSync.id, certificateName: certName },
              "Failed to remove expired/removed certificate from Azure Key Vault"
            );

            // Don't throw here - we want to continue with other operations
            return { key: certName, success: false, error: error as Error };
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
          "Some expired/removed certificates could not be removed from Azure Key Vault"
        );
      }
    }

    // Collect detailed information for UI feedback
    const details: {
      failedUploads?: Array<{ name: string; error: string }>;
      failedRemovals?: Array<{ name: string; error: string }>;
      skippedCertificates?: Array<{ name: string; reason: string }>;
    } = {};

    // Collect skipped certificate details
    if (skippedUploads.length > 0) {
      details.skippedCertificates = skippedUploads.map((result) => {
        const certificateName = result.status === "fulfilled" ? result.value.key : "unknown";
        return {
          name: certificateName,
          reason: "Azure Key Vault constraints or certificate already up to date"
        };
      });
    }

    // Collect failed upload details
    if (failedUploads.length > 0) {
      details.failedUploads = failedUploads.map((failure, index) => {
        const certificateName = setCertificates[index]?.key || "unknown";
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
        "Some certificates failed to upload to Azure Key Vault"
      );
    }

    // Collect failed removal details
    if (failedRemovals > 0) {
      const failedRemovalNames = certificatesToRemove.slice(-failedRemovals);
      details.failedRemovals = failedRemovalNames.map((certName) => ({
        name: certName,
        error: "Failed to remove from Azure Key Vault"
      }));

      logger.warn(
        {
          syncId: pkiSync.id,
          failedRemovals: details.failedRemovals,
          successfulRemovals: removedCertificates
        },
        "Some expired/removed certificates could not be removed from Azure Key Vault"
      );
    }

    return {
      uploaded: successfulUploads.length,
      removed: removedCertificates,
      failedRemovals,
      skipped: Object.keys(certificateMap).length - setCertificates.length,
      details: Object.keys(details).length > 0 ? details : undefined
    };
  };

  const removeCertificates = async (
    pkiSync: TPkiSyncWithCredentials,
    certificateNames: string[],
    deps?: { certificateSyncDAL?: TCertificateSyncDALFactory; certificateMap?: TCertificateMap }
  ) => {
    const { accessToken } = await getAzureConnectionAccessToken(pkiSync.connection.id, appConnectionDAL, kmsService);

    // Cast destination config to Azure Key Vault config
    const destinationConfig = pkiSync.destinationConfig as TAzureKeyVaultPkiSyncConfig;

    const existingSyncRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);
    const certificateNamesToRemove: string[] = [];
    const certificateIdToNameMap = new Map<string, string>();

    for (const certName of certificateNames) {
      if (deps?.certificateMap?.[certName]?.certificateId) {
        const { certificateId } = deps.certificateMap[certName];

        const syncRecord = existingSyncRecords.find((record) => record.certificateId === certificateId);

        if (syncRecord?.externalIdentifier && typeof certificateId === "string") {
          certificateNamesToRemove.push(syncRecord.externalIdentifier);
          certificateIdToNameMap.set(certificateId, syncRecord.externalIdentifier);
        }
      }
    }

    if (certificateNamesToRemove.length === 0) {
      return {
        removed: 0,
        failed: 0,
        skipped: certificateNames.length
      };
    }

    const results = await executeWithConcurrencyLimit(
      certificateNamesToRemove,
      async (certName) => {
        try {
          const response = await request.delete(
            `${destinationConfig.vaultBaseUrl}/certificates/${encodeURIComponent(certName)}?api-version=7.4`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`
              }
            }
          );

          return { key: certName, success: true, response: response.data as unknown };
        } catch (error) {
          if (error instanceof AxiosError) {
            // If certificate doesn't exist (404), consider it as successfully removed
            if (error.response?.status === 404) {
              return { key: certName, success: true, alreadyRemoved: true };
            }

            throw new PkiSyncError({
              message: `Failed to remove certificate ${certName} from Azure Key Vault`,
              cause: error,
              context: {
                certificateKey: certName,
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
          const failedCertName = certificateNamesToRemove[results.indexOf(failure)];

          const certificateId = Array.from(certificateIdToNameMap.entries()).find(
            ([, name]) => name === failedCertName
          )?.[0];

          if (certificateId) {
            const errorMessage = (failure.reason as Error)?.message || "Unknown error";
            await deps.certificateSyncDAL.updateSyncStatus(
              pkiSync.id,
              certificateId,
              CertificateSyncStatus.Failed,
              `Failed to remove from Azure: ${errorMessage}`
            );
          }
        }
      }
    }

    const successfulRemovals = results.filter((result) => result.status === "fulfilled");
    if (successfulRemovals.length > 0) {
      const successfulCertNames = new Set(successfulRemovals.map((_, index) => certificateNamesToRemove[index]));

      const certificateIdsToRemove = Array.from(certificateIdToNameMap.entries())
        .filter(([, name]) => successfulCertNames.has(name))
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
        message: `Failed to remove ${failedRemovals.length} certificate(s) from Azure Key Vault`,
        context: {
          failedReasons,
          totalCertificates: certificateNamesToRemove.length,
          failedCount: failedRemovals.length
        }
      });
    }

    return {
      removed: certificateNamesToRemove.length - failedRemovals.length,
      failed: failedRemovals.length,
      skipped: certificateNames.length - certificateNamesToRemove.length
    };
  };

  return {
    syncCertificates,
    removeCertificates
  };
};
