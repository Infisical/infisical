import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export enum GiteaSyncScope {
  Organization = "organization",
  Repository = "repository"
}

export type TGiteaSync = TRootSecretSync & {
  destination: SecretSync.Gitea;
  destinationConfig:
    | {
        scope: GiteaSyncScope.Organization;
        org: string;
      }
    | {
        scope: GiteaSyncScope.Repository;
        owner: string;
        repo: string;
      };
  connection: {
    app: SecretSync.Gitea;
    name: string;
    id: string;
  };
};
