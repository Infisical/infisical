import { ReactNode } from "react";

import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
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
          <Detail>
            <DetailLabel>Application</DetailLabel>
            <DetailValue>{destinationConfig.app}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Organization</DetailLabel>
            <DetailValue>{destinationConfig.org}</DetailValue>
          </Detail>
        </>
      );
      break;
    case HumanitecSyncScope.Environment:
      Components = (
        <>
          <Detail>
            <DetailLabel>Application</DetailLabel>
            <DetailValue>{destinationConfig.app}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Organization</DetailLabel>
            <DetailValue>{destinationConfig.org}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Environment</DetailLabel>
            <DetailValue>{destinationConfig.env}</DetailValue>
          </Detail>
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
      <Detail className="capitalize">
        <DetailLabel>Scope</DetailLabel>
        <DetailValue>{destinationConfig.scope.replace("-", " ")}</DetailValue>
      </Detail>
      {Components}
    </>
  );
};
