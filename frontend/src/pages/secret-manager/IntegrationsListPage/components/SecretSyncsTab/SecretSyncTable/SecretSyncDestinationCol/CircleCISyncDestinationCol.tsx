import { TSecretSync } from "@app/hooks/api/secretSyncs";

import { getSecretSyncDestinationColValues } from "../helpers";
import { SecretSyncTableCell } from "../SecretSyncTableCell";

type Props = {
  secretSync: TSecretSync;
};

export const CircleCISyncDestinationCol = ({ secretSync }: Props) => {
  const { primaryText, secondaryText } = getSecretSyncDestinationColValues(secretSync);

  return <SecretSyncTableCell primaryText={primaryText} secondaryText={secondaryText} />;
};
