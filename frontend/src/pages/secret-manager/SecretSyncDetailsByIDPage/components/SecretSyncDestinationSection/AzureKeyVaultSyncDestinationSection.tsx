import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TAzureKeyVaultSync } from "@app/hooks/api/secretSyncs/types/azure-key-vault-sync";

type Props = {
  secretSync: TAzureKeyVaultSync;
};

export const AzureKeyVaultSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { vaultBaseUrl }
  } = secretSync;

  return (
    <Detail>
      <DetailLabel>Vault URL</DetailLabel>
      <DetailValue>{vaultBaseUrl}</DetailValue>
    </Detail>
  );
};
