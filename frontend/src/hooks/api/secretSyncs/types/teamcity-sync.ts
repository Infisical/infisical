import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TTeamCitySync = TRootSecretSync & {
  destination: SecretSync.TeamCity;
  destinationConfig: {
    project: string;
    buildConfig?: string;
  };
  connection: {
    app: AppConnection.TeamCity;
    name: string;
    id: string;
  };
};
