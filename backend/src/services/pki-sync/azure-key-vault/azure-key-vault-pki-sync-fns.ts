/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { getAzureConnectionAccessToken } from "@app/services/app-connection/azure-key-vault";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TCertificateMap } from "@app/services/pki-sync/pki-sync-types";

import { PkiSync } from "../pki-sync-enums";
import { PkiSyncError } from "../pki-sync-errors";
import { GetAzureKeyVaultCertificate, TAzureKeyVaultPkiSyncWithCredentials } from "./azure-key-vault-pki-sync-types";

export const AZURE_KEY_VAULT_PKI_SYNC_LIST_OPTION = {
  name: "Azure Key Vault" as const,
  connection: AppConnection.AzureKeyVault,
  destination: PkiSync.AzureKeyVault,
  canImportCertificates: false,
  canRemoveCertificates: true
};

type TAzureKeyVaultPkiSyncFactoryDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export const azureKeyVaultPkiSyncFactory = ({ kmsService, appConnectionDAL }: TAzureKeyVaultPkiSyncFactoryDeps) => {
  const $getAzureKeyVaultCertificates = async (accessToken: string, vaultBaseUrl: string) => {
    const paginateAzureKeyVaultCertificates = async () => {
      let result: GetAzureKeyVaultCertificate[] = [];

      let currentUrl = `${vaultBaseUrl}/certificates?api-version=7.4`;

      while (currentUrl) {
        const res = await request.get<{ value: GetAzureKeyVaultCertificate[]; nextLink: string }>(currentUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        });

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
      .map((getAzureKeyVaultCertificate) => {
        return getAzureKeyVaultCertificate.id.substring(getAzureKeyVaultCertificate.id.lastIndexOf("/") + 1);
      });

    let lastSlashIndex: number;
    const res = (
      await Promise.all(
        enabledAzureKeyVaultCertificates.map(async (getAzureKeyVaultCertificate) => {
          if (!lastSlashIndex) {
            lastSlashIndex = getAzureKeyVaultCertificate.id.lastIndexOf("/");
          }

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
              certPem = `-----BEGIN CERTIFICATE-----\n${base64Cert.match(/.{1,64}/g)?.join("\n")}\n-----END CERTIFICATE-----`;
            } catch (error) {
              certPem = azureKeyVaultCertificate.data.cer;
            }
          }

          return {
            ...azureKeyVaultCertificate.data,
            key: getAzureKeyVaultCertificate.id.substring(lastSlashIndex + 1),
            cert: certPem,
            privateKey: "" // Private keys cannot be extracted from Azure Key Vault for security reasons
          };
        })
      )
    ).reduce(
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

  const syncCertificates = async (pkiSync: TAzureKeyVaultPkiSyncWithCredentials, certificateMap: TCertificateMap) => {
    logger.info(
      {
        syncId: pkiSync.id,
        vaultUrl: pkiSync.destinationConfig.vaultBaseUrl,
        certificateCount: Object.keys(certificateMap).length
      },
      "Starting Azure Key Vault certificate sync"
    );

    const { accessToken } = await getAzureConnectionAccessToken(pkiSync.connection.id, appConnectionDAL, kmsService);

    const { vaultCertificates, disabledAzureKeyVaultCertificateKeys } = await $getAzureKeyVaultCertificates(
      accessToken,
      pkiSync.destinationConfig.vaultBaseUrl
    );

    logger.info(
      {
        syncId: pkiSync.id,
        existingCertCount: Object.keys(vaultCertificates).length,
        disabledCertCount: disabledAzureKeyVaultCertificateKeys.length
      },
      "Retrieved existing certificates from Azure Key Vault"
    );

    const setCertificates: {
      key: string;
      cert: string;
      privateKey: string;
    }[] = [];

    // Track which certificates should exist in Azure Key Vault
    const activeCertificateNames = Object.keys(certificateMap);

    // Iterate through certificates to sync to Azure Key Vault
    Object.entries(certificateMap).forEach(([certName, { cert, privateKey }]) => {
      if (disabledAzureKeyVaultCertificateKeys.includes(certName)) {
        logger.debug(
          { syncId: pkiSync.id, certificateName: certName },
          "Skipping disabled certificate in Azure Key Vault"
        );
        return;
      }

      const existingCert = vaultCertificates[certName];
      const shouldUpdateCert = !existingCert || existingCert.cert !== cert;

      if (shouldUpdateCert) {
        setCertificates.push({
          key: certName,
          cert,
          privateKey
        });
        logger.debug(
          { syncId: pkiSync.id, certificateName: certName, isUpdate: !!existingCert },
          "Certificate will be uploaded to Azure Key Vault"
        );
      } else {
        logger.debug(
          { syncId: pkiSync.id, certificateName: certName },
          "Certificate already up to date in Azure Key Vault"
        );
      }
    });

    // Identify expired/removed certificates that need to be cleaned up from Azure Key Vault
    // Only remove certificates that were managed by Infisical (start with 'Infisical-')
    const certificatesToRemove = Object.keys(vaultCertificates).filter(
      (vaultCertName) =>
        vaultCertName.startsWith("Infisical-") &&
        !activeCertificateNames.includes(vaultCertName) &&
        !disabledAzureKeyVaultCertificateKeys.includes(vaultCertName)
    );

    logger.info(
      {
        syncId: pkiSync.id,
        certificatesToUpload: setCertificates.length,
        certificatesToRemove: certificatesToRemove.length,
        totalCertificates: Object.keys(certificateMap).length
      },
      "Determined certificates to upload and remove from Azure Key Vault"
    );

    // Upload certificates to Azure Key Vault
    const uploadPromises = setCertificates.map(async ({ key, cert, privateKey }) => {
      try {
        // Combine certificate and private key in PEM format for Azure Key Vault
        // Azure Key Vault accepts PEM format with both cert and private key
        let combinedPem = cert;
        if (privateKey) {
          combinedPem = `${privateKey}\n${cert}`;
        }

        // Convert to base64 for Azure Key Vault import
        const base64Cert = Buffer.from(combinedPem).toString("base64");

        const importData = {
          value: base64Cert,
          policy: {
            key_props: {
              exportable: true,
              key_size: 2048,
              kty: "RSA",
              reuse_key: false
            },
            secret_props: {
              contentType: "application/x-pem-file"
            },
            x509_props: {
              subject: "",
              sans: {
                dns_names: [],
                emails: [],
                upns: []
              }
            }
          }
        };

        const response = await request.post(
          `${pkiSync.destinationConfig.vaultBaseUrl}/certificates/${encodeURIComponent(key)}/import?api-version=7.4`,
          importData,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            }
          }
        );

        logger.info(
          { syncId: pkiSync.id, certificateName: key },
          "Successfully uploaded certificate to Azure Key Vault"
        );

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
    });

    const results = await Promise.allSettled(uploadPromises);
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
      logger.info(
        {
          syncId: pkiSync.id,
          certificatesToRemove: certificatesToRemove.length
        },
        "Removing expired/removed certificates from Azure Key Vault"
      );

      const removePromises = certificatesToRemove.map(async (certName) => {
        try {
          await request.delete(
            `${pkiSync.destinationConfig.vaultBaseUrl}/certificates/${encodeURIComponent(certName)}?api-version=7.4`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`
              }
            }
          );

          logger.info(
            { syncId: pkiSync.id, certificateName: certName },
            "Successfully removed expired/removed certificate from Azure Key Vault"
          );

          return { key: certName, success: true };
        } catch (error) {
          // If certificate doesn't exist (404), consider it as successfully removed
          if (error instanceof AxiosError && error.response?.status === 404) {
            logger.info(
              { syncId: pkiSync.id, certificateName: certName },
              "Certificate not found in Azure Key Vault during sync cleanup - considering removal successful"
            );
            return { key: certName, success: true, alreadyRemoved: true };
          }

          logger.error(
            { error, syncId: pkiSync.id, certificateName: certName },
            "Failed to remove expired/removed certificate from Azure Key Vault"
          );

          // Don't throw here - we want to continue with other operations
          return { key: certName, success: false, error: error as Error };
        }
      });

      const removeResults = await Promise.allSettled(removePromises);
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

    // Log skipped certificates for transparency
    if (skippedUploads.length > 0) {
      const skippedNames = skippedUploads.map((result) =>
        result.status === "fulfilled" ? result.value.key : "unknown"
      );
      logger.info(
        {
          syncId: pkiSync.id,
          skippedCertificates: skippedNames,
          skippedCount: skippedUploads.length
        },
        "Some certificates were skipped due to Azure Key Vault constraints"
      );
    }

    logger.info(
      {
        syncId: pkiSync.id,
        successfulUploads: successfulUploads.length,
        failedUploads: failedUploads.length,
        skippedUploads: skippedUploads.length,
        removedCertificates,
        failedRemovals,
        skippedCertificates: Object.keys(certificateMap).length - setCertificates.length
      },
      "Azure Key Vault certificate sync completed"
    );

    if (failedUploads.length > 0) {
      const failedReasons = failedUploads.map((failure) => {
        if (failure.status === "rejected") {
          return (failure.reason as Error)?.message || "Unknown error";
        }
        return "Unknown error";
      });

      logger.error(
        {
          syncId: pkiSync.id,
          failedReasons,
          failedCount: failedUploads.length
        },
        "Some certificates failed to upload to Azure Key Vault"
      );

      throw new PkiSyncError({
        message: `Failed to upload ${failedUploads.length} certificate(s) to Azure Key Vault`,
        context: {
          failedReasons,
          totalCertificates: setCertificates.length,
          failedCount: failedUploads.length
        }
      });
    }

    return {
      uploaded: setCertificates.length,
      removed: removedCertificates,
      failedRemovals,
      skipped: Object.keys(certificateMap).length - setCertificates.length
    };
  };

  const importCertificates = async (pkiSync: TAzureKeyVaultPkiSyncWithCredentials): Promise<TCertificateMap> => {
    const { accessToken } = await getAzureConnectionAccessToken(pkiSync.connection.id, appConnectionDAL, kmsService);

    const { vaultCertificates } = await $getAzureKeyVaultCertificates(
      accessToken,
      pkiSync.destinationConfig.vaultBaseUrl
    );

    return vaultCertificates;
  };

  const removeCertificates = async (pkiSync: TAzureKeyVaultPkiSyncWithCredentials, certificateNames: string[]) => {
    const { accessToken } = await getAzureConnectionAccessToken(pkiSync.connection.id, appConnectionDAL, kmsService);

    // Only remove certificates that are managed by Infisical (start with 'Infisical-' prefix)
    const infisicalManagedCertNames = certificateNames.filter((certName) => certName.startsWith("Infisical-"));

    if (infisicalManagedCertNames.length < certificateNames.length) {
      logger.debug(
        {
          syncId: pkiSync.id,
          totalRequested: certificateNames.length,
          infisicalManaged: infisicalManagedCertNames.length,
          skipped: certificateNames.length - infisicalManagedCertNames.length
        },
        "Filtered out non-Infisical certificates from removal request"
      );
    }

    const removePromises = infisicalManagedCertNames.map(async (certName) => {
      try {
        const response = await request.delete(
          `${pkiSync.destinationConfig.vaultBaseUrl}/certificates/${encodeURIComponent(certName)}?api-version=7.4`,
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
            logger.info(
              { syncId: pkiSync.id, certificateName: certName },
              "Certificate not found in Azure Key Vault - considering removal successful"
            );
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
    });

    const results = await Promise.allSettled(removePromises);
    const failedRemovals = results.filter((result) => result.status === "rejected");

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
          totalCertificates: infisicalManagedCertNames.length,
          failedCount: failedRemovals.length
        }
      });
    }

    return {
      removed: infisicalManagedCertNames.length - failedRemovals.length,
      failed: failedRemovals.length,
      skipped: certificateNames.length - infisicalManagedCertNames.length
    };
  };

  return {
    syncCertificates,
    importCertificates,
    removeCertificates
  };
};
