import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const TravisCISyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.TravisCI }>();

  const config = watch("destinationConfig");

  return (
    <>
      <GenericFieldLabel label="Repository">{config.repositorySlug}</GenericFieldLabel>
      {config.branch && <GenericFieldLabel label="Branch">{config.branch}</GenericFieldLabel>}
    </>
  );
};
