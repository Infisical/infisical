import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const AzureKeyVaultSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.AzureKeyVault }>();
  const vaultBaseUrl = watch("destinationConfig.vaultBaseUrl");

  return (
    <Detail>
      <DetailLabel>Vault URL</DetailLabel>
      <DetailValue>{vaultBaseUrl}</DetailValue>
    </Detail>
  );
};
