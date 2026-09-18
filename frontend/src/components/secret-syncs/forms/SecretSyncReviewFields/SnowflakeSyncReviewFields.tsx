import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const SnowflakeSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Snowflake }>();
  const database = watch("destinationConfig.database");
  const schema = watch("destinationConfig.schema");

  return (
    <>
      <Detail>
        <DetailLabel>Database</DetailLabel>
        <DetailValue>{database}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Schema</DetailLabel>
        <DetailValue>{schema}</DetailValue>
      </Detail>
    </>
  );
};
