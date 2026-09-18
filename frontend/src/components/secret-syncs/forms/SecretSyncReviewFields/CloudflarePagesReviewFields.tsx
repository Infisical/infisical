import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const CloudflarePagesSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.CloudflarePages }>();
  const projectName = watch("destinationConfig.projectName");
  const environment = watch("destinationConfig.environment");

  return (
    <>
      <Detail>
        <DetailLabel>Project</DetailLabel>
        <DetailValue>{projectName}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Environment</DetailLabel>
        <DetailValue>{environment}</DetailValue>
      </Detail>
    </>
  );
};
