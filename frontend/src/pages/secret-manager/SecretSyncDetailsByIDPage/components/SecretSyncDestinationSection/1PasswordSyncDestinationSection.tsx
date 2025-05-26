import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TOnePassSync } from "@app/hooks/api/secretSyncs/types/1password-sync";

type Props = {
  secretSync: TOnePassSync;
};

export const OnePassSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { vaultId }
  } = secretSync;

  return <GenericFieldLabel label="Vault ID">{vaultId}</GenericFieldLabel>;
};
