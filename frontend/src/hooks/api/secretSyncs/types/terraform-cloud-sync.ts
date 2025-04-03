import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TTerraformCloudSync = TRootSecretSync & {
  destination: SecretSync.TerraformCloud;
  destinationConfig:
    | {
        scope: TerraformCloudSyncScope.Project;
        org: string;
        project: string;
      }
    | {
        scope: TerraformCloudSyncScope.Workspace;
        org: string;
        workspace: string;
      };
  connection: {
    app: AppConnection.TerraformCloud;
    name: string;
    id: string;
  };
};

export enum TerraformCloudSyncScope {
  Project = "project",
  Workspace = "workspace"
}
