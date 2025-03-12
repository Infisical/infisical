import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type THumanitecSync = TRootSecretSync & {
  destination: SecretSync.Humanitec;
  destinationConfig: {
    org: string;
    app: string;
  };
  connection: {
    app: AppConnection.Humanitec;
    name: string;
    id: string;
  };
};
