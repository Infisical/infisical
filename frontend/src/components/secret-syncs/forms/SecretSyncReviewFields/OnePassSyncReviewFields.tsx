import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const OnePassSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.OnePass }>();
  const vaultId = watch("destinationConfig.vaultId");

  return <GenericFieldLabel label="Vault ID">{vaultId}</GenericFieldLabel>;
};
