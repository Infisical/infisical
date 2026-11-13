import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { DENO_DEPLOY_SYNC_CONTEXT_OPTIONS } from "@app/hooks/api/secretSyncs/types/deno-deploy-sync";

export const DenoDeploySyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.DenoDeploy }>();
  const appSlug = watch("destinationConfig.appSlug");
  const context = watch("destinationConfig.context");
  const contextLabel =
    DENO_DEPLOY_SYNC_CONTEXT_OPTIONS.find((option) => option.value === context)?.label ?? context;

  return (
    <>
      <Detail>
        <DetailLabel>App</DetailLabel>
        <DetailValue>{appSlug}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Context</DetailLabel>
        <DetailValue>{contextLabel}</DetailValue>
      </Detail>
    </>
  );
};
