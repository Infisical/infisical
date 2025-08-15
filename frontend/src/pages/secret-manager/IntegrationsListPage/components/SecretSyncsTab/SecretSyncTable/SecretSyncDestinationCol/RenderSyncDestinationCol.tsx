import {
  useRenderConnectionListEnvironmentGroups,
  useRenderConnectionListServices
} from "@app/hooks/api/appConnections/render";
import { RenderSyncScope, TRenderSync } from "@app/hooks/api/secretSyncs/types/render-sync";

import { getSecretSyncDestinationColValues } from "../helpers";
import { SecretSyncTableCell } from "../SecretSyncTableCell";

type Props = {
  secretSync: TRenderSync;
};

export const RenderSyncDestinationCol = ({ secretSync }: Props) => {
  const isServiceScope = secretSync.destinationConfig.scope === RenderSyncScope.Service;

  const { data: services = [], isPending } = useRenderConnectionListServices(
    secretSync.connectionId,
    {
      enabled: isServiceScope
    }
  );

  const { data: groups = [], isPending: isGroupsPending } =
    useRenderConnectionListEnvironmentGroups(secretSync.connectionId, { enabled: !isServiceScope });

  switch (secretSync.destinationConfig.scope) {
    case RenderSyncScope.Service: {
      const id = secretSync.destinationConfig.serviceId;
      const { primaryText, secondaryText } = getSecretSyncDestinationColValues({
        ...secretSync,
        destinationConfig: {
          ...secretSync.destinationConfig,
          serviceName: services.find((s) => s.id === id)?.name
        }
      });

      if (isPending) {
        return (
          <SecretSyncTableCell primaryText="Loading service info..." secondaryText="Service" />
        );
      }

      return <SecretSyncTableCell primaryText={primaryText} secondaryText={secondaryText} />;
    }
    case RenderSyncScope.EnvironmentGroup: {
      const id = secretSync.destinationConfig.environmentGroupId;
      const { primaryText, secondaryText } = getSecretSyncDestinationColValues({
        ...secretSync,
        destinationConfig: {
          ...secretSync.destinationConfig,
          environmentGroupName: groups.find((s) => s.id === id)?.name
        }
      });

      if (isGroupsPending) {
        return (
          <SecretSyncTableCell
            primaryText="Loading environment group info..."
            secondaryText="Environment Group"
          />
        );
      }

      return <SecretSyncTableCell primaryText={primaryText} secondaryText={secondaryText} />;
    }
    default:
      throw new Error("Unknown render sync destination scope");
  }
};
