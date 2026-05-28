import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const ChefSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Chef }>();
  const dataBagName = watch("destinationConfig.dataBagName");
  const dataBagItemName = watch("destinationConfig.dataBagItemName");

  return (
    <>
      <Detail>
        <DetailLabel>Data Bag</DetailLabel>
        <DetailValue>{dataBagName}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Data Bag Item</DetailLabel>
        <DetailValue>{dataBagItemName}</DetailValue>
      </Detail>
    </>
  );
};
