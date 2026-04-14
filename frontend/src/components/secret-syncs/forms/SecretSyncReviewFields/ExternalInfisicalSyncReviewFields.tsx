import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const ExternalInfisicalSyncReviewFields = () => {
  const { watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.ExternalInfisical }
  >();
  const config = watch("destinationConfig");

  return (
    <>
      <GenericFieldLabel label="Project ID">{config.projectId}</GenericFieldLabel>
      <GenericFieldLabel label="Environment">{config.environment}</GenericFieldLabel>
      <GenericFieldLabel label="Secret Path">{config.secretPath}</GenericFieldLabel>
    </>
  );
};
