import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { GcpSyncScope } from "@app/hooks/api/secretSyncs/types/gcp-sync";

export const GcpSyncReviewFields = () => {
  const { watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.GCPSecretManager }
  >();
  const destinationConfig = watch("destinationConfig");

  return (
    <>
      <Detail>
        <DetailLabel>Project ID</DetailLabel>
        <DetailValue>{destinationConfig.projectId}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Scope</DetailLabel>
        <DetailValue className="capitalize">{destinationConfig.scope}</DetailValue>
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
