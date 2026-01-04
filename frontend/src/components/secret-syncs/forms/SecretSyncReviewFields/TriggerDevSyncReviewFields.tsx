import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TriggerDevEnvironment } from "@app/hooks/api/secretSyncs/types/trigger-dev-sync";

const ENVIRONMENT_LABELS: Record<TriggerDevEnvironment, string> = {
  [TriggerDevEnvironment.Dev]: "Development",
  [TriggerDevEnvironment.Staging]: "Staging",
  [TriggerDevEnvironment.Prod]: "Production"
};

export const TriggerDevSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.TriggerDev }>();
  const projectRef = watch("destinationConfig.projectRef");
  const environment = watch("destinationConfig.environment");

  return (
    <>
      <GenericFieldLabel label="Project Ref">{projectRef}</GenericFieldLabel>
      <GenericFieldLabel label="Environment">
        {environment ? ENVIRONMENT_LABELS[environment] ?? environment : ""}
      </GenericFieldLabel>
    </>
  );
};
