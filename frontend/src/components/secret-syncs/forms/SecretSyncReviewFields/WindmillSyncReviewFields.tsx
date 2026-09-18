import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const WindmillSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Windmill }>();
  const workspace = watch("destinationConfig.workspace");
  const path = watch("destinationConfig.path");

  return (
    <>
      <Detail>
        <DetailLabel>Workspace</DetailLabel>
        <DetailValue>{workspace}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Path</DetailLabel>
        <DetailValue>{path}</DetailValue>
      </Detail>
    </>
  );
};
