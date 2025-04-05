import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const AzureKeyVaultSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.AzureKeyVault }>();
  const vaultBaseUrl = watch("destinationConfig.vaultBaseUrl");

  return <GenericFieldLabel label="Vault URL">{vaultBaseUrl}</GenericFieldLabel>;
};
