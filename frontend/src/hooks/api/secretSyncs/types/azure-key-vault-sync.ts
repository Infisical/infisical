import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TAzureKeyVaultSync = TRootSecretSync & {
  destination: SecretSync.AzureKeyVault;
  destinationConfig: {
    vaultBaseUrl: string;
  };
  connection: {
    app: AppConnection.AzureKeyVault;
    name: string;
    id: string;
  };
};
