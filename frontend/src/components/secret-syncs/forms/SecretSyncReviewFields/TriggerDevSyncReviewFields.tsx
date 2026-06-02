import { useFormContext, useWatch } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Badge, Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { useTriggerDevConnectionListProjects } from "@app/hooks/api/appConnections/trigger-dev";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const TriggerDevSyncOptionsReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.TriggerDev }>();

  const [{ secret }] = watch(["syncOptions"]);

  return (
    <Detail>
      <DetailLabel>Mark as Secret</DetailLabel>
      <DetailValue>
        <Badge variant={secret ? "success" : "danger"}>{secret ? "Yes" : "No"}</Badge>
      </DetailValue>
    </Detail>
  );
};

export const TriggerDevSyncReviewFields = () => {
  const { control, watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.TriggerDev }
  >();
  const projectRef = watch("destinationConfig.projectRef");
  const environment = watch("destinationConfig.environment");
  const connectionId = useWatch({ name: "connection.id", control });
  const { data: projects } = useTriggerDevConnectionListProjects(connectionId, {
    enabled: Boolean(connectionId)
  });
  const displayName = projects?.find((p) => p.id === projectRef)?.name ?? projectRef;

  return (
    <>
      <Detail>
        <DetailLabel>Project</DetailLabel>
        <DetailValue>{displayName}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Environment</DetailLabel>
        <DetailValue className="capitalize">{environment}</DetailValue>
      </Detail>
    </>
  );
};
