import { TCloudflareSecretsStoreSync } from "@app/hooks/api/secretSyncs/types/cloudflare-secrets-store-sync";

import { getSecretSyncDestinationColValues } from "../helpers";
import { SecretSyncTableCell } from "../SecretSyncTableCell";

type Props = {
  secretSync: TCloudflareSecretsStoreSync;
};

export const CloudflareSecretsStoreSyncDestinationCol = ({ secretSync }: Props) => {
  const { primaryText, secondaryText } = getSecretSyncDestinationColValues(secretSync);

  return <SecretSyncTableCell primaryText={primaryText} secondaryText={secondaryText} />;
};
