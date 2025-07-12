import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const ChecklySyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Checkly }>();
  const accountName = watch("destinationConfig.accountName");

  return <GenericFieldLabel label="Account">{accountName}</GenericFieldLabel>;
};
