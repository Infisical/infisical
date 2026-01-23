import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const CircleCISyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.CircleCI }>();
  const projectSlug = watch("destinationConfig.projectSlug");
  const projectName = watch("destinationConfig.projectName");

  return <GenericFieldLabel label="Project">{projectName || projectSlug}</GenericFieldLabel>;
};
