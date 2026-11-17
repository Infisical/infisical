import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { COOLIFY_RESOURCE_TYPE_LABELS } from "@app/helpers/secretSyncs";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const CoolifySyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Coolify }>();
  const { resourceType, resourceName } = watch("destinationConfig");

  return (
    <Detail>
      <DetailLabel>{COOLIFY_RESOURCE_TYPE_LABELS[resourceType]}</DetailLabel>
      <DetailValue>{resourceName}</DetailValue>
    </Detail>
  );
};
