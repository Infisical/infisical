import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const NorthflankSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Northflank }>();
  const projectName = watch("destinationConfig.projectName");
  const projectId = watch("destinationConfig.projectId");
  const secretGroupName = watch("destinationConfig.secretGroupName");
  const secretGroupId = watch("destinationConfig.secretGroupId");

  return (
    <>
      <Detail>
        <DetailLabel>Project</DetailLabel>
        <DetailValue>{projectName || projectId}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Secret Group</DetailLabel>
        <DetailValue>{secretGroupName || secretGroupId}</DetailValue>
      </Detail>
    </>
  );
};
