import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const SupabaseSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Supabase }>();
  const projectName = watch("destinationConfig.projectName");

  return (
    <Detail>
      <DetailLabel>Project</DetailLabel>
      <DetailValue>{projectName}</DetailValue>
    </Detail>
  );
};
