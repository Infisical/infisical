import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerAwsParameterStoreSyncRouter } from "./aws-parameter-store-sync-router";
import { registerAwsSecretsManagerSyncRouter } from "./aws-secrets-manager-sync-router";
import { registerAzureAppConfigurationSyncRouter } from "./azure-app-configuration-sync-router";
import { registerAzureKeyVaultSyncRouter } from "./azure-key-vault-sync-router";
import { registerCamundaSyncRouter } from "./camunda-sync-router";
import { registerDatabricksSyncRouter } from "./databricks-sync-router";
import { registerGcpSyncRouter } from "./gcp-sync-router";
import { registerGitHubSyncRouter } from "./github-sync-router";
import { registerHCVaultSyncRouter } from "./hc-vault-sync-router";
import { registerHumanitecSyncRouter } from "./humanitec-sync-router";
import { registerTeamCitySyncRouter } from "./teamcity-sync-router";
import { registerTerraformCloudSyncRouter } from "./terraform-cloud-sync-router";
import { registerVercelSyncRouter } from "./vercel-sync-router";
import { registerWindmillSyncRouter } from "./windmill-sync-router";

export * from "./secret-sync-router";

export const SECRET_SYNC_REGISTER_ROUTER_MAP: Record<SecretSync, (server: FastifyZodProvider) => Promise<void>> = {
  [SecretSync.AWSParameterStore]: registerAwsParameterStoreSyncRouter,
  [SecretSync.AWSSecretsManager]: registerAwsSecretsManagerSyncRouter,
  [SecretSync.GitHub]: registerGitHubSyncRouter,
  [SecretSync.GCPSecretManager]: registerGcpSyncRouter,
  [SecretSync.AzureKeyVault]: registerAzureKeyVaultSyncRouter,
  [SecretSync.AzureAppConfiguration]: registerAzureAppConfigurationSyncRouter,
  [SecretSync.Databricks]: registerDatabricksSyncRouter,
  [SecretSync.Humanitec]: registerHumanitecSyncRouter,
  [SecretSync.TerraformCloud]: registerTerraformCloudSyncRouter,
  [SecretSync.Camunda]: registerCamundaSyncRouter,
  [SecretSync.Vercel]: registerVercelSyncRouter,
  [SecretSync.Windmill]: registerWindmillSyncRouter,
  [SecretSync.HCVault]: registerHCVaultSyncRouter,
  [SecretSync.TeamCity]: registerTeamCitySyncRouter
};
