import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import {
  AzureKeyVaultSyncMappingBehavior,
  TAzureKeyVaultSync
} from "@app/hooks/api/secretSyncs/types/azure-key-vault-sync";

type Props = {
  secretSync: TAzureKeyVaultSync;
};

export const AzureKeyVaultSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Vault URL</DetailLabel>
        <DetailValue>{destinationConfig.vaultBaseUrl}</DetailValue>
      </Detail>
      <Detail className="capitalize">
        <DetailLabel>Mapping Behavior</DetailLabel>
        <DetailValue>{destinationConfig.mappingBehavior}</DetailValue>
      </Detail>
      {destinationConfig.mappingBehavior === AzureKeyVaultSyncMappingBehavior.ManyToOne && (
        <Detail>
          <DetailLabel>Secret Name</DetailLabel>
          <DetailValue>{destinationConfig.secretName}</DetailValue>
        </Detail>
      )}
    </>
  );
};
