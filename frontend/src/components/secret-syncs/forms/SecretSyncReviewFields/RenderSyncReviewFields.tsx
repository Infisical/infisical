import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const RenderSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Render }>();
  const serviceName = watch("destinationConfig.serviceName");
  const scope = watch("destinationConfig.scope");

  return (
    <>
      <GenericFieldLabel label="Scope">{scope}</GenericFieldLabel>
      <GenericFieldLabel label="Service">{serviceName}</GenericFieldLabel>
    </>
  );
};
