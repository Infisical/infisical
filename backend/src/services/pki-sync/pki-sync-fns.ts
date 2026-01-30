import * as handlebars from "handlebars";
import { z, ZodSchema } from "zod";

import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { BadRequestError } from "@app/lib/errors";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSyncDALFactory } from "@app/services/certificate-sync/certificate-sync-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { AWS_CERTIFICATE_MANAGER_PKI_SYNC_LIST_OPTION } from "./aws-certificate-manager/aws-certificate-manager-pki-sync-constants";
import { awsCertificateManagerPkiSyncFactory } from "./aws-certificate-manager/aws-certificate-manager-pki-sync-fns";
import { AWS_ELASTIC_LOAD_BALANCER_PKI_SYNC_LIST_OPTION } from "./aws-elastic-load-balancer/aws-elastic-load-balancer-pki-sync-constants";
import { awsElasticLoadBalancerPkiSyncFactory } from "./aws-elastic-load-balancer/aws-elastic-load-balancer-pki-sync-fns";
import { AWS_SECRETS_MANAGER_PKI_SYNC_LIST_OPTION } from "./aws-secrets-manager/aws-secrets-manager-pki-sync-constants";
import { awsSecretsManagerPkiSyncFactory } from "./aws-secrets-manager/aws-secrets-manager-pki-sync-fns";
import { AZURE_KEY_VAULT_PKI_SYNC_LIST_OPTION } from "./azure-key-vault/azure-key-vault-pki-sync-constants";
import { azureKeyVaultPkiSyncFactory } from "./azure-key-vault/azure-key-vault-pki-sync-fns";
import { chefPkiSyncFactory } from "./chef/chef-pki-sync-fns";
import { CHEF_PKI_SYNC_LIST_OPTION } from "./chef/chef-pki-sync-list-constants";
import { PkiSync } from "./pki-sync-enums";
import { TCertificateMap, TPkiSyncWithCredentials } from "./pki-sync-types";

const ENTERPRISE_PKI_SYNCS: PkiSync[] = [];

const PKI_SYNC_LIST_OPTIONS = {
  [PkiSync.AzureKeyVault]: AZURE_KEY_VAULT_PKI_SYNC_LIST_OPTION,
  [PkiSync.AwsCertificateManager]: AWS_CERTIFICATE_MANAGER_PKI_SYNC_LIST_OPTION,
  [PkiSync.AwsSecretsManager]: AWS_SECRETS_MANAGER_PKI_SYNC_LIST_OPTION,
  [PkiSync.AwsElasticLoadBalancer]: AWS_ELASTIC_LOAD_BALANCER_PKI_SYNC_LIST_OPTION,
  [PkiSync.Chef]: CHEF_PKI_SYNC_LIST_OPTION
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

const checkPkiSyncDestination = (pkiSync: TPkiSyncWithCredentials, destination: PkiSync): void => {
  if (pkiSync.destination !== destination) {
    throw new Error(`Invalid PKI sync destination: ${pkiSync.destination}`);
  }
};

export const PkiSyncFns = {
  getCertificates: async (
    pkiSync: TPkiSyncWithCredentials,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    dependencies: {
      appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">;
      kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
      certificateDAL: TCertificateDALFactory;
      certificateSyncDAL: TCertificateSyncDALFactory;
    }
  ): Promise<TCertificateMap> => {
    switch (pkiSync.destination) {
      case PkiSync.AzureKeyVault: {
        throw new Error(
          "Azure Key Vault does not support importing certificates into Infisical (private keys cannot be extracted)"
        );
      }
      case PkiSync.AwsCertificateManager: {
        throw new Error(
          "AWS Certificate Manager does not support importing certificates into Infisical (private keys cannot be extracted)"
        );
      }
      case PkiSync.AwsSecretsManager: {
        throw new Error("AWS Secrets Manager does not support importing certificates into Infisical");
      }
      case PkiSync.Chef: {
        throw new Error(
          "Chef does not support importing certificates into Infisical (private keys cannot be extracted securely)"
        );
      }
      case PkiSync.AwsElasticLoadBalancer: {
        throw new Error(
          "AWS Elastic Load Balancer does not support importing certificates into Infisical (certificates are stored in ACM)"
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
      certificateDAL: TCertificateDALFactory;
      certificateSyncDAL: TCertificateSyncDALFactory;
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
      validationErrors?: Array<{ name: string; error: string }>;
    };
  }> => {
    switch (pkiSync.destination) {
      case PkiSync.AzureKeyVault: {
        checkPkiSyncDestination(pkiSync, PkiSync.AzureKeyVault as PkiSync);
        const azureKeyVaultPkiSync = azureKeyVaultPkiSyncFactory({
          appConnectionDAL: dependencies.appConnectionDAL,
          kmsService: dependencies.kmsService,
          certificateDAL: dependencies.certificateDAL,
          certificateSyncDAL: dependencies.certificateSyncDAL
        });
        return azureKeyVaultPkiSync.syncCertificates(pkiSync, certificateMap);
      }
      case PkiSync.AwsCertificateManager: {
        checkPkiSyncDestination(pkiSync, PkiSync.AwsCertificateManager as PkiSync);
        const awsCertificateManagerPkiSync = awsCertificateManagerPkiSyncFactory({
          appConnectionDAL: dependencies.appConnectionDAL,
          kmsService: dependencies.kmsService,
          certificateDAL: dependencies.certificateDAL,
          certificateSyncDAL: dependencies.certificateSyncDAL
        });
        return awsCertificateManagerPkiSync.syncCertificates(pkiSync, certificateMap);
      }
      case PkiSync.AwsSecretsManager: {
        checkPkiSyncDestination(pkiSync, PkiSync.AwsSecretsManager as PkiSync);
        const awsSecretsManagerPkiSync = awsSecretsManagerPkiSyncFactory({
          certificateDAL: dependencies.certificateDAL,
          certificateSyncDAL: dependencies.certificateSyncDAL
        });
        return awsSecretsManagerPkiSync.syncCertificates(pkiSync, certificateMap);
      }
      case PkiSync.Chef: {
        checkPkiSyncDestination(pkiSync, PkiSync.Chef as PkiSync);
        const chefPkiSync = chefPkiSyncFactory({
          certificateDAL: dependencies.certificateDAL,
          certificateSyncDAL: dependencies.certificateSyncDAL
        });
        return chefPkiSync.syncCertificates(pkiSync, certificateMap);
      }
      case PkiSync.AwsElasticLoadBalancer: {
        checkPkiSyncDestination(pkiSync, PkiSync.AwsElasticLoadBalancer as PkiSync);
        const awsElasticLoadBalancerPkiSync = awsElasticLoadBalancerPkiSyncFactory({
          appConnectionDAL: dependencies.appConnectionDAL,
          kmsService: dependencies.kmsService,
          certificateDAL: dependencies.certificateDAL,
          certificateSyncDAL: dependencies.certificateSyncDAL
        });
        return awsElasticLoadBalancerPkiSync.syncCertificates(pkiSync, certificateMap);
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
      certificateSyncDAL: TCertificateSyncDALFactory;
      certificateDAL: TCertificateDALFactory;
      certificateMap: TCertificateMap;
    }
  ): Promise<void> => {
    switch (pkiSync.destination) {
      case PkiSync.AzureKeyVault: {
        checkPkiSyncDestination(pkiSync, PkiSync.AzureKeyVault as PkiSync);
        const azureKeyVaultPkiSync = azureKeyVaultPkiSyncFactory({
          appConnectionDAL: dependencies.appConnectionDAL,
          kmsService: dependencies.kmsService,
          certificateDAL: dependencies.certificateDAL,
          certificateSyncDAL: dependencies.certificateSyncDAL
        });
        await azureKeyVaultPkiSync.removeCertificates(pkiSync, certificateNames, {
          certificateSyncDAL: dependencies.certificateSyncDAL,
          certificateMap: dependencies.certificateMap
        });
        break;
      }
      case PkiSync.AwsCertificateManager: {
        checkPkiSyncDestination(pkiSync, PkiSync.AwsCertificateManager as PkiSync);
        const awsCertificateManagerPkiSync = awsCertificateManagerPkiSyncFactory({
          appConnectionDAL: dependencies.appConnectionDAL,
          kmsService: dependencies.kmsService,
          certificateDAL: dependencies.certificateDAL,
          certificateSyncDAL: dependencies.certificateSyncDAL
        });
        await awsCertificateManagerPkiSync.removeCertificates(pkiSync, certificateNames, {
          certificateSyncDAL: dependencies.certificateSyncDAL,
          certificateMap: dependencies.certificateMap
        });
        break;
      }
      case PkiSync.AwsSecretsManager: {
        checkPkiSyncDestination(pkiSync, PkiSync.AwsSecretsManager as PkiSync);
        const awsSecretsManagerPkiSync = awsSecretsManagerPkiSyncFactory({
          certificateDAL: dependencies.certificateDAL,
          certificateSyncDAL: dependencies.certificateSyncDAL
        });
        await awsSecretsManagerPkiSync.removeCertificates(pkiSync, dependencies.certificateMap);
        break;
      }
      case PkiSync.Chef: {
        checkPkiSyncDestination(pkiSync, PkiSync.Chef as PkiSync);
        const chefPkiSync = chefPkiSyncFactory({
          certificateDAL: dependencies.certificateDAL,
          certificateSyncDAL: dependencies.certificateSyncDAL
        });
        await chefPkiSync.removeCertificates(pkiSync, certificateNames, {
          certificateSyncDAL: dependencies.certificateSyncDAL,
          certificateMap: dependencies.certificateMap
        });
        break;
      }
      case PkiSync.AwsElasticLoadBalancer: {
        checkPkiSyncDestination(pkiSync, PkiSync.AwsElasticLoadBalancer as PkiSync);
        const awsElasticLoadBalancerPkiSync = awsElasticLoadBalancerPkiSyncFactory({
          appConnectionDAL: dependencies.appConnectionDAL,
          kmsService: dependencies.kmsService,
          certificateDAL: dependencies.certificateDAL,
          certificateSyncDAL: dependencies.certificateSyncDAL
        });
        await awsElasticLoadBalancerPkiSync.removeCertificates(pkiSync, certificateNames, {
          certificateSyncDAL: dependencies.certificateSyncDAL,
          certificateMap: dependencies.certificateMap
        });
        break;
      }
      default:
        throw new Error(`Unsupported PKI sync destination: ${String(pkiSync.destination)}`);
    }
  }
};
