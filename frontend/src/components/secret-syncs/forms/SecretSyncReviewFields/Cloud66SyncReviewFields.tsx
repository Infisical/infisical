import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const Cloud66SyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Cloud66 }>();
  const stackName = watch("destinationConfig.stackName");
  const stackId = watch("destinationConfig.stackId");

  return (
    <>
      <Detail>
        <DetailLabel>Stack</DetailLabel>
        <DetailValue>{stackName}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Stack ID</DetailLabel>
        <DetailValue>{stackId}</DetailValue>
      </Detail>
    </>
  );
};
