import { ReactNode } from "react";

import { GenericFieldLabel } from "@app/components/secret-syncs";
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
          <GenericFieldLabel label="Application">{destinationConfig.app}</GenericFieldLabel>
          <GenericFieldLabel label="Organization">{destinationConfig.org}</GenericFieldLabel>
        </>
      );
      break;
    case HumanitecSyncScope.Environment:
      Components = (
        <>
          <GenericFieldLabel label="Application">{destinationConfig.app}</GenericFieldLabel>
          <GenericFieldLabel label="Organization">{destinationConfig.org}</GenericFieldLabel>
          <GenericFieldLabel label="Environment">{destinationConfig.env}</GenericFieldLabel>
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
      <GenericFieldLabel className="capitalize" label="Scope">
        {destinationConfig.scope.replace("-", " ")}
      </GenericFieldLabel>
      {Components}
    </>
  );
};
