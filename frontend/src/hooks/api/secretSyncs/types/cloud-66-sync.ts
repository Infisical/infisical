import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TCloud66Sync = TRootSecretSync & {
  destination: SecretSync.Cloud66;
  destinationConfig: {
    stackId: string;
    stackName: string;
  };
  connection: {
    app: AppConnection.Cloud66;
    name: string;
    id: string;
  };
};
