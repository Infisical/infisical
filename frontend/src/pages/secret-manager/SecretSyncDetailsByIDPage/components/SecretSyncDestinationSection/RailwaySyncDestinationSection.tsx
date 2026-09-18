import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TRailwaySync } from "@app/hooks/api/secretSyncs/types/railway-sync";

type Props = {
  secretSync: TRailwaySync;
};

export const RailwaySyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Project</DetailLabel>
        <DetailValue>{destinationConfig.projectName}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Environment</DetailLabel>
        <DetailValue>{destinationConfig.environmentName}</DetailValue>
      </Detail>
    </>
  );
};
