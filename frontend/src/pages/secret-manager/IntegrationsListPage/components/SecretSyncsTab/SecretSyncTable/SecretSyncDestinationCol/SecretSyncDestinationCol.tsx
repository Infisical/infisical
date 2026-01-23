import { SecretSync, TSecretSync } from "@app/hooks/api/secretSyncs";

import { OnePassSyncDestinationCol } from "./1PasswordSyncDestinationCol";
import { AwsParameterStoreSyncDestinationCol } from "./AwsParameterStoreSyncDestinationCol";
import { AwsSecretsManagerSyncDestinationCol } from "./AwsSecretsManagerSyncDestinationCol";
import { AzureAppConfigurationDestinationSyncCol } from "./AzureAppConfigurationDestinationSyncCol";
import { AzureDevOpsSyncDestinationCol } from "./AzureDevOpsSyncDestinationCol";
import { AzureKeyVaultDestinationSyncCol } from "./AzureKeyVaultDestinationSyncCol";
import { BitbucketSyncDestinationCol } from "./BitbucketSyncDestinationCol";
import { CamundaSyncDestinationCol } from "./CamundaSyncDestinationCol";
import { ChecklySyncDestinationCol } from "./ChecklySyncDestinationCol";
import { ChefSyncDestinationCol } from "./ChefSyncDestinationCol";
import { CloudflarePagesSyncDestinationCol } from "./CloudflarePagesSyncDestinationCol";
import { CloudflareWorkersSyncDestinationCol } from "./CloudflareWorkersSyncDestinationCol";
import { CircleCISyncDestinationCol } from "./CircleCISyncDestinationCol";
import { DatabricksSyncDestinationCol } from "./DatabricksSyncDestinationCol";
import { DigitalOceanAppPlatformSyncDestinationCol } from "./DigitalOceanAppPlatformSyncDestinationCol";
import { FlyioSyncDestinationCol } from "./FlyioSyncDestinationCol";
import { GcpSyncDestinationCol } from "./GcpSyncDestinationCol";
import { GitHubSyncDestinationCol } from "./GitHubSyncDestinationCol";
import { GitLabSyncDestinationCol } from "./GitLabSyncDestinationCol";
import { HCVaultSyncDestinationCol } from "./HCVaultSyncDestinationCol";
import { HerokuSyncDestinationCol } from "./HerokuSyncDestinationCol";
import { HumanitecSyncDestinationCol } from "./HumanitecSyncDestinationCol";
import { LaravelForgeSyncDestinationCol } from "./LaravelForgeSyncDestinationCol";
import { NetlifySyncDestinationCol } from "./NetlifySyncDestinationCol";
import { NorthflankSyncDestinationCol } from "./NorthflankSyncDestinationCol";
import { OCIVaultSyncDestinationCol } from "./OCIVaultSyncDestinationCol";
import { OctopusDeploySyncDestinationCol } from "./OctopusDeploySyncDestinationCol";
import { RailwaySyncDestinationCol } from "./RailwaySyncDestinationCol";
import { RenderSyncDestinationCol } from "./RenderSyncDestinationCol";
import { SupabaseSyncDestinationCol } from "./SupabaseSyncDestinationCol";
import { TeamCitySyncDestinationCol } from "./TeamCitySyncDestinationCol";
import { TerraformCloudSyncDestinationCol } from "./TerraformCloudSyncDestinationCol";
import { VercelSyncDestinationCol } from "./VercelSyncDestinationCol";
import { WindmillSyncDestinationCol } from "./WindmillSyncDestinationCol";
import { ZabbixSyncDestinationCol } from "./ZabbixSyncDestinationCol";

type Props = {
  secretSync: TSecretSync;
};

export const SecretSyncDestinationCol = ({ secretSync }: Props) => {
  switch (secretSync.destination) {
    case SecretSync.AWSParameterStore:
      return <AwsParameterStoreSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.AWSSecretsManager:
      return <AwsSecretsManagerSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.GitHub:
      return <GitHubSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.GCPSecretManager:
      return <GcpSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.AzureKeyVault:
      return <AzureKeyVaultDestinationSyncCol secretSync={secretSync} />;
    case SecretSync.AzureAppConfiguration:
      return <AzureAppConfigurationDestinationSyncCol secretSync={secretSync} />;
    case SecretSync.Databricks:
      return <DatabricksSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.Humanitec:
      return <HumanitecSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.TerraformCloud:
      return <TerraformCloudSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.Camunda:
      return <CamundaSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.Vercel:
      return <VercelSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.Windmill:
      return <WindmillSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.HCVault:
      return <HCVaultSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.TeamCity:
      return <TeamCitySyncDestinationCol secretSync={secretSync} />;
    case SecretSync.OCIVault:
      return <OCIVaultSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.OnePass:
      return <OnePassSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.AzureDevOps:
      return <AzureDevOpsSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.Heroku:
      return <HerokuSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.Render:
      return <RenderSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.Flyio:
      return <FlyioSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.GitLab:
      return <GitLabSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.CloudflarePages:
      return <CloudflarePagesSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.CloudflareWorkers:
      return <CloudflareWorkersSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.Zabbix:
      return <ZabbixSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.Railway:
      return <RailwaySyncDestinationCol secretSync={secretSync} />;
    case SecretSync.Checkly:
      return <ChecklySyncDestinationCol secretSync={secretSync} />;
    case SecretSync.Supabase:
      return <SupabaseSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.DigitalOceanAppPlatform:
      return <DigitalOceanAppPlatformSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.Netlify:
      return <NetlifySyncDestinationCol secretSync={secretSync} />;
    case SecretSync.Northflank:
      return <NorthflankSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.Bitbucket:
      return <BitbucketSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.LaravelForge:
      return <LaravelForgeSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.Chef:
      return <ChefSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.OctopusDeploy:
      return <OctopusDeploySyncDestinationCol secretSync={secretSync} />;
    case SecretSync.CircleCI:
      return <CircleCISyncDestinationCol secretSync={secretSync} />;
    default:
      throw new Error(
        `Unhandled Secret Sync Destination Col: ${(secretSync as TSecretSync).destination}`
      );
  }
};
