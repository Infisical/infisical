import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TGcpSync = TRootSecretSync & {
  destination: SecretSync.GCP;
  destinationConfig: {
    projectId: string;
  };
  connection: {
    app: AppConnection.GCP;
    name: string;
    id: string;
  };
};
