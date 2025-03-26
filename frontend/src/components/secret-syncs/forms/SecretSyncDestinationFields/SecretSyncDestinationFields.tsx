import { useFormContext } from "react-hook-form";

import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";
import { AwsParameterStoreSyncFields } from "./AwsParameterStoreSyncFields";
import { AwsSecretsManagerSyncFields } from "./AwsSecretsManagerSyncFields";
import { AzureAppConfigurationSyncFields } from "./AzureAppConfigurationSyncFields";
import { AzureKeyVaultSyncFields } from "./AzureKeyVaultSyncFields";
import { DatabricksSyncFields } from "./DatabricksSyncFields";
import { GcpSyncFields } from "./GcpSyncFields";
import { GitHubSyncFields } from "./GitHubSyncFields";
import { HumanitecSyncFields } from "./HumanitecSyncFields";

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
    case SecretSync.Databricks:
      return <DatabricksSyncFields />;
    case SecretSync.Humanitec:
      return <HumanitecSyncFields />;
    default:
      throw new Error(`Unhandled Destination Config Field: ${destination}`);
  }
};
