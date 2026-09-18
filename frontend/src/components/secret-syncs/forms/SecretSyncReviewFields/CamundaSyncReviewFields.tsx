import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const CamundaSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Camunda }>();
  const scope = watch("destinationConfig.scope");
  const clusterName = watch("destinationConfig.clusterName");
  const clusterUUID = watch("destinationConfig.clusterUUID");
  return (
    <>
      <Detail>
        <DetailLabel>Secret Scope</DetailLabel>
        <DetailValue>{scope}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Cluster</DetailLabel>
        <DetailValue>
          {clusterName} (id:{clusterUUID})
        </DetailValue>
      </Detail>
    </>
  );
};
