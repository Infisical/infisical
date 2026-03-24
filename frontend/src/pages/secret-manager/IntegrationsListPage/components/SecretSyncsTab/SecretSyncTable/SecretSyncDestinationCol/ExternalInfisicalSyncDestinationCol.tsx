import { TExternalInfisicalSync } from "@app/hooks/api/secretSyncs/types/external-infisical-sync";

import { getSecretSyncDestinationColValues } from "../helpers";
import { SecretSyncTableCell } from "../SecretSyncTableCell";

type Props = {
  secretSync: TExternalInfisicalSync;
};

export const ExternalInfisicalSyncDestinationCol = ({ secretSync }: Props) => {
  const { primaryText, secondaryText } = getSecretSyncDestinationColValues(secretSync);
  return <SecretSyncTableCell primaryText={primaryText} secondaryText={secondaryText} />;
};
