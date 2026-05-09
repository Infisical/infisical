import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TOvhSync = TRootSecretSync & {
  destination: SecretSync.OVH;
  destinationConfig: {
    path: string;
  };
  connection: {
    app: AppConnection.OVH;
    name: string;
    id: string;
  };
};
