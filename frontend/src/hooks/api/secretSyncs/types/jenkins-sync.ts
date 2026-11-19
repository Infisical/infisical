import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs/enums";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export enum JenkinsSyncScope {
  Global = "global",
  Folder = "folder"
}

export type TJenkinsSync = TRootSecretSync & {
  destination: SecretSync.Jenkins;
  destinationConfig:
    | {
        scope: JenkinsSyncScope.Global;
      }
    | {
        scope: JenkinsSyncScope.Folder;
        folderPath: string;
      };
  connection: {
    app: AppConnection.Jenkins;
    name: string;
    id: string;
  };
};
