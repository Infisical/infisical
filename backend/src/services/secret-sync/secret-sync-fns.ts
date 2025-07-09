import { AxiosError } from "axios";
import handlebars from "handlebars";

import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OCI_VAULT_SYNC_LIST_OPTION, OCIVaultSyncFns } from "@app/ee/services/secret-sync/oci-vault";
import { BadRequestError } from "@app/lib/errors";
import {
  AWS_PARAMETER_STORE_SYNC_LIST_OPTION,
  AwsParameterStoreSyncFns
} from "@app/services/secret-sync/aws-parameter-store";
import {
  AWS_SECRETS_MANAGER_SYNC_LIST_OPTION,
  AwsSecretsManagerSyncFns
} from "@app/services/secret-sync/aws-secrets-manager";
import { DATABRICKS_SYNC_LIST_OPTION, databricksSyncFactory } from "@app/services/secret-sync/databricks";
import { GITHUB_SYNC_LIST_OPTION, GithubSyncFns } from "@app/services/secret-sync/github";
import { SecretSync, SecretSyncPlanType } from "@app/services/secret-sync/secret-sync-enums";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import {
  TSecretMap,
  TSecretSyncListItem,
  TSecretSyncWithCredentials
} from "@app/services/secret-sync/secret-sync-types";

import { TAppConnectionDALFactory } from "../app-connection/app-connection-dal";
import { TKmsServiceFactory } from "../kms/kms-service";
import { ONEPASS_SYNC_LIST_OPTION, OnePassSyncFns } from "./1password";
import { AZURE_APP_CONFIGURATION_SYNC_LIST_OPTION, azureAppConfigurationSyncFactory } from "./azure-app-configuration";
import { AZURE_DEVOPS_SYNC_LIST_OPTION, azureDevOpsSyncFactory } from "./azure-devops";
import { AZURE_KEY_VAULT_SYNC_LIST_OPTION, azureKeyVaultSyncFactory } from "./azure-key-vault";
import { CAMUNDA_SYNC_LIST_OPTION, camundaSyncFactory } from "./camunda";
import { CLOUDFLARE_PAGES_SYNC_LIST_OPTION } from "./cloudflare-pages/cloudflare-pages-constants";
import { CloudflarePagesSyncFns } from "./cloudflare-pages/cloudflare-pages-fns";
import { FLYIO_SYNC_LIST_OPTION, FlyioSyncFns } from "./flyio";
import { GCP_SYNC_LIST_OPTION } from "./gcp";
import { GcpSyncFns } from "./gcp/gcp-sync-fns";
import { GITLAB_SYNC_LIST_OPTION, GitLabSyncFns } from "./gitlab";
import { HC_VAULT_SYNC_LIST_OPTION, HCVaultSyncFns } from "./hc-vault";
import { HEROKU_SYNC_LIST_OPTION, HerokuSyncFns } from "./heroku";
import { HUMANITEC_SYNC_LIST_OPTION } from "./humanitec";
import { HumanitecSyncFns } from "./humanitec/humanitec-sync-fns";
import { RENDER_SYNC_LIST_OPTION, RenderSyncFns } from "./render";
import { SECRET_SYNC_PLAN_MAP } from "./secret-sync-maps";
import { TEAMCITY_SYNC_LIST_OPTION, TeamCitySyncFns } from "./teamcity";
import { TERRAFORM_CLOUD_SYNC_LIST_OPTION, TerraformCloudSyncFns } from "./terraform-cloud";
import { VERCEL_SYNC_LIST_OPTION, VercelSyncFns } from "./vercel";
import { WINDMILL_SYNC_LIST_OPTION, WindmillSyncFns } from "./windmill";
import { ZABBIX_SYNC_LIST_OPTION, ZabbixSyncFns } from "./zabbix";

const SECRET_SYNC_LIST_OPTIONS: Record<SecretSync, TSecretSyncListItem> = {
  [SecretSync.AWSParameterStore]: AWS_PARAMETER_STORE_SYNC_LIST_OPTION,
  [SecretSync.AWSSecretsManager]: AWS_SECRETS_MANAGER_SYNC_LIST_OPTION,
  [SecretSync.GitHub]: GITHUB_SYNC_LIST_OPTION,
  [SecretSync.GCPSecretManager]: GCP_SYNC_LIST_OPTION,
  [SecretSync.AzureKeyVault]: AZURE_KEY_VAULT_SYNC_LIST_OPTION,
  [SecretSync.AzureDevOps]: AZURE_DEVOPS_SYNC_LIST_OPTION,
  [SecretSync.AzureAppConfiguration]: AZURE_APP_CONFIGURATION_SYNC_LIST_OPTION,
  [SecretSync.Databricks]: DATABRICKS_SYNC_LIST_OPTION,
  [SecretSync.Humanitec]: HUMANITEC_SYNC_LIST_OPTION,
  [SecretSync.TerraformCloud]: TERRAFORM_CLOUD_SYNC_LIST_OPTION,
  [SecretSync.Camunda]: CAMUNDA_SYNC_LIST_OPTION,
  [SecretSync.Vercel]: VERCEL_SYNC_LIST_OPTION,
  [SecretSync.Windmill]: WINDMILL_SYNC_LIST_OPTION,
  [SecretSync.HCVault]: HC_VAULT_SYNC_LIST_OPTION,
  [SecretSync.TeamCity]: TEAMCITY_SYNC_LIST_OPTION,
  [SecretSync.OCIVault]: OCI_VAULT_SYNC_LIST_OPTION,
  [SecretSync.OnePass]: ONEPASS_SYNC_LIST_OPTION,
  [SecretSync.Heroku]: HEROKU_SYNC_LIST_OPTION,
  [SecretSync.Render]: RENDER_SYNC_LIST_OPTION,
  [SecretSync.Flyio]: FLYIO_SYNC_LIST_OPTION,
  [SecretSync.GitLab]: GITLAB_SYNC_LIST_OPTION,
  [SecretSync.CloudflarePages]: CLOUDFLARE_PAGES_SYNC_LIST_OPTION,
  [SecretSync.Zabbix]: ZABBIX_SYNC_LIST_OPTION
};

export const listSecretSyncOptions = () => {
  return Object.values(SECRET_SYNC_LIST_OPTIONS).sort((a, b) => a.name.localeCompare(b.name));
};

type TSyncSecretDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update" | "updateById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

// Add schema to secret keys
const addSchema = (unprocessedSecretMap: TSecretMap, environment: string, schema?: string): TSecretMap => {
  if (!schema) return unprocessedSecretMap;

  const processedSecretMap: TSecretMap = {};

  for (const [key, value] of Object.entries(unprocessedSecretMap)) {
    const newKey = handlebars.compile(schema)({
      secretKey: key,
      environment
    });

    processedSecretMap[newKey] = value;
  }

  return processedSecretMap;
};

// Strip schema from secret keys
const stripSchema = (unprocessedSecretMap: TSecretMap, environment: string, schema?: string): TSecretMap => {
  if (!schema) return unprocessedSecretMap;

  const compiledSchemaPattern = handlebars.compile(schema)({
    secretKey: "{{secretKey}}", // Keep secretKey
    environment
  });

  const parts = compiledSchemaPattern.split("{{secretKey}}");
  const prefix = parts[0];
  const suffix = parts[parts.length - 1];

  const strippedMap: TSecretMap = {};

  for (const [key, value] of Object.entries(unprocessedSecretMap)) {
    if (!key.startsWith(prefix) || !key.endsWith(suffix)) {
      // eslint-disable-next-line no-continue
      continue;
    }

    const strippedKey = key.slice(prefix.length, key.length - suffix.length);
    strippedMap[strippedKey] = value;
  }

  return strippedMap;
};

// Checks if a key matches a schema
export const matchesSchema = (key: string, environment: string, schema?: string): boolean => {
  if (!schema) return true;

  const compiledSchemaPattern = handlebars.compile(schema)({
    secretKey: "{{secretKey}}", // Keep secretKey
    environment
  });

  // This edge-case shouldn't be possible
  if (!compiledSchemaPattern.includes("{{secretKey}}")) {
    return key === compiledSchemaPattern;
  }

  const parts = compiledSchemaPattern.split("{{secretKey}}");
  const prefix = parts[0];
  const suffix = parts[parts.length - 1];

  if (prefix === "" && suffix === "") return true;

  // If prefix is empty, key must end with suffix
  if (prefix === "") return key.endsWith(suffix);

  // If suffix is empty, key must start with prefix
  if (suffix === "") return key.startsWith(prefix);

  return key.startsWith(prefix) && key.endsWith(suffix) && key.length >= prefix.length + suffix.length;
};

// Filter only for secrets with keys that match the schema
const filterForSchema = (secretMap: TSecretMap, environment: string, schema?: string): TSecretMap => {
  const filteredMap: TSecretMap = {};

  for (const [key, value] of Object.entries(secretMap)) {
    if (matchesSchema(key, environment, schema)) {
      filteredMap[key] = value;
    }
  }

  return filteredMap;
};

export const SecretSyncFns = {
  syncSecrets: (
    secretSync: TSecretSyncWithCredentials,
    secretMap: TSecretMap,
    { kmsService, appConnectionDAL }: TSyncSecretDeps
  ): Promise<void> => {
    const schemaSecretMap = addSchema(secretMap, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema);

    switch (secretSync.destination) {
      case SecretSync.AWSParameterStore:
        return AwsParameterStoreSyncFns.syncSecrets(secretSync, schemaSecretMap);
      case SecretSync.AWSSecretsManager:
        return AwsSecretsManagerSyncFns.syncSecrets(secretSync, schemaSecretMap);
      case SecretSync.GitHub:
        return GithubSyncFns.syncSecrets(secretSync, schemaSecretMap);
      case SecretSync.GCPSecretManager:
        return GcpSyncFns.syncSecrets(secretSync, schemaSecretMap);
      case SecretSync.AzureKeyVault:
        return azureKeyVaultSyncFactory({
          appConnectionDAL,
          kmsService
        }).syncSecrets(secretSync, schemaSecretMap);
      case SecretSync.AzureAppConfiguration:
        return azureAppConfigurationSyncFactory({
          appConnectionDAL,
          kmsService
        }).syncSecrets(secretSync, schemaSecretMap);
      case SecretSync.AzureDevOps:
        return azureDevOpsSyncFactory({
          appConnectionDAL,
          kmsService
        }).syncSecrets(secretSync, schemaSecretMap);
      case SecretSync.Databricks:
        return databricksSyncFactory({
          appConnectionDAL,
          kmsService
        }).syncSecrets(secretSync, schemaSecretMap);
      case SecretSync.Humanitec:
        return HumanitecSyncFns.syncSecrets(secretSync, schemaSecretMap);
      case SecretSync.TerraformCloud:
        return TerraformCloudSyncFns.syncSecrets(secretSync, schemaSecretMap);
      case SecretSync.Camunda:
        return camundaSyncFactory({
          appConnectionDAL,
          kmsService
        }).syncSecrets(secretSync, schemaSecretMap);
      case SecretSync.Heroku:
        return HerokuSyncFns.syncSecrets(secretSync, schemaSecretMap, { appConnectionDAL, kmsService });
      case SecretSync.Vercel:
        return VercelSyncFns.syncSecrets(secretSync, schemaSecretMap);
      case SecretSync.Windmill:
        return WindmillSyncFns.syncSecrets(secretSync, schemaSecretMap);
      case SecretSync.HCVault:
        return HCVaultSyncFns.syncSecrets(secretSync, schemaSecretMap);
      case SecretSync.TeamCity:
        return TeamCitySyncFns.syncSecrets(secretSync, schemaSecretMap);
      case SecretSync.OCIVault:
        return OCIVaultSyncFns.syncSecrets(secretSync, schemaSecretMap);
      case SecretSync.OnePass:
        return OnePassSyncFns.syncSecrets(secretSync, schemaSecretMap);
      case SecretSync.Render:
        return RenderSyncFns.syncSecrets(secretSync, schemaSecretMap);
      case SecretSync.Flyio:
        return FlyioSyncFns.syncSecrets(secretSync, schemaSecretMap);
      case SecretSync.GitLab:
        return GitLabSyncFns.syncSecrets(secretSync, schemaSecretMap, { appConnectionDAL, kmsService });
      case SecretSync.CloudflarePages:
        return CloudflarePagesSyncFns.syncSecrets(secretSync, schemaSecretMap);
      case SecretSync.Zabbix:
        return ZabbixSyncFns.syncSecrets(secretSync, schemaSecretMap);
      default:
        throw new Error(
          `Unhandled sync destination for sync secrets fns: ${(secretSync as TSecretSyncWithCredentials).destination}`
        );
    }
  },
  getSecrets: async (
    secretSync: TSecretSyncWithCredentials,
    { kmsService, appConnectionDAL }: TSyncSecretDeps
  ): Promise<TSecretMap> => {
    let secretMap: TSecretMap;
    switch (secretSync.destination) {
      case SecretSync.AWSParameterStore:
        secretMap = await AwsParameterStoreSyncFns.getSecrets(secretSync);
        break;
      case SecretSync.AWSSecretsManager:
        secretMap = await AwsSecretsManagerSyncFns.getSecrets(secretSync);
        break;
      case SecretSync.GitHub:
        secretMap = await GithubSyncFns.getSecrets(secretSync);
        break;
      case SecretSync.GCPSecretManager:
        secretMap = await GcpSyncFns.getSecrets(secretSync);
        break;
      case SecretSync.AzureKeyVault:
        secretMap = await azureKeyVaultSyncFactory({
          appConnectionDAL,
          kmsService
        }).getSecrets(secretSync);
        break;
      case SecretSync.AzureAppConfiguration:
        secretMap = await azureAppConfigurationSyncFactory({
          appConnectionDAL,
          kmsService
        }).getSecrets(secretSync);
        break;
      case SecretSync.AzureDevOps:
        secretMap = await azureDevOpsSyncFactory({
          appConnectionDAL,
          kmsService
        }).getSecrets(secretSync);
        break;
      case SecretSync.Databricks:
        return databricksSyncFactory({
          appConnectionDAL,
          kmsService
        }).getSecrets(secretSync);
      case SecretSync.Humanitec:
        secretMap = await HumanitecSyncFns.getSecrets(secretSync);
        break;
      case SecretSync.TerraformCloud:
        secretMap = await TerraformCloudSyncFns.getSecrets(secretSync);
        break;
      case SecretSync.Camunda:
        secretMap = await camundaSyncFactory({
          appConnectionDAL,
          kmsService
        }).getSecrets(secretSync);
        break;
      case SecretSync.Vercel:
        secretMap = await VercelSyncFns.getSecrets(secretSync);
        break;
      case SecretSync.Windmill:
        secretMap = await WindmillSyncFns.getSecrets(secretSync);
        break;
      case SecretSync.HCVault:
        secretMap = await HCVaultSyncFns.getSecrets(secretSync);
        break;
      case SecretSync.TeamCity:
        secretMap = await TeamCitySyncFns.getSecrets(secretSync);
        break;
      case SecretSync.OCIVault:
        secretMap = await OCIVaultSyncFns.getSecrets(secretSync);
        break;
      case SecretSync.OnePass:
        secretMap = await OnePassSyncFns.getSecrets(secretSync);
        break;
      case SecretSync.Heroku:
        secretMap = await HerokuSyncFns.getSecrets(secretSync, { appConnectionDAL, kmsService });
        break;
      case SecretSync.Render:
        secretMap = await RenderSyncFns.getSecrets(secretSync);
        break;
      case SecretSync.Flyio:
        secretMap = await FlyioSyncFns.getSecrets(secretSync);
        break;
      case SecretSync.GitLab:
        secretMap = await GitLabSyncFns.getSecrets(secretSync);
        break;
      case SecretSync.CloudflarePages:
        secretMap = await CloudflarePagesSyncFns.getSecrets(secretSync);
        break;
      case SecretSync.Zabbix:
        secretMap = await ZabbixSyncFns.getSecrets(secretSync);
        break;
      default:
        throw new Error(
          `Unhandled sync destination for get secrets fns: ${(secretSync as TSecretSyncWithCredentials).destination}`
        );
    }

    const filtered = filterForSchema(secretMap, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema);
    const stripped = stripSchema(filtered, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema);
    return stripped;
  },
  removeSecrets: (
    secretSync: TSecretSyncWithCredentials,
    secretMap: TSecretMap,
    { kmsService, appConnectionDAL }: TSyncSecretDeps
  ): Promise<void> => {
    const schemaSecretMap = addSchema(secretMap, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema);

    switch (secretSync.destination) {
      case SecretSync.AWSParameterStore:
        return AwsParameterStoreSyncFns.removeSecrets(secretSync, schemaSecretMap);
      case SecretSync.AWSSecretsManager:
        return AwsSecretsManagerSyncFns.removeSecrets(secretSync, schemaSecretMap);
      case SecretSync.GitHub:
        return GithubSyncFns.removeSecrets(secretSync, schemaSecretMap);
      case SecretSync.GCPSecretManager:
        return GcpSyncFns.removeSecrets(secretSync, schemaSecretMap);
      case SecretSync.AzureKeyVault:
        return azureKeyVaultSyncFactory({
          appConnectionDAL,
          kmsService
        }).removeSecrets(secretSync, schemaSecretMap);
      case SecretSync.AzureAppConfiguration:
        return azureAppConfigurationSyncFactory({
          appConnectionDAL,
          kmsService
        }).removeSecrets(secretSync, schemaSecretMap);
      case SecretSync.AzureDevOps:
        return azureDevOpsSyncFactory({
          appConnectionDAL,
          kmsService
        }).removeSecrets(secretSync);
      case SecretSync.Databricks:
        return databricksSyncFactory({
          appConnectionDAL,
          kmsService
        }).removeSecrets(secretSync, schemaSecretMap);
      case SecretSync.Humanitec:
        return HumanitecSyncFns.removeSecrets(secretSync, schemaSecretMap);
      case SecretSync.TerraformCloud:
        return TerraformCloudSyncFns.removeSecrets(secretSync, schemaSecretMap);
      case SecretSync.Camunda:
        return camundaSyncFactory({
          appConnectionDAL,
          kmsService
        }).removeSecrets(secretSync, schemaSecretMap);
      case SecretSync.Vercel:
        return VercelSyncFns.removeSecrets(secretSync, schemaSecretMap);
      case SecretSync.Windmill:
        return WindmillSyncFns.removeSecrets(secretSync, schemaSecretMap);
      case SecretSync.HCVault:
        return HCVaultSyncFns.removeSecrets(secretSync, schemaSecretMap);
      case SecretSync.TeamCity:
        return TeamCitySyncFns.removeSecrets(secretSync, schemaSecretMap);
      case SecretSync.OCIVault:
        return OCIVaultSyncFns.removeSecrets(secretSync, schemaSecretMap);
      case SecretSync.OnePass:
        return OnePassSyncFns.removeSecrets(secretSync, schemaSecretMap);
      case SecretSync.Heroku:
        return HerokuSyncFns.removeSecrets(secretSync, schemaSecretMap, { appConnectionDAL, kmsService });
      case SecretSync.Render:
        return RenderSyncFns.removeSecrets(secretSync, schemaSecretMap);
      case SecretSync.Flyio:
        return FlyioSyncFns.removeSecrets(secretSync, schemaSecretMap);
      case SecretSync.GitLab:
        return GitLabSyncFns.removeSecrets(secretSync, schemaSecretMap, { appConnectionDAL, kmsService });
      case SecretSync.CloudflarePages:
        return CloudflarePagesSyncFns.removeSecrets(secretSync, schemaSecretMap);
      case SecretSync.Zabbix:
        return ZabbixSyncFns.removeSecrets(secretSync, schemaSecretMap);
      default:
        throw new Error(
          `Unhandled sync destination for remove secrets fns: ${(secretSync as TSecretSyncWithCredentials).destination}`
        );
    }
  }
};

const MAX_MESSAGE_LENGTH = 1024;

export const parseSyncErrorMessage = (err: unknown): string => {
  let errorMessage: string;

  if (err instanceof SecretSyncError) {
    errorMessage = JSON.stringify({
      secretKey: err.secretKey,
      error: err.message || parseSyncErrorMessage(err.error)
    });
  } else if (err instanceof AxiosError) {
    errorMessage = err?.response?.data
      ? JSON.stringify(err?.response?.data)
      : (err?.message ?? "An unknown error occurred.");
  } else {
    errorMessage = (err as Error)?.message || "An unknown error occurred.";
  }

  return errorMessage.length <= MAX_MESSAGE_LENGTH
    ? errorMessage
    : `${errorMessage.substring(0, MAX_MESSAGE_LENGTH - 3)}...`;
};

export const enterpriseSyncCheck = async (
  licenseService: Pick<TLicenseServiceFactory, "getPlan">,
  secretSync: SecretSync,
  orgId: string,
  errorMessage: string
) => {
  if (SECRET_SYNC_PLAN_MAP[secretSync] === SecretSyncPlanType.Enterprise) {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.enterpriseSecretSyncs)
      throw new BadRequestError({
        message: errorMessage
      });
  }
};
