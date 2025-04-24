import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TWindmillSync = TRootSecretSync & {
  destination: SecretSync.Windmill;
  destinationConfig: {
    workspace: string;
    path: string;
  };
  connection: {
    app: AppConnection.Windmill;
    name: string;
    id: string;
  };
};
