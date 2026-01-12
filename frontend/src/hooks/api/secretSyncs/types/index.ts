import { SecretSync, SecretSyncImportBehavior } from "@app/hooks/api/secretSyncs";
import { DiscriminativePick } from "@app/types";

import { TOnePassSync } from "./1password-sync";
import { TAwsParameterStoreSync } from "./aws-parameter-store-sync";
import { TAwsSecretsManagerSync } from "./aws-secrets-manager-sync";
import { TAzureAppConfigurationSync } from "./azure-app-configuration-sync";
import { TAzureDevOpsSync } from "./azure-devops-sync";
import { TAzureKeyVaultSync } from "./azure-key-vault-sync";
import { TBitbucketSync } from "./bitbucket-sync";
import { TCamundaSync } from "./camunda-sync";
import { TChecklySync } from "./checkly-sync";
import { TChefSync } from "./chef-sync";
import { TCloudflarePagesSync } from "./cloudflare-pages-sync";
import { TCloudflareWorkersSync } from "./cloudflare-workers-sync";
import { TDatabricksSync } from "./databricks-sync";
import { TDigitalOceanAppPlatformSync } from "./digital-ocean-app-platform-sync";
import { TFlyioSync } from "./flyio-sync";
import { TGcpSync } from "./gcp-sync";
import { TGitHubSync } from "./github-sync";
import { TGitLabSync } from "./gitlab-sync";
import { THCVaultSync } from "./hc-vault-sync";
import { THerokuSync } from "./heroku-sync";
import { THumanitecSync } from "./humanitec-sync";
import { TLaravelForgeSync } from "./laravel-forge-sync";
import { TNetlifySync } from "./netlify-sync";
import { TNorthflankSync } from "./northflank-sync";
import { TOCIVaultSync } from "./oci-vault-sync";
import { TOctopusDeploySync } from "./octopus-deploy-sync";
import { TRailwaySync } from "./railway-sync";
import { TRenderSync } from "./render-sync";
import { TSupabaseSync } from "./supabase";
import { TTeamCitySync } from "./teamcity-sync";
import { TTerraformCloudSync } from "./terraform-cloud-sync";
import { TTriggerDevSync } from "./trigger-dev-sync";
import { TVercelSync } from "./vercel-sync";
import { TWindmillSync } from "./windmill-sync";
import { TZabbixSync } from "./zabbix-sync";

export type TSecretSyncOption = {
  name: string;
  destination: SecretSync;
  canImportSecrets: boolean;
  enterprise?: boolean;
};

export type TSecretSync =
  | TAwsParameterStoreSync
  | TAwsSecretsManagerSync
  | TGitHubSync
  | TGcpSync
  | TAzureKeyVaultSync
  | TAzureAppConfigurationSync
  | TAzureDevOpsSync
  | TDatabricksSync
  | THumanitecSync
  | TTerraformCloudSync
  | TCamundaSync
  | TVercelSync
  | TWindmillSync
  | THCVaultSync
  | TTeamCitySync
  | TOCIVaultSync
  | TOnePassSync
  | THerokuSync
  | TRenderSync
  | TFlyioSync
  | TGitLabSync
  | TCloudflarePagesSync
  | TCloudflareWorkersSync
  | TZabbixSync
  | TRailwaySync
  | TChecklySync
  | TSupabaseSync
  | TTriggerDevSync
  | TDigitalOceanAppPlatformSync
  | TNetlifySync
  | TNorthflankSync
  | TBitbucketSync
  | TLaravelForgeSync
  | TChefSync
  | TOctopusDeploySync;

export type TListSecretSyncs = { secretSyncs: TSecretSync[] };

export type TListSecretSyncOptions = { secretSyncOptions: TSecretSyncOption[] };
export type TSecretSyncResponse = { secretSync: TSecretSync };

export type TCreateSecretSyncDTO = DiscriminativePick<
  TSecretSync,
  | "name"
  | "destinationConfig"
  | "description"
  | "connectionId"
  | "syncOptions"
  | "destination"
  | "isAutoSyncEnabled"
> & { environment: string; secretPath: string; projectId: string };

export type TUpdateSecretSyncDTO = Partial<
  Omit<TCreateSecretSyncDTO, "destination" | "projectId">
> & {
  destination: SecretSync;
  syncId: string;
  projectId: string;
};

export type TDeleteSecretSyncDTO = {
  destination: SecretSync;
  syncId: string;
  removeSecrets: boolean;
  projectId: string;
};

export type TTriggerSecretSyncSyncSecretsDTO = {
  destination: SecretSync;
  syncId: string;
  projectId: string;
};

export type TTriggerSecretSyncImportSecretsDTO = {
  destination: SecretSync;
  syncId: string;
  importBehavior: SecretSyncImportBehavior;
  projectId: string;
};

export type TTriggerSecretSyncRemoveSecretsDTO = {
  destination: SecretSync;
  syncId: string;
  projectId: string;
};
