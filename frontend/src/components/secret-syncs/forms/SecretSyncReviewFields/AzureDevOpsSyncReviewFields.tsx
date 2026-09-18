import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const AzureDevOpsSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.AzureDevOps }>();
  const devopsProjectId = watch("destinationConfig.devopsProjectId");
  const devopsProjectName = watch("destinationConfig.devopsProjectName");

  return (
    <>
      {devopsProjectName && (
        <Detail>
          <DetailLabel>Project</DetailLabel>
          <DetailValue>{devopsProjectName}</DetailValue>
        </Detail>
      )}
      <Detail>
        <DetailLabel>Project ID</DetailLabel>
        <DetailValue>{devopsProjectId}</DetailValue>
      </Detail>
    </>
  );
};
