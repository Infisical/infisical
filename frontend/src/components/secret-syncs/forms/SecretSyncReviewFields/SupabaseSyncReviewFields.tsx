import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const SupabaseSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Supabase }>();
  const projectName = watch("destinationConfig.projectName");

  return <GenericFieldLabel label="Project">{projectName}</GenericFieldLabel>;
};
