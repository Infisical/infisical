import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TSnowflakeSync } from "@app/hooks/api/secretSyncs/types/snowflake-sync";

type Props = {
  secretSync: TSnowflakeSync;
};

export const SnowflakeSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Database</DetailLabel>
        <DetailValue>{destinationConfig.database}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Schema</DetailLabel>
        <DetailValue>{destinationConfig.schema}</DetailValue>
      </Detail>
    </>
  );
};
