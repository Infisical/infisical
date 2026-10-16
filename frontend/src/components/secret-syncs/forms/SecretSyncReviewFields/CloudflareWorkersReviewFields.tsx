import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Badge, Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { CloudflareWorkersSyncTarget } from "@app/hooks/api/secretSyncs/types/cloudflare-workers-sync";

const cloudflareWorkersTargetLabels: Record<CloudflareWorkersSyncTarget, string> = {
  [CloudflareWorkersSyncTarget.Script]: "Worker Script",
  [CloudflareWorkersSyncTarget.PreviewsBase]: "Previews Base Config",
  [CloudflareWorkersSyncTarget.Preview]: "Specific Preview"
};
export const CloudflareWorkersSyncOptionsReviewFields = () => {
  const { watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.CloudflareWorkers }
  >();

  const [{ syncNonSecretBindings }] = watch(["syncOptions"]);
  const target = watch("destinationConfig.target") ?? CloudflareWorkersSyncTarget.Script;

  if (target !== CloudflareWorkersSyncTarget.Script) {
    return null;
  }

  return (
    <Detail>
      <DetailLabel>Sync Plaintext and JSON Variables</DetailLabel>
      <DetailValue>
        <Badge variant={syncNonSecretBindings ? "success" : "danger"}>
          {syncNonSecretBindings ? "Enabled" : "Disabled"}
        </Badge>
      </DetailValue>
    </Detail>
  );
};

export const CloudflareWorkersSyncReviewFields = () => {
  const { watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.CloudflareWorkers }
  >();
  const scriptId = watch("destinationConfig.scriptId");
  const target = watch("destinationConfig.target") ?? CloudflareWorkersSyncTarget.Script;
  const previewName = watch("destinationConfig.previewName");

  return (
    <>
      <Detail>
        <DetailLabel>Script</DetailLabel>
        <DetailValue>{scriptId}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Sync Target</DetailLabel>
        <DetailValue>{cloudflareWorkersTargetLabels[target]}</DetailValue>
      </Detail>
      {target === CloudflareWorkersSyncTarget.Preview && (
        <Detail>
          <DetailLabel>Preview Name</DetailLabel>
          <DetailValue>{previewName}</DetailValue>
        </Detail>
      )}
    </>
  );
};
