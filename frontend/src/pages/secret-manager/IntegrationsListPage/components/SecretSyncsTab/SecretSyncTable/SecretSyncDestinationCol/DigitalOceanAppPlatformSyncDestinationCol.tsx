import { TDigitalOceanAppPlatformSync } from "@app/hooks/api/secretSyncs/types/digital-ocean-app-platform-sync";

import { getSecretSyncDestinationColValues } from "../helpers";
import { SecretSyncTableCell } from "../SecretSyncTableCell";

type Props = {
  secretSync: TDigitalOceanAppPlatformSync;
};

export const DigitalOceanAppPlatformSyncDestinationCol = ({ secretSync }: Props) => {
  const { primaryText, secondaryText } = getSecretSyncDestinationColValues(secretSync);

  return <SecretSyncTableCell primaryText={primaryText} secondaryText={secondaryText} />;
};
