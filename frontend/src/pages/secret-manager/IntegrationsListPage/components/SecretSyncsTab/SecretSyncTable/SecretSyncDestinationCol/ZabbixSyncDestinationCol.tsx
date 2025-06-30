import { TZabbixSync } from "@app/hooks/api/secretSyncs/types/zabbix-sync";

import { getSecretSyncDestinationColValues } from "../helpers";
import { SecretSyncTableCell } from "../SecretSyncTableCell";

type Props = {
  secretSync: TZabbixSync;
};

export const ZabbixSyncDestinationCol = ({ secretSync }: Props) => {
  const { primaryText, secondaryText } = getSecretSyncDestinationColValues(secretSync);

  return <SecretSyncTableCell primaryText={primaryText} secondaryText={secondaryText} />;
};
