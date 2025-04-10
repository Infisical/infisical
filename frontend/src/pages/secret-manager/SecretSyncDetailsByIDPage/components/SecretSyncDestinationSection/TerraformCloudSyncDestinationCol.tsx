import { ReactNode } from "react";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import {
  TerraformCloudSyncScope,
  TTerraformCloudSync
} from "@app/hooks/api/secretSyncs/types/terraform-cloud-sync";

type Props = {
  secretSync: TTerraformCloudSync;
};

export const TerraformCloudSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  let Components: ReactNode;
  switch (destinationConfig.scope) {
    case TerraformCloudSyncScope.VariableSet:
      Components = (
        <>
          <GenericFieldLabel label="Organization">{destinationConfig.org}</GenericFieldLabel>
          <GenericFieldLabel label="Variable Set">
            {destinationConfig.variableSetName}
          </GenericFieldLabel>
        </>
      );
      break;
    case TerraformCloudSyncScope.Workspace:
      Components = (
        <>
          <GenericFieldLabel label="Organization">{destinationConfig.org}</GenericFieldLabel>
          <GenericFieldLabel label="Workspace">{destinationConfig.workspaceName}</GenericFieldLabel>
        </>
      );
      break;
    default:
      throw new Error(
        `Unhandled Terraform Cloud Sync Destination Section Scope ${secretSync.destinationConfig.scope}`
      );
  }

  return (
    <>
      <GenericFieldLabel className="capitalize" label="Scope">
        {destinationConfig.scope.replace("-", " ")}
      </GenericFieldLabel>
      {Components}
    </>
  );
};
