import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TConvexSync = TRootSecretSync & {
  destination: SecretSync.Convex;
  destinationConfig: {
    deploymentUrl: string;
  };
  connection: {
    app: AppConnection.Convex;
    name: string;
    id: string;
  };
};
