import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Badge } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const RenderSyncOptionsReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Render }>();

  const [{ autoRedeployServices }] = watch(["syncOptions"]);

  return (
    <div>
      {autoRedeployServices ? (
        <GenericFieldLabel label="Auto Redeploy Services">
          <Badge variant="success">Enabled</Badge>
        </GenericFieldLabel>
      ) : (
        <GenericFieldLabel label="Auto Redeploy Services">
          <Badge variant="danger">Disabled</Badge>
        </GenericFieldLabel>
      )}
    </div>
  );
};

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
