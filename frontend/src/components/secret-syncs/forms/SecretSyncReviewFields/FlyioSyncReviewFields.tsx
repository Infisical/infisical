import { useFormContext, useWatch } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { useFlyioConnectionListApps } from "@app/hooks/api/appConnections/flyio";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const FlyioSyncOptionsReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Flyio }>();

  const [{ autoRedeploy }] = watch(["syncOptions"]);

  return (
    <div>
      {autoRedeploy ? (
        <GenericFieldLabel label="Auto Redeploy">
          <Badge variant="success">Enabled</Badge>
        </GenericFieldLabel>
      ) : (
        <GenericFieldLabel label="Auto Redeploy">
          <Badge variant="danger">Disabled</Badge>
        </GenericFieldLabel>
      )}
    </div>
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

  return <GenericFieldLabel label="App">{displayName}</GenericFieldLabel>;
};
