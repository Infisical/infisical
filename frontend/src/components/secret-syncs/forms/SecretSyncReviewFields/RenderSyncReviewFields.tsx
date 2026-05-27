import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Badge, Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { RenderSyncScope } from "@app/hooks/api/secretSyncs/types/render-sync";

export const RenderSyncOptionsReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Render }>();

  const [{ autoRedeployServices }] = watch(["syncOptions"]);

  return (
    <Detail>
      <DetailLabel>Auto Redeploy Services</DetailLabel>
      <DetailValue>
        <Badge variant={autoRedeployServices ? "success" : "danger"}>
          {autoRedeployServices ? "Enabled" : "Disabled"}
        </Badge>
      </DetailValue>
    </Detail>
  );
};

export const RenderSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Render }>();
  const config = watch("destinationConfig");

  return (
    <>
      <Detail>
        <DetailLabel>Scope</DetailLabel>
        <DetailValue>{config.scope}</DetailValue>
      </Detail>
      {config.scope === RenderSyncScope.Service ? (
        <Detail>
          <DetailLabel>Service</DetailLabel>
          <DetailValue>{config.serviceName ?? config.serviceId}</DetailValue>
        </Detail>
      ) : (
        <Detail>
          <DetailLabel>Service</DetailLabel>
          <DetailValue>{config.environmentGroupName ?? config.environmentGroupId}</DetailValue>
        </Detail>
      )}
    </>
  );
};
