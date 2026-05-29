import { useFormContext, useWatch } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Badge, Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { useFlyioConnectionListApps } from "@app/hooks/api/appConnections/flyio";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const FlyioSyncOptionsReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Flyio }>();

  const [{ autoRedeploy }] = watch(["syncOptions"]);

  return (
    <Detail>
      <DetailLabel>Auto Redeploy</DetailLabel>
      <DetailValue>
        <Badge variant={autoRedeploy ? "success" : "danger"}>
          {autoRedeploy ? "Enabled" : "Disabled"}
        </Badge>
      </DetailValue>
    </Detail>
  );
};

export const FlyioSyncReviewFields = () => {
  const { control, watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Flyio }>();
  const appId = watch("destinationConfig.appId");
  const connectionId = useWatch({ name: "connection.id", control });
  const { data: apps } = useFlyioConnectionListApps(connectionId, {
    enabled: Boolean(connectionId)
  });
  const displayName = apps?.find((a) => a.id === appId)?.name ?? appId;

  return (
    <Detail>
      <DetailLabel>App</DetailLabel>
      <DetailValue>{displayName}</DetailValue>
    </Detail>
  );
};
