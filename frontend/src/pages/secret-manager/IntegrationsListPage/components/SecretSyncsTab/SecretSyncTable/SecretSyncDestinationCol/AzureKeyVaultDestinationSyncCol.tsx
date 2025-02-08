import { TAzureKeyVaultSync } from "@app/hooks/api/secretSyncs/types/azure-key-vault-sync";

import { getSecretSyncDestinationColValues } from "../helpers";
import { SecretSyncTableCell } from "../SecretSyncTableCell";

type Props = {
  secretSync: TAzureKeyVaultSync;
};

export const AzureKeyVaultDestinationSyncCol = ({ secretSync }: Props) => {
  const { primaryText, secondaryText } = getSecretSyncDestinationColValues(secretSync);

  return <SecretSyncTableCell primaryText={primaryText} secondaryText={secondaryText} />;
};
