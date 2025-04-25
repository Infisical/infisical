import { SecretSync, TSecretSync } from "@app/hooks/api/secretSyncs";

import { AwsParameterStoreSyncDestinationCol } from "./AwsParameterStoreSyncDestinationCol";
import { AwsSecretsManagerSyncDestinationCol } from "./AwsSecretsManagerSyncDestinationCol";
import { AzureAppConfigurationDestinationSyncCol } from "./AzureAppConfigurationDestinationSyncCol";
import { AzureKeyVaultDestinationSyncCol } from "./AzureKeyVaultDestinationSyncCol";
import { CamundaSyncDestinationCol } from "./CamundaSyncDestinationCol";
import { DatabricksSyncDestinationCol } from "./DatabricksSyncDestinationCol";
import { GcpSyncDestinationCol } from "./GcpSyncDestinationCol";
import { GitHubSyncDestinationCol } from "./GitHubSyncDestinationCol";
import { HCVaultSyncDestinationCol } from "./HCVaultSyncDestinationCol";
import { HumanitecSyncDestinationCol } from "./HumanitecSyncDestinationCol";
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
    default:
      throw new Error(
        `Unhandled Secret Sync Destination Col: ${(secretSync as TSecretSync).destination}`
      );
  }
};
