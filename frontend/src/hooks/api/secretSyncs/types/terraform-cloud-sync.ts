import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

import { TerraformCloudSyncCategory } from "../../appConnections/terraform-cloud";

export type TTerraformCloudSync = TRootSecretSync & {
  destination: SecretSync.TerraformCloud;
  destinationConfig:
    | {
        scope: TerraformCloudSyncScope.VariableSet;
        org: string;
        category: TerraformCloudSyncCategory;
        variableSetId: string;
        variableSetName: string;
      }
    | {
        scope: TerraformCloudSyncScope.Workspace;
        org: string;
        category: TerraformCloudSyncCategory;
        workspaceId: string;
        workspaceName: string;
      };
  connection: {
    app: AppConnection.TerraformCloud;
    name: string;
    id: string;
  };
};

export enum TerraformCloudSyncScope {
  VariableSet = "variable-set",
  Workspace = "workspace"
}
