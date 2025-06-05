import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TCoolifySync = TRootSecretSync & {
  destination: SecretSync.Coolify;
  destinationConfig: {
    appId: string;
  };
  connection: {
    app: AppConnection.Coolify;
    name: string;
    id: string;
  };
};
