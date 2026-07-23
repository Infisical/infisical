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
      {destinationConfig.scope === GcpSyncScope.Region && (
        <Detail>
          <DetailLabel>Region</DetailLabel>
          <DetailValue>{destinationConfig.locationId}</DetailValue>
        </Detail>
      )}
      {destinationConfig.scope === GcpSyncScope.Global &&
        Boolean(destinationConfig.userReplicaLocationIds?.length) && (
          <Detail>
            <DetailLabel>Replica Regions</DetailLabel>
            <DetailValue>{destinationConfig.userReplicaLocationIds?.join(", ")}</DetailValue>
          </Detail>
        )}
    </>
  );
};
