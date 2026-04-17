import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TRailwaySync } from "@app/hooks/api/secretSyncs/types/railway-sync";

type Props = {
  secretSync: TRailwaySync;
};

export const RailwaySyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  const serviceNames =
    destinationConfig.serviceNames ??
    (destinationConfig.serviceName ? [destinationConfig.serviceName] : []);

  return (
    <>
      <GenericFieldLabel label="Project">{destinationConfig.projectName}</GenericFieldLabel>
      <GenericFieldLabel label="Environment">{destinationConfig.environmentName}</GenericFieldLabel>
      {serviceNames.length > 0 && (
        <GenericFieldLabel label="Services">{serviceNames.join(", ")}</GenericFieldLabel>
      )}
    </>
  );
};
