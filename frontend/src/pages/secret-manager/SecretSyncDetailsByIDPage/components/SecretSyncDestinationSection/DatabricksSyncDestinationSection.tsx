import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TDatabricksSync } from "@app/hooks/api/secretSyncs/types/databricks-sync";

type Props = {
  secretSync: TDatabricksSync;
};

export const DatabricksSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { scope }
  } = secretSync;

  return (
    <Detail>
      <DetailLabel>Secret Scope</DetailLabel>
      <DetailValue>{scope}</DetailValue>
    </Detail>
  );
};
