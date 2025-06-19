import { THerokuSync } from "@app/hooks/api/secretSyncs/types/heroku-sync";

import { getSecretSyncDestinationColValues } from "../helpers";
import { SecretSyncTableCell } from "../SecretSyncTableCell";

type Props = {
  secretSync: THerokuSync;
};

export const HerokuSyncDestinationCol = ({ secretSync }: Props) => {
  const { primaryText, secondaryText } = getSecretSyncDestinationColValues(secretSync);

  return <SecretSyncTableCell primaryText={primaryText} secondaryText={secondaryText} />;
};
