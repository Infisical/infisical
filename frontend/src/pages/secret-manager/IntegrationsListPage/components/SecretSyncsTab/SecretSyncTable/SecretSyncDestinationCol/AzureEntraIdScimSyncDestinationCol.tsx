import { TAzureEntraIdScimSync } from "@app/hooks/api/secretSyncs/types/azure-entra-id-scim-sync";

import { getSecretSyncDestinationColValues } from "../helpers";
import { SecretSyncTableCell } from "../SecretSyncTableCell";

type Props = {
  secretSync: TAzureEntraIdScimSync;
};

export const AzureEntraIdScimSyncDestinationCol = ({ secretSync }: Props) => {
  const { primaryText, secondaryText } = getSecretSyncDestinationColValues(secretSync);

  return <SecretSyncTableCell primaryText={primaryText} secondaryText={secondaryText} />;
};
