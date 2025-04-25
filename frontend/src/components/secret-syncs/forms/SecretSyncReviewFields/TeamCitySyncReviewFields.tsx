import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const TeamCitySyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.TeamCity }>();
  const project = watch("destinationConfig.project");
  const buildConfig = watch("destinationConfig.buildConfig");

  return (
    <>
      <GenericFieldLabel label="Project">{project}</GenericFieldLabel>
      <GenericFieldLabel label="Build Configuration">{buildConfig}</GenericFieldLabel>
    </>
  );
};
