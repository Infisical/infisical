import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TOnaSync = TRootSecretSync & {
  destination: SecretSync.Ona;
  destinationConfig: { projectId: string; projectName?: string };
  connection: {
    app: AppConnection.Ona;
    name: string;
    id: string;
  };
};
