import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type THasuraCloudSync = TRootSecretSync & {
  destination: SecretSync.HasuraCloud;
  destinationConfig: {
    projectId: string;
    projectName: string;
    tenantId: string;
  };
  connection: {
    app: AppConnection.HasuraCloud;
    name: string;
    id: string;
  };
};
