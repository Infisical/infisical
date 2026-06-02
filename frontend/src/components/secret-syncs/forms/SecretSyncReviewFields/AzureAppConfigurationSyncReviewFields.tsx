import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const AzureAppConfigurationSyncReviewFields = () => {
  const { watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AzureAppConfiguration }
  >();
  const vaultBaseUrl = watch("destinationConfig.configurationUrl");
  const label = watch("destinationConfig.label");

  return (
    <>
      <Detail>
        <DetailLabel>Configuration URL</DetailLabel>
        <DetailValue>{vaultBaseUrl}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Label</DetailLabel>
        <DetailValue>{label}</DetailValue>
      </Detail>
    </>
  );
};
