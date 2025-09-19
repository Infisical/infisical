import * as handlebars from "handlebars";
import { z, ZodSchema } from "zod";

import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import {
  AZURE_KEY_VAULT_PKI_SYNC_LIST_OPTION,
  azureKeyVaultPkiSyncFactory
} from "./azure-key-vault/azure-key-vault-pki-sync-fns";
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

export const getPkiSyncProviderCapabilities = (destination: PkiSync) => {
  const providerOption = PKI_SYNC_LIST_OPTIONS[destination];
  if (!providerOption) {
    throw new BadRequestError({ message: `Unsupported PKI sync destination: ${destination}` });
  }

  return {
    canImportCertificates: providerOption.canImportCertificates,
    canRemoveCertificates: providerOption.canRemoveCertificates
  };
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

export const applyCertificateNameSchema = (
  certificateMap: TCertificateMap,
  environment: string,
  schema?: string
): TCertificateMap => {
  if (!schema) return certificateMap;

  const processedCertificateMap: TCertificateMap = {};

  for (const [certificateId, value] of Object.entries(certificateMap)) {
    const newName = handlebars.compile(schema)({
      certificateId,
      environment
    });

    processedCertificateMap[newName] = value;
  }

  return processedCertificateMap;
};

export const stripCertificateNameSchema = (
  certificateMap: TCertificateMap,
  environment: string,
  schema?: string
): TCertificateMap => {
  if (!schema) return certificateMap;

  const compiledSchemaPattern = handlebars.compile(schema)({
    certificateId: "{{certificateId}}",
    environment
  });

  const parts = compiledSchemaPattern.split("{{certificateId}}");
  const prefix = parts[0];
  const suffix = parts[parts.length - 1];

  const strippedMap: TCertificateMap = {};

  for (const [name, value] of Object.entries(certificateMap)) {
    if (!name.startsWith(prefix) || !name.endsWith(suffix)) {
      // eslint-disable-next-line no-continue
      continue;
    }

    const strippedName = name.slice(prefix.length, name.length - suffix.length);
    strippedMap[strippedName] = value;
  }

  return strippedMap;
};

export const matchesCertificateNameSchema = (name: string, environment: string, schema?: string): boolean => {
  if (!schema) return true;

  const compiledSchemaPattern = handlebars.compile(schema)({
    certificateId: "{{certificateId}}",
    environment
  });

  if (!compiledSchemaPattern.includes("{{certificateId}}")) {
    return name === compiledSchemaPattern;
  }

  const parts = compiledSchemaPattern.split("{{certificateId}}");
  const prefix = parts[0];
  const suffix = parts[parts.length - 1];

  if (prefix === "" && suffix === "") return true;

  // If prefix is empty, name must end with suffix
  if (prefix === "") return name.endsWith(suffix);

  // If suffix is empty, name must start with prefix
  if (suffix === "") return name.startsWith(prefix);

  // Name must start with prefix and end with suffix
  return name.startsWith(prefix) && name.endsWith(suffix);
};

const isAzureKeyVaultPkiSync = (pkiSync: TPkiSyncWithCredentials): boolean => {
  return pkiSync.destination === PkiSync.AzureKeyVault;
};

/**
 * Trigger auto sync for PKI syncs connected to a PKI subscriber when certificates are issued/revoked/deleted
 */
export const triggerAutoSyncForSubscriber = async (
  subscriberId: string,
  dependencies: {
    pkiSyncDAL: {
      find: (filter: { subscriberId: string; isAutoSyncEnabled: boolean }) => Promise<Array<{ id: string }>>;
    };
    pkiSyncQueue: {
      queuePkiSyncSyncCertificatesById: (params: { syncId: string }) => Promise<void>;
    };
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

export const PkiSyncFns = {
  getCertificates: async (
    pkiSync: TPkiSyncWithCredentials,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    dependencies: {
      appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">;
      kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
    }
  ): Promise<TCertificateMap> => {
    switch (pkiSync.destination) {
      case PkiSync.AzureKeyVault: {
        throw new Error(
          "Azure Key Vault does not support importing certificates into Infisical (private keys cannot be extracted)"
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
    details?: {
      failedUploads?: Array<{ name: string; error: string }>;
      failedRemovals?: Array<{ name: string; error: string }>;
      skippedCertificates?: Array<{ name: string; reason: string }>;
    };
  }> => {
    switch (pkiSync.destination) {
      case PkiSync.AzureKeyVault: {
        if (!isAzureKeyVaultPkiSync(pkiSync)) {
          throw new Error("Invalid Azure Key Vault PKI sync configuration");
        }
        const azureKeyVaultPkiSync = azureKeyVaultPkiSyncFactory(dependencies);
        return azureKeyVaultPkiSync.syncCertificates(pkiSync, certificateMap);
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
        if (!isAzureKeyVaultPkiSync(pkiSync)) {
          throw new Error("Invalid Azure Key Vault PKI sync configuration");
        }
        const azureKeyVaultPkiSync = azureKeyVaultPkiSyncFactory(dependencies);
        await azureKeyVaultPkiSync.removeCertificates(pkiSync, certificateNames);
        break;
      }
      default:
        throw new Error(`Unsupported PKI sync destination: ${String(pkiSync.destination)}`);
    }
  }
};
