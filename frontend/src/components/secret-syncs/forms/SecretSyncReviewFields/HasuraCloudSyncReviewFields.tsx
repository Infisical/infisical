import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const HasuraCloudSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.HasuraCloud }>();
  const projectId = watch("destinationConfig.projectId");
  const projectName = watch("destinationConfig.projectName");

  return (
    <Detail>
      <DetailLabel>Project</DetailLabel>
      <DetailValue>{projectName || projectId}</DetailValue>
    </Detail>
  );
};
