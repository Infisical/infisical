import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { AzureKeyVaultSyncMappingBehavior } from "@app/hooks/api/secretSyncs/types/azure-key-vault-sync";

export const AzureKeyVaultSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.AzureKeyVault }>();
  const [vaultBaseUrl, mappingBehavior, secretName] = watch([
    "destinationConfig.vaultBaseUrl",
    "destinationConfig.mappingBehavior",
    "destinationConfig.secretName"
  ]);

  return (
    <>
      <Detail>
        <DetailLabel>Vault URL</DetailLabel>
        <DetailValue>{vaultBaseUrl}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Mapping Behavior</DetailLabel>
        <DetailValue className="capitalize">{mappingBehavior}</DetailValue>
      </Detail>
      {mappingBehavior === AzureKeyVaultSyncMappingBehavior.ManyToOne && (
        <Detail>
          <DetailLabel>Secret Name</DetailLabel>
          <DetailValue>{secretName}</DetailValue>
        </Detail>
      )}
    </>
  );
};
