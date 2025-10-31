import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const NorthflankSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Northflank }>();
  const projectName = watch("destinationConfig.projectName");
  const projectId = watch("destinationConfig.projectId");
  const secretGroupName = watch("destinationConfig.secretGroupName");
  const secretGroupId = watch("destinationConfig.secretGroupId");

  return (
    <>
      <GenericFieldLabel label="Project">{projectName || projectId}</GenericFieldLabel>
      <GenericFieldLabel label="Secret Group">{secretGroupName || secretGroupId}</GenericFieldLabel>
    </>
  );
};
