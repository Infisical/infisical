import { SecretSync, TSecretSync } from "@app/hooks/api/secretSyncs";

import { OnePassSyncDestinationCol } from "./1PasswordSyncDestinationCol";
import { AwsParameterStoreSyncDestinationCol } from "./AwsParameterStoreSyncDestinationCol";
import { AwsSecretsManagerSyncDestinationCol } from "./AwsSecretsManagerSyncDestinationCol";
import { AzureAppConfigurationDestinationSyncCol } from "./AzureAppConfigurationDestinationSyncCol";
import { AzureDevOpsSyncDestinationCol } from "./AzureDevOpsSyncDestinationCol";
import { AzureKeyVaultDestinationSyncCol } from "./AzureKeyVaultDestinationSyncCol";
import { CamundaSyncDestinationCol } from "./CamundaSyncDestinationCol";
import { DatabricksSyncDestinationCol } from "./DatabricksSyncDestinationCol";
import { FlyioSyncDestinationCol } from "./FlyioSyncDestinationCol";
import { GcpSyncDestinationCol } from "./GcpSyncDestinationCol";
import { GitHubSyncDestinationCol } from "./GitHubSyncDestinationCol";
import { HCVaultSyncDestinationCol } from "./HCVaultSyncDestinationCol";
import { HerokuSyncDestinationCol } from "./HerokuSyncDestinationCol";
import { HumanitecSyncDestinationCol } from "./HumanitecSyncDestinationCol";
import { OCIVaultSyncDestinationCol } from "./OCIVaultSyncDestinationCol";
import { RenderSyncDestinationCol } from "./RenderSyncDestinationCol";
import { TeamCitySyncDestinationCol } from "./TeamCitySyncDestinationCol";
import { TerraformCloudSyncDestinationCol } from "./TerraformCloudSyncDestinationCol";
import { VercelSyncDestinationCol } from "./VercelSyncDestinationCol";
import { WindmillSyncDestinationCol } from "./WindmillSyncDestinationCol";

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
    default:
      throw new Error(
        `Unhandled Secret Sync Destination Col: ${(secretSync as TSecretSync).destination}`
      );
  }
};
