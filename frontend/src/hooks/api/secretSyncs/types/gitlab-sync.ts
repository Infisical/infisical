import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export enum GitlabSyncScope {
  Individual = "individual",
  Group = "group"
}

export type TGitlabSync = TRootSecretSync & {
  destination: SecretSync.Gitlab;
  destinationConfig:
    | {
        scope: GitlabSyncScope.Individual;
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
        projectId: string;
        projectName: string;
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
