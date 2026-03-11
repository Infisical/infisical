import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TAzureEntraIdScimSync = TRootSecretSync & {
  destination: SecretSync.AzureEntraIdScim;
  destinationConfig: {
    servicePrincipalId: string;
    secretKey: string;
  };
  connection: {
    app: AppConnection.AzureEntraId;
    name: string;
    id: string;
  };
};
