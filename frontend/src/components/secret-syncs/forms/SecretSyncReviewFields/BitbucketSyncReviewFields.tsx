import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const BitbucketSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Bitbucket }>();
  const repository = watch("destinationConfig.repositorySlug");
  const environment = watch("destinationConfig.environmentId");
  const workspace = watch("destinationConfig.workspaceSlug");

  return (
    <>
      <Detail>
        <DetailLabel>Repository</DetailLabel>
        <DetailValue>{repository}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Environment</DetailLabel>
        <DetailValue>{environment}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Workspace</DetailLabel>
        <DetailValue>{workspace}</DetailValue>
      </Detail>
    </>
  );
};
