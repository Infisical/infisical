import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export enum GitHubSyncScope {
  Organization = "organization",
  Repository = "repository",
  RepositoryEnvironment = "repository-environment"
}

export enum GitHubSyncVisibility {
  All = "all",
  Private = "private",
  Selected = "selected"
}

export type TGitHubSync = TRootSecretSync & {
  destination: SecretSync.GitHub;
  destinationConfig:
    | {
        scope: GitHubSyncScope.Organization;
        org: string;
        visibility: GitHubSyncVisibility;
        selectedRepositoryIds?: number[];
      }
    | {
        scope: GitHubSyncScope.Repository;
        owner: string;
        repo: string;
      }
    | {
        scope: GitHubSyncScope.RepositoryEnvironment;
        owner: string;
        repo: string;
        env: string;
      };
  connection: {
    app: AppConnection.GitHub;
    name: string;
    id: string;
  };
};
