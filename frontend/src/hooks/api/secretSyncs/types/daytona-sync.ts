import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TDaytonaSync = TRootSecretSync & {
  destination: SecretSync.Daytona;
  destinationConfig: { organizationName: string };
  connection: {
    app: AppConnection.Daytona;
    name: string;
    id: string;
  };
};
