import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TKeeperSync = TRootSecretSync & {
  destination: SecretSync.Keeper;
  destinationConfig: {
    folderUid: string;
    folderName?: string;
  };
  connection: {
    app: AppConnection.Keeper;
    name: string;
    id: string;
  };
};
