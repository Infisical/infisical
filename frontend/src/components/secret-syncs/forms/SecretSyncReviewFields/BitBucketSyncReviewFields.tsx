import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const BitBucketSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Bitbucket }>();
  const repository = watch("destinationConfig.repository");
  const environment = watch("destinationConfig.environment");
  const workspace = watch("destinationConfig.workspace");

  return (
    <>
      <GenericFieldLabel label="Repository">{repository}</GenericFieldLabel>
      <GenericFieldLabel label="Environment">{environment}</GenericFieldLabel>
      <GenericFieldLabel label="Workspace">{workspace}</GenericFieldLabel>
    </>
  );
};
