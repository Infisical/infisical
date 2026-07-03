import { ReactNode } from "react";

import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { GiteaSyncScope, TGiteaSync } from "@app/hooks/api/secretSyncs/types/gitea-sync";

type Props = {
  secretSync: TGiteaSync;
};

export const GiteaSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  let Components: ReactNode;
  switch (destinationConfig.scope) {
    case GiteaSyncScope.Organization:
      Components = (
        <Detail>
          <DetailLabel>Organization</DetailLabel>
          <DetailValue>{`${destinationConfig.org.fullName} (${destinationConfig.org.name})`}</DetailValue>
        </Detail>
      );
      break;
    case GiteaSyncScope.Repository:
      Components = (
        <Detail>
          <DetailLabel>Repository</DetailLabel>
          <DetailValue>
            {destinationConfig.owner}/{destinationConfig.repo}
          </DetailValue>
        </Detail>
      );
      break;
    default:
      throw new Error(
        `Unhandled Gitea Sync Destination Section Scope ${secretSync.destinationConfig.scope}`
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
