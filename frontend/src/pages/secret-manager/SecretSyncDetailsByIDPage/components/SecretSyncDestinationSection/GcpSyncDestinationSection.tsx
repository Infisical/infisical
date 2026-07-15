import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { GcpSyncScope, TGcpSync } from "@app/hooks/api/secretSyncs/types/gcp-sync";

type Props = {
  secretSync: TGcpSync;
};

export const GcpSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Project ID</DetailLabel>
        <DetailValue>{destinationConfig.projectId}</DetailValue>
      </Detail>
      <Detail className="capitalize">
        <DetailLabel>Scope</DetailLabel>
        <DetailValue>{destinationConfig.scope}</DetailValue>
      </Detail>
      {(destinationConfig.scope === GcpSyncScope.Region ||
        (destinationConfig.scope === GcpSyncScope.Global && destinationConfig.locationId)) && (
        <Detail>
          <DetailLabel>Region</DetailLabel>
          <DetailValue>{destinationConfig.locationId}</DetailValue>
        </Detail>
      )}
    </>
  );
};
