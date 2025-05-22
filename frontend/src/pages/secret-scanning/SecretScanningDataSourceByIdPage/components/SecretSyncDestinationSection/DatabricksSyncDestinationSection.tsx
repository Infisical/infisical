import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TDatabricksSync } from "@app/hooks/api/secretSyncs/types/databricks-sync";

type Props = {
  secretSync: TDatabricksSync;
};

export const DatabricksSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { scope }
  } = secretSync;

  return <GenericFieldLabel label="Secret Scope">{scope}</GenericFieldLabel>;
};
