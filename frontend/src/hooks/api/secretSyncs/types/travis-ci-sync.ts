import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TTravisCISync = TRootSecretSync & {
  destination: SecretSync.TravisCI;
  destinationConfig: {
    repositoryId: string;
    repositorySlug: string;
    branch?: string;
  };
  connection: {
    app: AppConnection.TravisCI;
    name: string;
    id: string;
  };
};
