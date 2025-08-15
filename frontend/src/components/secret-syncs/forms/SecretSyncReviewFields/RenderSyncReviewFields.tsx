import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Badge } from "@app/components/v2";
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
  const scope = watch("destinationConfig.scope");

  if (scope === RenderSyncScope.Service) {
    const name = watch("destinationConfig.serviceName");
    const id = watch("destinationConfig.serviceId");

    return (
      <>
        <GenericFieldLabel label="Scope">{scope}</GenericFieldLabel>
        <GenericFieldLabel label="Service">{name ?? id}</GenericFieldLabel>
      </>
    );
  }

  const name = watch("destinationConfig.environmentGroupName");
  const id = watch("destinationConfig.environmentGroupId");

  return (
    <>
      <GenericFieldLabel label="Scope">{scope}</GenericFieldLabel>
      <GenericFieldLabel label="Environment Group">{name ?? id}</GenericFieldLabel>
    </>
  );
};
