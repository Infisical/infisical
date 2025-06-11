import { GenericFieldLabel } from "@app/components/secret-syncs";
import { GcpSyncScope, TGcpSync } from "@app/hooks/api/secretSyncs/types/gcp-sync";

type Props = {
  secretSync: TGcpSync;
};

export const GcpSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <GenericFieldLabel label="Project ID">{destinationConfig.projectId}</GenericFieldLabel>
      <GenericFieldLabel label="Scope" className="capitalize">
        {destinationConfig.scope}
      </GenericFieldLabel>
      {destinationConfig.scope === GcpSyncScope.Region && (
        <GenericFieldLabel label="Region">{destinationConfig.locationId}</GenericFieldLabel>
      )}
    </>
  );
};
