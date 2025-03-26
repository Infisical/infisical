import { TDatabricksSync } from "@app/hooks/api/secretSyncs/types/databricks-sync";

import { getSecretSyncDestinationColValues } from "../helpers";
import { SecretSyncTableCell } from "../SecretSyncTableCell";

type Props = {
  secretSync: TDatabricksSync;
};

export const DatabricksSyncDestinationCol = ({ secretSync }: Props) => {
  const { primaryText } = getSecretSyncDestinationColValues(secretSync);

  return <SecretSyncTableCell primaryText={primaryText} secondaryText="Secret Scope" />;
};
