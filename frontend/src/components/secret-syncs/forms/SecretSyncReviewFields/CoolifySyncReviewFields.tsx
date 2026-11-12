import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Badge, Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const CoolifySyncOptionsReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Coolify }>();

  const syncOptions = watch("syncOptions");
  const autoRedeployServices = syncOptions?.autoRedeployServices;

  return (
    <Detail>
      <DetailLabel>Auto-Redeploy Services</DetailLabel>
      <DetailValue>
        <Badge variant={autoRedeployServices ? "success" : "danger"}>
          {autoRedeployServices ? "Enabled" : "Disabled"}
        </Badge>
      </DetailValue>
    </Detail>
  );
};

export const CoolifySyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Coolify }>();
  const config = watch("destinationConfig");

  return (
    <>
      {config?.projectName && (
        <Detail>
          <DetailLabel>Project</DetailLabel>
          <DetailValue>{config.projectName}</DetailValue>
        </Detail>
      )}
      {config?.environmentName && (
        <Detail>
          <DetailLabel>Environment</DetailLabel>
          <DetailValue>{config.environmentName}</DetailValue>
        </Detail>
      )}
      <Detail>
        <DetailLabel>Application</DetailLabel>
        <DetailValue>{config?.appName || config?.appId}</DetailValue>
      </Detail>
    </>
  );
};
