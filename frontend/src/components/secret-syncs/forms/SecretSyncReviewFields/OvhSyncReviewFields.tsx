import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const OvhSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.OVH }>();
  const path = watch("destinationConfig.path");

  return (
    <Detail>
      <DetailLabel>Path</DetailLabel>
      <DetailValue>{path}</DetailValue>
    </Detail>
  );
};
