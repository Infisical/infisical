import { ReactNode } from "react";

import { SecretSyncLabel } from "@app/components/secret-syncs";
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
    case TerraformCloudSyncScope.Project:
      Components = (
        <>
          <SecretSyncLabel label="Organization">{destinationConfig.org}</SecretSyncLabel>
          <SecretSyncLabel label="Project">{destinationConfig.project}</SecretSyncLabel>
        </>
      );
      break;
    case TerraformCloudSyncScope.Workspace:
      Components = (
        <>
          <SecretSyncLabel label="Organization">{destinationConfig.org}</SecretSyncLabel>
          <SecretSyncLabel label="Workspace">{destinationConfig.workspace}</SecretSyncLabel>
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
      <SecretSyncLabel className="capitalize" label="Scope">
        {destinationConfig.scope.replace("-", " ")}
      </SecretSyncLabel>
      {Components}
    </>
  );
};
