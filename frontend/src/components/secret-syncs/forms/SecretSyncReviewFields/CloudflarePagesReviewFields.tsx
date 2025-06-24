import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const CloudflarePagesSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.CloudflarePages }>();
  const projectName = watch("destinationConfig.projectName");
  const environment = watch("destinationConfig.environment");

  return (
    <>
      <GenericFieldLabel label="Project">{projectName}</GenericFieldLabel>
      <GenericFieldLabel label="Environment">{environment}</GenericFieldLabel>
    </>
  );
};
