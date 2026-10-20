import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { CLOUDFLARE_WORKERS_VARIABLE_TYPE_LABELS } from "@app/helpers/secretSyncs";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { CloudflareWorkersVariableType } from "@app/hooks/api/secretSyncs/types/cloudflare-workers-sync";

export const CloudflareWorkersSyncOptionsReviewFields = () => {
  const { watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.CloudflareWorkers }
  >();

  const variableType =
    watch("destinationConfig.variableType") ?? CloudflareWorkersVariableType.Secret;

  return (
    <Detail>
      <DetailLabel>Variable Type</DetailLabel>
      <DetailValue>{CLOUDFLARE_WORKERS_VARIABLE_TYPE_LABELS[variableType]}</DetailValue>
    </Detail>
  );
};

export const CloudflareWorkersSyncReviewFields = () => {
  const { watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.CloudflareWorkers }
  >();
  const scriptId = watch("destinationConfig.scriptId");

  return (
    <Detail>
      <DetailLabel>Script</DetailLabel>
      <DetailValue>{scriptId}</DetailValue>
    </Detail>
  );
};
