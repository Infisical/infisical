import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSnowflakeSync } from "@app/hooks/api/secretSyncs/types/snowflake-sync";

type Props = {
  secretSync: TSnowflakeSync;
};

export const SnowflakeSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <GenericFieldLabel label="Database">{destinationConfig.database}</GenericFieldLabel>
      <GenericFieldLabel label="Schema">{destinationConfig.schema}</GenericFieldLabel>
    </>
  );
};
