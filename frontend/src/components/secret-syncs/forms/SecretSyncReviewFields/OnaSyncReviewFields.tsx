import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const OnaSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Ona }>();
  const destinationConfig = watch("destinationConfig");

  return (
    <GenericFieldLabel label="Ona Project">
      {destinationConfig.projectName || destinationConfig.projectId}
    </GenericFieldLabel>
  );
};
