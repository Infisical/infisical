import { useFormContext, useWatch } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import {
  usePortainerConnectionListEnvironments,
  usePortainerConnectionListStacks
} from "@app/hooks/api/appConnections/portainer";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const PortainerSyncReviewFields = () => {
  const { control, watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Portainer }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const environmentId = watch("destinationConfig.environmentId");
  const stackId = watch("destinationConfig.stackId");

  const { data: environments = [] } = usePortainerConnectionListEnvironments(connectionId, {
    enabled: Boolean(connectionId)
  });
  const { data: stacks = [] } = usePortainerConnectionListStacks(connectionId, {
    enabled: Boolean(connectionId)
  });

  const environmentName = environments.find((env) => env.id === environmentId)?.name;
  const stackName = stacks.find((stack) => stack.id === stackId)?.name;

  return (
    <>
      <Detail>
        <DetailLabel>Environment</DetailLabel>
        <DetailValue>{environmentName ?? environmentId}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Stack</DetailLabel>
        <DetailValue>{stackName ?? stackId}</DetailValue>
      </Detail>
    </>
  );
};
