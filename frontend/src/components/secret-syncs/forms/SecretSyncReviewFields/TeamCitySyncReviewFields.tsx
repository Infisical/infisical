import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const TeamCitySyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.TeamCity }>();
  const project = watch("destinationConfig.project");
  const buildConfig = watch("destinationConfig.buildConfig");

  return (
    <>
      <Detail>
        <DetailLabel>Project</DetailLabel>
        <DetailValue>{project}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Build Configuration</DetailLabel>
        <DetailValue>{buildConfig}</DetailValue>
      </Detail>
    </>
  );
};
