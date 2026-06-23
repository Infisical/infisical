import { useFormContext, useWatch } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Badge, Detail, DetailLabel, DetailValue } from "@app/components/v3";
import {
  useTriggerDevConnectionListEnvironments,
  useTriggerDevConnectionListProjects
} from "@app/hooks/api/appConnections/trigger-dev";
import { SecretSync } from "@app/hooks/api/secretSyncs";

const ENVIRONMENT_TYPE_LABELS: Record<string, string> = {
  DEVELOPMENT: "Development",
  STAGING: "Staging",
  PREVIEW: "Preview",
  PRODUCTION: "Production"
};

export const TriggerDevSyncOptionsReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.TriggerDev }>();

  const [{ markAsSecret }] = watch(["syncOptions"]);

  return (
    <Detail>
      <DetailLabel>Mark as Secret</DetailLabel>
      <DetailValue>
        <Badge variant={markAsSecret ? "success" : "danger"}>{markAsSecret ? "Yes" : "No"}</Badge>
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
  const { data: environments } = useTriggerDevConnectionListEnvironments(connectionId, projectRef, {
    enabled: Boolean(connectionId && projectRef)
  });
  const displayName = projects?.find((p) => p.id === projectRef)?.name ?? projectRef;
  const environmentType = environments?.find((env) => env.slug === environment)?.type;
  const environmentLabel = environmentType
    ? (ENVIRONMENT_TYPE_LABELS[environmentType] ?? environment)
    : environment;

  return (
    <>
      <Detail>
        <DetailLabel>Project</DetailLabel>
        <DetailValue>{displayName}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Environment</DetailLabel>
        <DetailValue className="capitalize">{environmentLabel}</DetailValue>
      </Detail>
    </>
  );
};
