import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const CircleCISyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.CircleCI }>();
  const orgName = watch("destinationConfig.orgName");
  const projectName = watch("destinationConfig.projectName");

  return (
    <>
      <Detail>
        <DetailLabel>Organization</DetailLabel>
        <DetailValue>{orgName}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Project</DetailLabel>
        <DetailValue>{projectName}</DetailValue>
      </Detail>
    </>
  );
};
