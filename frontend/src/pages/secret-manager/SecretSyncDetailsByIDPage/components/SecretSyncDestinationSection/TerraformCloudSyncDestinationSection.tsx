import { ReactNode } from "react";

import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TerraformCloudSyncCategory } from "@app/hooks/api/appConnections/terraform-cloud";
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
          <Detail>
            <DetailLabel>Organization</DetailLabel>
            <DetailValue>{destinationConfig.org}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Variable Set</DetailLabel>
            <DetailValue>{destinationConfig.variableSetName}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Category</DetailLabel>
            <DetailValue>
              {Object.keys(TerraformCloudSyncCategory).find(
                (key) =>
                  TerraformCloudSyncCategory[key as keyof typeof TerraformCloudSyncCategory] ===
                  destinationConfig.category
              )}
            </DetailValue>
          </Detail>
        </>
      );
      break;
    case TerraformCloudSyncScope.Workspace:
      Components = (
        <>
          <Detail>
            <DetailLabel>Organization</DetailLabel>
            <DetailValue>{destinationConfig.org}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Workspace</DetailLabel>
            <DetailValue>{destinationConfig.workspaceName}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Category</DetailLabel>
            <DetailValue>
              {Object.keys(TerraformCloudSyncCategory).find(
                (key) =>
                  TerraformCloudSyncCategory[key as keyof typeof TerraformCloudSyncCategory] ===
                  destinationConfig.category
              )}
            </DetailValue>
          </Detail>
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
      <Detail className="capitalize">
        <DetailLabel>Scope</DetailLabel>
        <DetailValue>{destinationConfig.scope.replace("-", " ")}</DetailValue>
      </Detail>
      {Components}
    </>
  );
};
