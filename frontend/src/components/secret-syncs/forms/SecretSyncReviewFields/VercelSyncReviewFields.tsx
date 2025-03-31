import { useFormContext } from "react-hook-form";

import { SecretSyncLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { VercelEnvironmentType } from "@app/hooks/api/secretSyncs/types/vercel-sync";

export const VercelSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Vercel }>();
  const envId = watch("destinationConfig.env");
  const branchId = watch("destinationConfig.branch");
  const appName = watch("destinationConfig.appName");

  return (
    <>
      <SecretSyncLabel label="Vercel App">{appName}</SecretSyncLabel>
      <SecretSyncLabel label="Environment">{envId}</SecretSyncLabel>
      {envId === VercelEnvironmentType.Preview && branchId && (
        <SecretSyncLabel label="Preview Branch">{branchId}</SecretSyncLabel>
      )}
    </>
  );
};
