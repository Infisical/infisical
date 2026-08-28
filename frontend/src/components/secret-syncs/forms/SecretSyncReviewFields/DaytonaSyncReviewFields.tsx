import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const DaytonaSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Daytona }>();
  const organizationName = watch("destinationConfig.organizationName");

  return (
    <Detail>
      <DetailLabel>Organization</DetailLabel>
      <DetailValue>{organizationName}</DetailValue>
    </Detail>
  );
};
