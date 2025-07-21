import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const BitbucketSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Bitbucket }>();
  const repository = watch("destinationConfig.repositorySlug");
  const environment = watch("destinationConfig.environmentId");
  const workspace = watch("destinationConfig.workspaceSlug");

  return (
    <>
      <GenericFieldLabel label="Repository">{repository}</GenericFieldLabel>
      <GenericFieldLabel label="Environment">{environment}</GenericFieldLabel>
      <GenericFieldLabel label="Workspace">{workspace}</GenericFieldLabel>
    </>
  );
};
