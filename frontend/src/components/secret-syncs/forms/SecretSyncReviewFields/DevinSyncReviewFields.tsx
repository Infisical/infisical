import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const DevinSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Devin }>();
  const orgId = watch("destinationConfig.orgId");

  return (
    <Detail>
      <DetailLabel>Organization ID</DetailLabel>
      <DetailValue>{orgId}</DetailValue>
    </Detail>
  );
};
