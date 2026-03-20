import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TExternalInfisicalSync = TRootSecretSync & {
  destination: SecretSync.ExternalInfisical;
  destinationConfig: {
    projectId: string;
    environment: string;
    secretPath: string;
  };
  connection: {
    app: AppConnection.ExternalInfisical;
    name: string;
    id: string;
  };
};
