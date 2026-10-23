import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TPortainerSync = TRootSecretSync & {
  destination: SecretSync.Portainer;
  destinationConfig: {
    environmentId: number;
    stackId: number;
  };
  connection: {
    app: AppConnection.Portainer;
    name: string;
    id: string;
  };
};
