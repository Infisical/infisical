import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TAzureAppConfigurationSync = TRootSecretSync & {
  destination: SecretSync.AzureAppConfiguration;
  destinationConfig: {
    configurationUrl: string;
    label?: string;
  };
  connection: {
    app: AppConnection.AzureAppConfiguration;
    name: string;
    id: string;
  };
};
