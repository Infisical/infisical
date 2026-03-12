import { TSecretSync } from "@app/hooks/api/secretSyncs";

import { SecretSyncTableCell } from "../SecretSyncTableCell";

type Props = {
  secretSync: TSecretSync;
};

export const KoyebSyncDestinationCol = ({ secretSync: _ }: Props) => (
  <SecretSyncTableCell primaryText="Koyeb Organization" />
);
