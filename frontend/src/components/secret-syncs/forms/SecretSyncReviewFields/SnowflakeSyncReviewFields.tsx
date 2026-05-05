import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const SnowflakeSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Snowflake }>();
  const database = watch("destinationConfig.database");
  const schema = watch("destinationConfig.schema");

  return (
    <>
      <GenericFieldLabel label="Database">{database}</GenericFieldLabel>
      <GenericFieldLabel label="Schema">{schema}</GenericFieldLabel>
    </>
  );
};
