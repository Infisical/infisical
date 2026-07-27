import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const SpaceliftSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Spacelift }>();
  const contextName = watch("destinationConfig.contextName");
  const contextId = watch("destinationConfig.contextId");

  return (
    <>
      <Detail>
        <DetailLabel>Context</DetailLabel>
        <DetailValue>{contextName}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Context ID</DetailLabel>
        <DetailValue>{contextId}</DetailValue>
      </Detail>
    </>
  );
};
