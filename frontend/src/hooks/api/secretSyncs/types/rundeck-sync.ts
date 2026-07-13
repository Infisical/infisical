import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TRundeckSync = TRootSecretSync & {
  destination: SecretSync.Rundeck;
  destinationConfig: {
    project: string;
    path: string;
  };
  connection: {
    app: AppConnection.Rundeck;
    name: string;
    id: string;
  };
};
