import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export enum GitlabSyncScope {
  Project = "project",
  Group = "group"
}

export type TGitlabSync = TRootSecretSync & {
  destination: SecretSync.GitLab;
  destinationConfig:
    | {
        scope: GitlabSyncScope.Project;
        projectId: string;
        projectName: string;
        targetEnvironment?: string;
        shouldProtectSecrets?: boolean;
        shouldMaskSecrets?: boolean;
        shouldHideSecrets?: boolean;
      }
    | {
        scope: GitlabSyncScope.Group;
        groupId: string;
        groupName: string;
        targetEnvironment?: string;
        shouldProtectSecrets?: boolean;
        shouldMaskSecrets?: boolean;
        shouldHideSecrets?: boolean;
      };
  connection: {
    app: AppConnection.Gitlab;
    name: string;
    id: string;
  };
};
