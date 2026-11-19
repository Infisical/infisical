import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import {
  usePortainerConnectionListEnvironments,
  usePortainerConnectionListStacks
} from "@app/hooks/api/appConnections/portainer";
import { TPortainerSync } from "@app/hooks/api/secretSyncs/types/portainer-sync";

type Props = {
  secretSync: TPortainerSync;
};

export const PortainerSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig, connection } = secretSync;

  const { data: environments = [] } = usePortainerConnectionListEnvironments(connection.id, {
    enabled: Boolean(connection.id)
  });
  const { data: stacks = [] } = usePortainerConnectionListStacks(connection.id, {
    enabled: Boolean(connection.id)
  });

  const environmentName = environments.find(
    (env) => env.id === destinationConfig.environmentId
  )?.name;
  const stackName = stacks.find((stack) => stack.id === destinationConfig.stackId)?.name;

  return (
    <>
      <Detail>
        <DetailLabel>Environment</DetailLabel>
        <DetailValue>{environmentName ?? destinationConfig.environmentId}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Stack</DetailLabel>
        <DetailValue>{stackName ?? destinationConfig.stackId}</DetailValue>
      </Detail>
    </>
  );
};
