import { useFormContext } from "react-hook-form";

import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";
import { OnePassSyncFields } from "./1PasswordSyncFields";
import { AwsParameterStoreSyncFields } from "./AwsParameterStoreSyncFields";
import { AwsSecretsManagerSyncFields } from "./AwsSecretsManagerSyncFields";
import { AzureAppConfigurationSyncFields } from "./AzureAppConfigurationSyncFields";
import { AzureDevOpsSyncFields } from "./AzureDevOpsSyncFields";
import { AzureKeyVaultSyncFields } from "./AzureKeyVaultSyncFields";
import { BitbucketSyncFields } from "./BitbucketSyncFields";
import { CamundaSyncFields } from "./CamundaSyncFields";
import { ChecklySyncFields } from "./ChecklySyncFields";
import { ChefSyncFields } from "./ChefSyncFields";
import { CloudflarePagesSyncFields } from "./CloudflarePagesSyncFields";
import { CloudflareWorkersSyncFields } from "./CloudflareWorkersSyncFields";
import { ConvexSyncFields } from "./ConvexSyncFields";
import { DatabricksSyncFields } from "./DatabricksSyncFields";
import { DigitalOceanAppPlatformSyncFields } from "./DigitalOceanAppPlatformSyncFields";
import { FlyioSyncFields } from "./FlyioSyncFields";
import { GcpSyncFields } from "./GcpSyncFields";
import { GitHubSyncFields } from "./GitHubSyncFields";
import { GitLabSyncFields } from "./GitLabSyncFields";
import { HCVaultSyncFields } from "./HCVaultSyncFields";
import { HerokuSyncFields } from "./HerokuSyncFields";
import { HumanitecSyncFields } from "./HumanitecSyncFields";
import { LaravelForgeSyncFields } from "./LaravelForgeSyncFields";
import { NetlifySyncFields } from "./NetlifySyncFields";
import { NorthflankSyncFields } from "./NorthflankSyncFields";
import { OCIVaultSyncFields } from "./OCIVaultSyncFields";
import { OctopusDeploySyncFields } from "./OctopusDeploySyncFields";
import { RailwaySyncFields } from "./RailwaySyncFields";
import { RenderSyncFields } from "./RenderSyncFields";
import { SupabaseSyncFields } from "./SupabaseSyncFields";
import { TeamCitySyncFields } from "./TeamCitySyncFields";
import { TerraformCloudSyncFields } from "./TerraformCloudSyncFields";
import { VercelSyncFields } from "./VercelSyncFields";
import { WindmillSyncFields } from "./WindmillSyncFields";
import { ZabbixSyncFields } from "./ZabbixSyncFields";

export const SecretSyncDestinationFields = () => {
  const { watch } = useFormContext<TSecretSyncForm>();

  const destination = watch("destination");

  switch (destination) {
    case SecretSync.AWSParameterStore:
      return <AwsParameterStoreSyncFields />;
    case SecretSync.AWSSecretsManager:
      return <AwsSecretsManagerSyncFields />;
    case SecretSync.GitHub:
      return <GitHubSyncFields />;
    case SecretSync.GCPSecretManager:
      return <GcpSyncFields />;
    case SecretSync.AzureKeyVault:
      return <AzureKeyVaultSyncFields />;
    case SecretSync.AzureAppConfiguration:
      return <AzureAppConfigurationSyncFields />;
    case SecretSync.AzureDevOps:
      return <AzureDevOpsSyncFields />;
    case SecretSync.Databricks:
      return <DatabricksSyncFields />;
    case SecretSync.Humanitec:
      return <HumanitecSyncFields />;
    case SecretSync.TerraformCloud:
      return <TerraformCloudSyncFields />;
    case SecretSync.Camunda:
      return <CamundaSyncFields />;
    case SecretSync.Vercel:
      return <VercelSyncFields />;
    case SecretSync.Windmill:
      return <WindmillSyncFields />;
    case SecretSync.HCVault:
      return <HCVaultSyncFields />;
    case SecretSync.TeamCity:
      return <TeamCitySyncFields />;
    case SecretSync.OCIVault:
      return <OCIVaultSyncFields />;
    case SecretSync.OnePass:
      return <OnePassSyncFields />;
    case SecretSync.Heroku:
      return <HerokuSyncFields />;
    case SecretSync.Render:
      return <RenderSyncFields />;
    case SecretSync.Flyio:
      return <FlyioSyncFields />;
    case SecretSync.GitLab:
      return <GitLabSyncFields />;
    case SecretSync.CloudflarePages:
      return <CloudflarePagesSyncFields />;
    case SecretSync.CloudflareWorkers:
      return <CloudflareWorkersSyncFields />;
    case SecretSync.Zabbix:
      return <ZabbixSyncFields />;
    case SecretSync.Railway:
      return <RailwaySyncFields />;
    case SecretSync.Checkly:
      return <ChecklySyncFields />;
    case SecretSync.Supabase:
      return <SupabaseSyncFields />;
    case SecretSync.Convex:
      return <ConvexSyncFields />;
    case SecretSync.DigitalOceanAppPlatform:
      return <DigitalOceanAppPlatformSyncFields />;
    case SecretSync.Netlify:
      return <NetlifySyncFields />;
    case SecretSync.Bitbucket:
      return <BitbucketSyncFields />;
    case SecretSync.LaravelForge:
      return <LaravelForgeSyncFields />;
    case SecretSync.Chef:
      return <ChefSyncFields />;
    case SecretSync.Northflank:
      return <NorthflankSyncFields />;
    case SecretSync.OctopusDeploy:
      return <OctopusDeploySyncFields />;
    default:
      throw new Error(`Unhandled Destination Config Field: ${destination}`);
  }
};
