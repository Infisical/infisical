import { SecretSync, TSecretSync } from "@app/hooks/api/secretSyncs";

import { AwsParameterStoreSyncDestinationCol } from "./AwsParameterStoreSyncDestinationCol";
import { AwsSecretsManagerSyncDestinationCol } from "./AwsSecretsManagerSyncDestinationCol";
import { AzureAppConfigurationDestinationSyncCol } from "./AzureAppConfigurationDestinationSyncCol";
import { AzureKeyVaultDestinationSyncCol } from "./AzureKeyVaultDestinationSyncCol";
import { DatabricksSyncDestinationCol } from "./DatabricksSyncDestinationCol";
import { GcpSyncDestinationCol } from "./GcpSyncDestinationCol";
import { GitHubSyncDestinationCol } from "./GitHubSyncDestinationCol";
import { HumanitecSyncDestinationCol } from "./HumanitecSyncDestinationCol";

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
    default:
      throw new Error(
        `Unhandled Secret Sync Destination Col: ${(secretSync as TSecretSync).destination}`
      );
  }
};
