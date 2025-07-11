import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const CloudflareWorkersSyncReviewFields = () => {
  const { watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.CloudflareWorkers }
  >();
  const scriptId = watch("destinationConfig.scriptId");

  return <GenericFieldLabel label="Script">{scriptId}</GenericFieldLabel>;
};
