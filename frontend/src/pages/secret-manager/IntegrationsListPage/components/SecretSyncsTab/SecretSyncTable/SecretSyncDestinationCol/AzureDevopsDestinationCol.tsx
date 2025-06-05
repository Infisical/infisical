import { TAzureDevOpsSync } from "@app/hooks/api/secretSyncs/types/azure-devops-sync";

import { getSecretSyncDestinationColValues } from "../helpers";
import { SecretSyncTableCell } from "../SecretSyncTableCell";

type Props = {
  secretSync: TAzureDevOpsSync;
};

export const AzureDevOpsSyncDestinationCol = ({ secretSync }: Props) => {
  const { primaryText, secondaryText } = getSecretSyncDestinationColValues(secretSync);

  return <SecretSyncTableCell primaryText={primaryText} secondaryText={secondaryText} />;
};
