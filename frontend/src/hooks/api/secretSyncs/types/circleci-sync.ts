import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TCircleCISync = TRootSecretSync & {
  destination: SecretSync.CircleCI;
  destinationConfig: {
    projectSlug: string;
    projectName?: string;
  };
  connection: {
    app: AppConnection.CircleCI;
    name: string;
    id: string;
  };
};
