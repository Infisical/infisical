import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { useTriggerDevConnectionListEnvironments } from "@app/hooks/api/appConnections/trigger-dev";
import { TTriggerDevSync } from "@app/hooks/api/secretSyncs/types/trigger-dev-sync";

const ENVIRONMENT_TYPE_LABELS: Record<string, string> = {
  DEVELOPMENT: "Development",
  STAGING: "Staging",
  PREVIEW: "Preview",
  PRODUCTION: "Production"
};

type Props = {
  secretSync: TTriggerDevSync;
};

export const TriggerDevSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    connection,
    destinationConfig: { projectRef, environment }
  } = secretSync;

  const { data: environments } = useTriggerDevConnectionListEnvironments(
    connection.id,
    projectRef,
    {
      enabled: Boolean(connection.id && projectRef)
    }
  );
  const environmentType = environments?.find((env) => env.slug === environment)?.type;
  const environmentLabel = environmentType
    ? (ENVIRONMENT_TYPE_LABELS[environmentType] ?? environment)
    : environment;

  return (
    <>
      <Detail>
        <DetailLabel>Project</DetailLabel>
        <DetailValue>{projectRef}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Environment</DetailLabel>
        <DetailValue className="capitalize">{environmentLabel}</DetailValue>
      </Detail>
    </>
  );
};
