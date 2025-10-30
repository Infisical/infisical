import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const ChefSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Chef }>();
  const dataBagName = watch("destinationConfig.dataBagName");
  const dataBagItemName = watch("destinationConfig.dataBagItemName");

  return (
    <>
      <GenericFieldLabel label="Data Bag">{dataBagName}</GenericFieldLabel>
      <GenericFieldLabel label="Data Bag Item">{dataBagItemName}</GenericFieldLabel>
    </>
  );
};
