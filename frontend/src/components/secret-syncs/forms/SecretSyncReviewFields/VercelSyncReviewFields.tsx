import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { VercelEnvironmentType } from "@app/hooks/api/secretSyncs/types/vercel-sync";

export const VercelSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Vercel }>();
  const envId = watch("destinationConfig.env");
  const branchId = watch("destinationConfig.branch");
  const appName = watch("destinationConfig.appName");

  return (
    <>
      <GenericFieldLabel label="Vercel App">{appName}</GenericFieldLabel>
      <GenericFieldLabel label="Environment">{envId}</GenericFieldLabel>
      {envId === VercelEnvironmentType.Preview && branchId && (
        <GenericFieldLabel label="Preview Branch">{branchId}</GenericFieldLabel>
      )}
    </>
  );
};
