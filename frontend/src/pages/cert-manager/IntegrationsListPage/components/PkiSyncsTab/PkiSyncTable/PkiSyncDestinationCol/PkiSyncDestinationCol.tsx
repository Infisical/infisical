import { PkiSyncData } from "@app/hooks/api/pkiSyncs";

import { getPkiSyncDestinationColValues } from "../helpers";
import { PkiSyncTableCell } from "../PkiSyncTableCell";

type Props = {
  pkiSync: PkiSyncData;
};

export const PkiSyncDestinationCol = ({ pkiSync }: Props) => {
  const { primaryText, secondaryText } = getPkiSyncDestinationColValues(pkiSync);

  return <PkiSyncTableCell primaryText={primaryText} secondaryText={secondaryText} />;
};
