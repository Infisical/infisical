import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TAzureDevOpsSync = TRootSecretSync & {
  destination: SecretSync.AzureDevOps;
  destinationConfig: {
    devopsProjectId: string;
    devopsProjectName?: string;
  };
  connection: {
    app: AppConnection.AzureDevOps;
    name: string;
    id: string;
  };
};
