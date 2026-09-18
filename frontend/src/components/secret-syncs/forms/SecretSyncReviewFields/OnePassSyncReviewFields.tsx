import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const OnePassSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.OnePass }>();
  const [vaultId, valueLabel] = watch([
    "destinationConfig.vaultId",
    "destinationConfig.valueLabel"
  ]);

  return (
    <>
      <Detail>
        <DetailLabel>Vault ID</DetailLabel>
        <DetailValue>{vaultId}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Value Key</DetailLabel>
        <DetailValue>{valueLabel || "value"}</DetailValue>
      </Detail>
    </>
  );
};
