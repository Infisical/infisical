import { Badge, Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { CLOUDFLARE_WORKERS_VARIABLE_TYPE_LABELS } from "@app/helpers/secretSyncs";
import {
  CloudflareWorkersVariableType,
  TCloudflareWorkersSync
} from "@app/hooks/api/secretSyncs/types/cloudflare-workers-sync";

type Props = {
  secretSync: TCloudflareWorkersSync;
};

export const CloudflareWorkersSyncOptionsSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { variableType = CloudflareWorkersVariableType.Secret },
    syncOptions: { syncNonSecretBindings = false } = {}
  } = secretSync;

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
            <Badge variant={syncNonSecretBindings ? "success" : "neutral"}>
              {syncNonSecretBindings ? "Enabled" : "Disabled"}
            </Badge>
          </DetailValue>
        </Detail>
      )}
    </>
  );
};
