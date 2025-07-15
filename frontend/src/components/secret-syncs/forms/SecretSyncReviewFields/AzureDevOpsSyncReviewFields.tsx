import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const AzureDevOpsSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.AzureDevOps }>();
  const devopsProjectId = watch("destinationConfig.devopsProjectId");
  const devopsProjectName = watch("destinationConfig.devopsProjectName");

  return (
    <>
      {devopsProjectName && (
        <GenericFieldLabel label="Project">{devopsProjectName}</GenericFieldLabel>
      )}
      <GenericFieldLabel label="Project ID">{devopsProjectId}</GenericFieldLabel>
    </>
  );
};
