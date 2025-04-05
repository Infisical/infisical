import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TAzureKeyVaultSync } from "@app/hooks/api/secretSyncs/types/azure-key-vault-sync";

type Props = {
  secretSync: TAzureKeyVaultSync;
};

export const AzureKeyVaultSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { vaultBaseUrl }
  } = secretSync;

  return <GenericFieldLabel label="Vault URL">{vaultBaseUrl}</GenericFieldLabel>;
};
