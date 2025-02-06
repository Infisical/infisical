import { TAzureAppConfigurationSync } from "@app/hooks/api/secretSyncs/types/azure-app-configuration-sync";

import { getSecretSyncDestinationColValues } from "../helpers";
import { SecretSyncTableCell } from "../SecretSyncTableCell";

type Props = {
  secretSync: TAzureAppConfigurationSync;
};

export const AzureAppConfigurationDestinationSyncCol = ({ secretSync }: Props) => {
  const { primaryText, secondaryText } = getSecretSyncDestinationColValues(secretSync);

  return <SecretSyncTableCell primaryText={primaryText} secondaryText={secondaryText} />;
};
