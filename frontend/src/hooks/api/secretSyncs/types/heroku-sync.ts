import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type THerokuSync = TRootSecretSync & {
  destination: SecretSync.Heroku;
  destinationConfig: {
    app: string;
    appName: string;
  };
  connection: {
    app: AppConnection.Heroku;
    name: string;
    id: string;
  };
};
