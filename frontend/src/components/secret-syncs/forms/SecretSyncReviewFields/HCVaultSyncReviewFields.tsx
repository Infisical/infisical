import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const HCVaultSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.HCVault }>();
  const mount = watch("destinationConfig.mount");
  const path = watch("destinationConfig.path");

  return (
    <>
      <Detail>
        <DetailLabel>Secrets Engine Mount</DetailLabel>
        <DetailValue>{mount}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Path</DetailLabel>
        <DetailValue>{path}</DetailValue>
      </Detail>
    </>
  );
};
