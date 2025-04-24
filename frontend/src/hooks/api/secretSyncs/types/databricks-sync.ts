import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TDatabricksSync = TRootSecretSync & {
  destination: SecretSync.Databricks;
  destinationConfig: {
    scope: string;
  };
  connection: {
    app: AppConnection.Databricks;
    name: string;
    id: string;
  };
};
