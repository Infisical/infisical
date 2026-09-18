import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const DatabricksSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Databricks }>();
  const scope = watch("destinationConfig.scope");

  return (
    <Detail>
      <DetailLabel>Secret Scope</DetailLabel>
      <DetailValue>{scope}</DetailValue>
    </Detail>
  );
};
