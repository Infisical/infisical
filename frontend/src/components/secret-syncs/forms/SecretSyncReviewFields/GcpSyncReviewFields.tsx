import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const GcpSyncReviewFields = () => {
  const { watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.GCPSecretManager }
  >();
  const projectId = watch("destinationConfig.projectId");

  return <GenericFieldLabel label="Project ID">{projectId}</GenericFieldLabel>;
};
