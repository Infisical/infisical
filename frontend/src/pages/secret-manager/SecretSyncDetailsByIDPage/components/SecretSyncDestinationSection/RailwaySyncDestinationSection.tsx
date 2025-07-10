import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TRailwaySync } from "@app/hooks/api/secretSyncs/types/railway-sync";

type Props = {
  secretSync: TRailwaySync;
};

export const RailwaySyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <GenericFieldLabel label="Project">{destinationConfig.projectName}</GenericFieldLabel>
      <GenericFieldLabel label="Environment">{destinationConfig.environmentName}</GenericFieldLabel>
    </>
  );
};
