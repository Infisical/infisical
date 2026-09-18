import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const ExternalInfisicalSyncReviewFields = () => {
  const { watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.ExternalInfisical }
  >();
  const config = watch("destinationConfig");

  return (
    <>
      <Detail>
        <DetailLabel>Project ID</DetailLabel>
        <DetailValue>{config.projectId}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Environment</DetailLabel>
        <DetailValue>{config.environment}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Secret Path</DetailLabel>
        <DetailValue>{config.secretPath}</DetailValue>
      </Detail>
    </>
  );
};
