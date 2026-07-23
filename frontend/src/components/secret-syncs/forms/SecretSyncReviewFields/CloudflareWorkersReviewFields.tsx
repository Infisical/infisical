import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Badge, Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const CloudflareWorkersSyncOptionsReviewFields = () => {
  const { watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.CloudflareWorkers }
  >();

  const [{ syncNonSecretBindings }] = watch(["syncOptions"]);

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

  return (
    <Detail>
      <DetailLabel>Script</DetailLabel>
      <DetailValue>{scriptId}</DetailValue>
    </Detail>
  );
};
