import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const ConvexSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Convex }>();
  const deploymentName = watch("destinationConfig.deploymentName");

  return (
    <Detail>
      <DetailLabel>Deployment</DetailLabel>
      <DetailValue>{deploymentName}</DetailValue>
    </Detail>
  );
};
