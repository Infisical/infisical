import { z, ZodSchema } from "zod";

import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { BadRequestError } from "@app/lib/errors";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { AZURE_KEY_VAULT_PKI_SYNC_LIST_OPTION } from "./azure-key-vault/azure-key-vault-pki-sync-fns";
import { PkiSync } from "./pki-sync-enums";
import { TCertificateMap, TPkiSyncWithCredentials } from "./pki-sync-types";

const ENTERPRISE_PKI_SYNCS: PkiSync[] = [];

const PKI_SYNC_LIST_OPTIONS = {
  [PkiSync.AzureKeyVault]: AZURE_KEY_VAULT_PKI_SYNC_LIST_OPTION
};

export const enterprisePkiSyncCheck = async (
  licenseService: Pick<TLicenseServiceFactory, "getPlan">,
  orgId: string,
  pkiSyncDestination: PkiSync,
  errorMessage?: string
) => {
  const plan = await licenseService.getPlan(orgId);

  if (!plan.enterpriseCertificateSyncs && ENTERPRISE_PKI_SYNCS.includes(pkiSyncDestination)) {
    throw new BadRequestError({
      message: errorMessage || "Failed to create PKI sync due to plan restriction. Upgrade plan to create PKI sync."
    });
  }
};

export const listPkiSyncOptions = () => {
  return Object.values(PKI_SYNC_LIST_OPTIONS).sort((a, b) => a.name.localeCompare(b.name));
};

export const matchesSchema = <T extends ZodSchema>(schema: T, data: unknown): data is z.infer<T> => {
  return schema.safeParse(data).success;
};

export const parsePkiSyncErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "An unknown error occurred during PKI sync operation";
};

export const PkiSyncFns = {
  getCertificates: async (
    pkiSync: TPkiSyncWithCredentials,
    dependencies: {
      appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">;
      kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
    }
  ): Promise<TCertificateMap> => {
    switch (pkiSync.destination) {
      case PkiSync.AzureKeyVault: {
        const { azureKeyVaultPkiSyncFactory } = await import("./azure-key-vault/azure-key-vault-pki-sync-fns");
        const azureKeyVaultPkiSync = azureKeyVaultPkiSyncFactory(dependencies);
        // Type assertion needed due to destinationConfig type differences
        return azureKeyVaultPkiSync.importCertificates(
          pkiSync as unknown as import("./azure-key-vault/azure-key-vault-pki-sync-types").TAzureKeyVaultPkiSyncWithCredentials
        );
      }
      default:
        throw new Error(`Unsupported PKI sync destination: ${String(pkiSync.destination)}`);
    }
  },

  syncCertificates: async (
    pkiSync: TPkiSyncWithCredentials,
    certificateMap: TCertificateMap,
    dependencies: {
      appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">;
      kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
    }
  ): Promise<{
    uploaded: number;
    removed?: number;
    failedRemovals?: number;
    skipped: number;
  }> => {
    switch (pkiSync.destination) {
      case PkiSync.AzureKeyVault: {
        const { azureKeyVaultPkiSyncFactory } = await import("./azure-key-vault/azure-key-vault-pki-sync-fns");
        const azureKeyVaultPkiSync = azureKeyVaultPkiSyncFactory(dependencies);
        // Type assertion needed due to destinationConfig type differences
        return azureKeyVaultPkiSync.syncCertificates(
          pkiSync as unknown as import("./azure-key-vault/azure-key-vault-pki-sync-types").TAzureKeyVaultPkiSyncWithCredentials,
          certificateMap
        );
      }
      default:
        throw new Error(`Unsupported PKI sync destination: ${String(pkiSync.destination)}`);
    }
  },

  removeCertificates: async (
    pkiSync: TPkiSyncWithCredentials,
    certificateNames: string[],
    dependencies: {
      appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">;
      kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
    }
  ): Promise<void> => {
    switch (pkiSync.destination) {
      case PkiSync.AzureKeyVault: {
        const { azureKeyVaultPkiSyncFactory } = await import("./azure-key-vault/azure-key-vault-pki-sync-fns");
        const azureKeyVaultPkiSync = azureKeyVaultPkiSyncFactory(dependencies);
        // Type assertion needed due to destinationConfig type differences
        await azureKeyVaultPkiSync.removeCertificates(
          pkiSync as unknown as import("./azure-key-vault/azure-key-vault-pki-sync-types").TAzureKeyVaultPkiSyncWithCredentials,
          certificateNames
        );
        break;
      }
      default:
        throw new Error(`Unsupported PKI sync destination: ${String(pkiSync.destination)}`);
    }
  }
};
