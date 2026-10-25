import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Badge, Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { CLOUDFLARE_WORKERS_VARIABLE_TYPE_LABELS } from "@app/helpers/secretSyncs";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { CloudflareWorkersVariableType } from "@app/hooks/api/secretSyncs/types/cloudflare-workers-sync";

export const CloudflareWorkersSyncOptionsReviewFields = () => {
  const { watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.CloudflareWorkers }
  >();

  const [{ syncNonSecretBindings }, variableType = CloudflareWorkersVariableType.Secret] = watch([
    "syncOptions",
    "destinationConfig.variableType"
  ]);

  return (
    <>
      <Detail>
        <DetailLabel>Variable Type</DetailLabel>
        <DetailValue>{CLOUDFLARE_WORKERS_VARIABLE_TYPE_LABELS[variableType]}</DetailValue>
      </Detail>
      {variableType === CloudflareWorkersVariableType.Secret && (
        <Detail>
          <DetailLabel>Sync Plaintext and JSON Variables</DetailLabel>
          <DetailValue>
            <Badge variant={syncNonSecretBindings ? "success" : "danger"}>
              {syncNonSecretBindings ? "Enabled" : "Disabled"}
            </Badge>
          </DetailValue>
        </Detail>
      )}
    </>
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
