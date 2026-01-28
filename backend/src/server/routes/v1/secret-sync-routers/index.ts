import { registerChefSyncRouter } from "@app/ee/routes/v1/secret-sync-routers/chef-sync-router";
import { registerOCIVaultSyncRouter } from "@app/ee/routes/v1/secret-sync-routers/oci-vault-sync-router";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerOnePassSyncRouter } from "./1password-sync-router";
import { registerAwsParameterStoreSyncRouter } from "./aws-parameter-store-sync-router";
import { registerAwsSecretsManagerSyncRouter } from "./aws-secrets-manager-sync-router";
import { registerAzureAppConfigurationSyncRouter } from "./azure-app-configuration-sync-router";
import { registerAzureDevOpsSyncRouter } from "./azure-devops-sync-router";
import { registerAzureKeyVaultSyncRouter } from "./azure-key-vault-sync-router";
import { registerBitbucketSyncRouter } from "./bitbucket-sync-router";
import { registerCamundaSyncRouter } from "./camunda-sync-router";
import { registerCircleCISyncRouter } from "./circleci-sync-router";
import { registerChecklySyncRouter } from "./checkly-sync-router";
import { registerCloudflarePagesSyncRouter } from "./cloudflare-pages-sync-router";
import { registerCloudflareWorkersSyncRouter } from "./cloudflare-workers-sync-router";
import { registerDatabricksSyncRouter } from "./databricks-sync-router";
import { registerDigitalOceanAppPlatformSyncRouter } from "./digital-ocean-app-platform-sync-router";
import { registerFlyioSyncRouter } from "./flyio-sync-router";
import { registerGcpSyncRouter } from "./gcp-sync-router";
import { registerGitHubSyncRouter } from "./github-sync-router";
import { registerGitLabSyncRouter } from "./gitlab-sync-router";
import { registerHCVaultSyncRouter } from "./hc-vault-sync-router";
import { registerHerokuSyncRouter } from "./heroku-sync-router";
import { registerHumanitecSyncRouter } from "./humanitec-sync-router";
import { registerLaravelForgeSyncRouter } from "./laravel-forge-sync-router";
import { registerNetlifySyncRouter } from "./netlify-sync-router";
import { registerNorthflankSyncRouter } from "./northflank-sync-router";
import { registerOctopusDeploySyncRouter } from "./octopus-deploy-sync-router";
import { registerRailwaySyncRouter } from "./railway-sync-router";
import { registerRenderSyncRouter } from "./render-sync-router";
import { registerSupabaseSyncRouter } from "./supabase-sync-router";
import { registerTeamCitySyncRouter } from "./teamcity-sync-router";
import { registerTerraformCloudSyncRouter } from "./terraform-cloud-sync-router";
import { registerVercelSyncRouter } from "./vercel-sync-router";
import { registerWindmillSyncRouter } from "./windmill-sync-router";
import { registerZabbixSyncRouter } from "./zabbix-sync-router";

export * from "./secret-sync-router";

export const SECRET_SYNC_REGISTER_ROUTER_MAP: Record<SecretSync, (server: FastifyZodProvider) => Promise<void>> = {
  [SecretSync.AWSParameterStore]: registerAwsParameterStoreSyncRouter,
  [SecretSync.AWSSecretsManager]: registerAwsSecretsManagerSyncRouter,
  [SecretSync.GitHub]: registerGitHubSyncRouter,
  [SecretSync.GCPSecretManager]: registerGcpSyncRouter,
  [SecretSync.AzureKeyVault]: registerAzureKeyVaultSyncRouter,
  [SecretSync.AzureAppConfiguration]: registerAzureAppConfigurationSyncRouter,
  [SecretSync.AzureDevOps]: registerAzureDevOpsSyncRouter,
  [SecretSync.Databricks]: registerDatabricksSyncRouter,
  [SecretSync.Humanitec]: registerHumanitecSyncRouter,
  [SecretSync.TerraformCloud]: registerTerraformCloudSyncRouter,
  [SecretSync.Camunda]: registerCamundaSyncRouter,
  [SecretSync.Vercel]: registerVercelSyncRouter,
  [SecretSync.Windmill]: registerWindmillSyncRouter,
  [SecretSync.HCVault]: registerHCVaultSyncRouter,
  [SecretSync.TeamCity]: registerTeamCitySyncRouter,
  [SecretSync.OCIVault]: registerOCIVaultSyncRouter,
  [SecretSync.OnePass]: registerOnePassSyncRouter,
  [SecretSync.Heroku]: registerHerokuSyncRouter,
  [SecretSync.Render]: registerRenderSyncRouter,
  [SecretSync.Flyio]: registerFlyioSyncRouter,
  [SecretSync.GitLab]: registerGitLabSyncRouter,
  [SecretSync.CloudflarePages]: registerCloudflarePagesSyncRouter,
  [SecretSync.CloudflareWorkers]: registerCloudflareWorkersSyncRouter,
  [SecretSync.Supabase]: registerSupabaseSyncRouter,
  [SecretSync.Zabbix]: registerZabbixSyncRouter,
  [SecretSync.Railway]: registerRailwaySyncRouter,
  [SecretSync.Checkly]: registerChecklySyncRouter,
  [SecretSync.DigitalOceanAppPlatform]: registerDigitalOceanAppPlatformSyncRouter,
  [SecretSync.Netlify]: registerNetlifySyncRouter,
  [SecretSync.Northflank]: registerNorthflankSyncRouter,
  [SecretSync.Bitbucket]: registerBitbucketSyncRouter,
  [SecretSync.LaravelForge]: registerLaravelForgeSyncRouter,
  [SecretSync.Chef]: registerChefSyncRouter,
  [SecretSync.OctopusDeploy]: registerOctopusDeploySyncRouter,
  [SecretSync.CircleCI]: registerCircleCISyncRouter
};
