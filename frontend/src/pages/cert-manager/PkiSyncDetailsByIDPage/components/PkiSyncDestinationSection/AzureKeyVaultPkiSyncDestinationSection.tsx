import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TAzureKeyVaultPkiSync } from "@app/hooks/api/pkiSyncs/types/azure-key-vault-sync";

type Props = {
  pkiSync: TAzureKeyVaultPkiSync;
};

export const AzureKeyVaultPkiSyncDestinationSection = ({ pkiSync }: Props) => {
  return (
    <Detail>
      <DetailLabel>Key Vault URL</DetailLabel>
      <DetailValue>{pkiSync.destinationConfig.vaultBaseUrl}</DetailValue>
    </Detail>
  );
};
