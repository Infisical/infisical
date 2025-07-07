import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TRailwaySync } from "@app/hooks/api/secretSyncs/types/railway-sync";

type Props = {
  secretSync: TRailwaySync;
};

export const RailwaySyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <GenericFieldLabel label="Project ID">{destinationConfig.projectId}</GenericFieldLabel>
      <GenericFieldLabel label="Environment ID">
        {destinationConfig.environmentId}
      </GenericFieldLabel>
    </>
  );
};
