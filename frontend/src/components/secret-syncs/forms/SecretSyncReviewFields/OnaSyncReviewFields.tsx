import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const OnaSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Ona }>();
  const destinationConfig = watch("destinationConfig");

  return (
    <Detail>
      <DetailLabel>Ona Project</DetailLabel>
      <DetailValue>{destinationConfig.projectName || destinationConfig.projectId}</DetailValue>
    </Detail>
  );
};
