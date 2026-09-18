import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const TravisCISyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.TravisCI }>();

  const config = watch("destinationConfig");

  return (
    <>
      <Detail>
        <DetailLabel>Repository</DetailLabel>
        <DetailValue>{config.repositorySlug}</DetailValue>
      </Detail>
      {config.branch && (
        <Detail>
          <DetailLabel>Branch</DetailLabel>
          <DetailValue>{config.branch}</DetailValue>
        </Detail>
      )}
    </>
  );
};
