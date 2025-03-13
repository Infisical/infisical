import { ReactNode } from "react";

import { SecretSyncLabel } from "@app/components/secret-syncs";
import {
  HumanitecSyncScope,
  THumanitecSync
} from "@app/hooks/api/secretSyncs/types/humanitec-sync";

type Props = {
  secretSync: THumanitecSync;
};

export const HumanitecSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  let Components: ReactNode;
  switch (destinationConfig.scope) {
    case HumanitecSyncScope.Application:
      Components = (
        <>
          <SecretSyncLabel label="Application">{destinationConfig.app}</SecretSyncLabel>
          <SecretSyncLabel label="Organization">{destinationConfig.org}</SecretSyncLabel>
        </>
      );
      break;
    case HumanitecSyncScope.Environment:
      Components = (
        <>
          <SecretSyncLabel label="Application">{destinationConfig.app}</SecretSyncLabel>
          <SecretSyncLabel label="Organization">{destinationConfig.org}</SecretSyncLabel>
          <SecretSyncLabel label="Environment">{destinationConfig.env}</SecretSyncLabel>
        </>
      );
      break;
    default:
      throw new Error(
        `Uhandled Humanitec Sync Destination Section Scope ${secretSync.destinationConfig.scope}`
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
