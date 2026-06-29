import { ReactNode } from "react";

import { Detail, DetailGroupHeader, DetailLabel, DetailValue } from "@app/components/v3";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { SecretSync, TSecretSync } from "@app/hooks/api/secretSyncs";

import { OnePassSyncDestinationSection } from "./1PasswordSyncDestinationSection";
import { AwsParameterStoreSyncDestinationSection } from "./AwsParameterStoreSyncDestinationSection";
import { AwsSecretsManagerSyncDestinationSection } from "./AwsSecretsManagerSyncDestinationSection";
import { AzureAppConfigurationSyncDestinationSection } from "./AzureAppConfigurationSyncDestinationSection";
import { AzureDevOpsSyncDestinationSection } from "./AzureDevOpsSyncDestinationSection";
import { AzureEntraIdScimSyncDestinationSection } from "./AzureEntraIdScimSyncDestinationSection";
import { AzureKeyVaultSyncDestinationSection } from "./AzureKeyVaultSyncDestinationSection";
import { BitbucketSyncDestinationSection } from "./BitbucketSyncDestinationSection";
import { CamundaSyncDestinationSection } from "./CamundaSyncDestinationSection";
import { ChecklySyncDestinationSection } from "./ChecklySyncDestinationSection";
import { ChefSyncDestinationSection } from "./ChefSyncDestinationSection";
import { CircleCISyncDestinationSection } from "./CircleCISyncDestinationSection";
import { CloudflarePagesSyncDestinationSection } from "./CloudflarePagesSyncDestinationSection";
import { CloudflareWorkersSyncDestinationSection } from "./CloudflareWorkersSyncDestinationSection";
import { DatabricksSyncDestinationSection } from "./DatabricksSyncDestinationSection";
import { DevinSyncDestinationSection } from "./DevinSyncDestinationSection";
import { DigitalOceanAppPlatformSyncDestinationSection } from "./DigitalOceanAppPlatformSyncDestinationSection";
import { ExternalInfisicalSyncDestinationSection } from "./ExternalInfisicalSyncDestinationSection";
import { FlyioSyncDestinationSection } from "./FlyioSyncDestinationSection";
import { GcpSyncDestinationSection } from "./GcpSyncDestinationSection";
import { GitHubSyncDestinationSection } from "./GitHubSyncDestinationSection";
import { GitLabSyncDestinationSection } from "./GitLabSyncDestinationSection";
import { HasuraCloudSyncDestinationSection } from "./HasuraCloudSyncDestinationSection";
import { HCVaultSyncDestinationSection } from "./HCVaultSyncDestinationSection";
import { HerokuSyncDestinationSection } from "./HerokuSyncDestinationSection";
import { HumanitecSyncDestinationSection } from "./HumanitecSyncDestinationSection";
import { LaravelForgeSyncDestinationSection } from "./LaravelForgeSyncDestinationSection";
import { NetlifySyncDestinationSection } from "./NetlifySyncDestinationSection";
import { NorthflankSyncDestinationSection } from "./NorthflankSyncDestinationSection";
import { OCIVaultSyncDestinationSection } from "./OCIVaultSyncDestinationSection";
import { OctopusDeploySyncDestinationSection } from "./OctopusDeploySyncDestinationSection";
import { OnaSyncDestinationSection } from "./OnaSyncDestinationSection";
import { OvhSyncDestinationSection } from "./OvhSyncDestinationSection";
import { RailwaySyncDestinationSection } from "./RailwaySyncDestinationSection";
import { RenderSyncDestinationSection } from "./RenderSyncDestinationSection";
import { SnowflakeSyncDestinationSection } from "./SnowflakeSyncDestinationSection";
import { SupabaseSyncDestinationSection } from "./SupabaseSyncDestinationSection";
import { TeamCitySyncDestinationSection } from "./TeamCitySyncDestinationSection";
import { TerraformCloudSyncDestinationSection } from "./TerraformCloudSyncDestinationSection";
import { TravisCISyncDestinationSection } from "./TravisCISyncDestinationSection";
import { TriggerDevSyncDestinationSection } from "./TriggerDevSyncDestinationSection";
import { VercelSyncDestinationSection } from "./VercelSyncDestinationSection";
import { WindmillSyncDestinationSection } from "./WindmillSyncDestinationSection";
import { ZabbixSyncDestinationSection } from "./ZabbixSyncDestinationSection";

type Props = {
  secretSync: TSecretSync;
};

export const SecretSyncDestinationSection = ({ secretSync }: Props) => {
  const { destination, connection } = secretSync;

  const app = APP_CONNECTION_MAP[connection.app].name;

  let DestinationComponents: ReactNode;
  switch (destination) {
    case SecretSync.AWSParameterStore:
      DestinationComponents = <AwsParameterStoreSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.AWSSecretsManager:
      DestinationComponents = <AwsSecretsManagerSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.GitHub:
      DestinationComponents = <GitHubSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.GCPSecretManager:
      DestinationComponents = <GcpSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.AzureKeyVault:
      DestinationComponents = <AzureKeyVaultSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.AzureAppConfiguration:
      DestinationComponents = (
        <AzureAppConfigurationSyncDestinationSection secretSync={secretSync} />
      );
      break;
    case SecretSync.Databricks:
      DestinationComponents = <DatabricksSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Humanitec:
      DestinationComponents = <HumanitecSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.TerraformCloud:
      DestinationComponents = <TerraformCloudSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Camunda:
      DestinationComponents = <CamundaSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Vercel:
      DestinationComponents = <VercelSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Windmill:
      DestinationComponents = <WindmillSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.HCVault:
      DestinationComponents = <HCVaultSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.TeamCity:
      DestinationComponents = <TeamCitySyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.OCIVault:
      DestinationComponents = <OCIVaultSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.OnePass:
      DestinationComponents = <OnePassSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.AzureDevOps:
      DestinationComponents = <AzureDevOpsSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Heroku:
      DestinationComponents = <HerokuSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Render:
      DestinationComponents = <RenderSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Flyio:
      DestinationComponents = <FlyioSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.GitLab:
      DestinationComponents = <GitLabSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.CloudflarePages:
      DestinationComponents = <CloudflarePagesSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.CloudflareWorkers:
      DestinationComponents = <CloudflareWorkersSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Zabbix:
      DestinationComponents = <ZabbixSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Railway:
      DestinationComponents = <RailwaySyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.HasuraCloud:
      DestinationComponents = <HasuraCloudSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Checkly:
      DestinationComponents = <ChecklySyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Supabase:
      DestinationComponents = <SupabaseSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.DigitalOceanAppPlatform:
      DestinationComponents = (
        <DigitalOceanAppPlatformSyncDestinationSection secretSync={secretSync} />
      );
      break;
    case SecretSync.Netlify:
      DestinationComponents = <NetlifySyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Northflank:
      DestinationComponents = <NorthflankSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Bitbucket:
      DestinationComponents = <BitbucketSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.LaravelForge:
      DestinationComponents = <LaravelForgeSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Chef:
      DestinationComponents = <ChefSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.OctopusDeploy:
      DestinationComponents = <OctopusDeploySyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.CircleCI:
      DestinationComponents = <CircleCISyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.AzureEntraIdScim:
      DestinationComponents = <AzureEntraIdScimSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.ExternalInfisical:
      DestinationComponents = <ExternalInfisicalSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.OVH:
      DestinationComponents = <OvhSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Devin:
      DestinationComponents = <DevinSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Ona:
      DestinationComponents = <OnaSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.TravisCI:
      DestinationComponents = <TravisCISyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Snowflake:
      DestinationComponents = <SnowflakeSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.TriggerDev:
      DestinationComponents = <TriggerDevSyncDestinationSection secretSync={secretSync} />;
      break;
    default:
      throw new Error(`Unhandled Destination Section components: ${destination}`);
  }

  return (
    <>
      <DetailGroupHeader>Destination Configuration</DetailGroupHeader>
      <Detail>
        <DetailLabel>{`${app} Connection`}</DetailLabel>
        <DetailValue>{connection.name}</DetailValue>
      </Detail>
      {DestinationComponents}
    </>
  );
};
