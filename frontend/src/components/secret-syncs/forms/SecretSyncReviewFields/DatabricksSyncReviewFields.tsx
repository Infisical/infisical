import { useFormContext } from "react-hook-form";

import { SecretSyncLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const DatabricksSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Databricks }>();
  const scope = watch("destinationConfig.scope");

  return <SecretSyncLabel label="Secret Scope">{scope}</SecretSyncLabel>;
};
