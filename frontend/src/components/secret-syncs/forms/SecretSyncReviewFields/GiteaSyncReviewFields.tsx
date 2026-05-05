import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const GiteaSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Gitea }>();
  const owner = watch("destinationConfig.owner");
  const repo = watch("destinationConfig.repo");

  return <GenericFieldLabel label="Repository">{`${owner}/${repo}`}</GenericFieldLabel>;
};
