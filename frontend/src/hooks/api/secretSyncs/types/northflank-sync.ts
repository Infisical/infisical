import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TNorthflankSync = TRootSecretSync & {
  destination: SecretSync.Northflank;
  destinationConfig: {
    projectId: string;
    projectName?: string;
    secretGroupId: string;
    secretGroupName?: string;
  };

  connection: {
    app: AppConnection.Northflank;
    name: string;
    id: string;
  };
};
