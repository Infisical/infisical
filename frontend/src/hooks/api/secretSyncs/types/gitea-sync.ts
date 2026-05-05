import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export enum GiteaSyncScope {
  Repository = "repository"
}

export type TGiteaSync = TRootSecretSync & {
  destination: SecretSync.Gitea;
  destinationConfig: {
    scope: GiteaSyncScope.Repository;
    owner: string;
    repo: string;
  };
  connection: {
    app: AppConnection.Gitea;
    name: string;
    id: string;
  };
};
