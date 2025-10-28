import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Badge } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { RenderSyncScope } from "@app/hooks/api/secretSyncs/types/render-sync";

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
  const config = watch("destinationConfig");

  return (
    <>
      <GenericFieldLabel label="Scope">{config.scope}</GenericFieldLabel>
      {config.scope === RenderSyncScope.Service ? (
        <GenericFieldLabel label="Service">
          {config.serviceName ?? config.serviceId}
        </GenericFieldLabel>
      ) : (
        <GenericFieldLabel label="Service">
          {config.environmentGroupName ?? config.environmentGroupId}
        </GenericFieldLabel>
      )}
    </>
  );
};
