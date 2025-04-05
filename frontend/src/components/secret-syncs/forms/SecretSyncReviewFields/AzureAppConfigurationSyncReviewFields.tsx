import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const AzureAppConfigurationSyncReviewFields = () => {
  const { watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AzureAppConfiguration }
  >();
  const vaultBaseUrl = watch("destinationConfig.configurationUrl");
  const label = watch("destinationConfig.label");

  return (
    <>
      <GenericFieldLabel label="Configuration URL">{vaultBaseUrl}</GenericFieldLabel>
      <GenericFieldLabel label="Label">{label}</GenericFieldLabel>
    </>
  );
};
