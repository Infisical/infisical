import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const DatabricksSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Databricks }>();
  const scope = watch("destinationConfig.scope");

  return <GenericFieldLabel label="Secret Scope">{scope}</GenericFieldLabel>;
};
