import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import {
  useRenderConnectionListEnvironmentGroups,
  useRenderConnectionListServices
} from "@app/hooks/api/appConnections/render";
import { RenderSyncScope, TRenderSync } from "@app/hooks/api/secretSyncs/types/render-sync";

type Props = {
  secretSync: TRenderSync;
};

export const RenderSyncDestinationSection = ({ secretSync }: Props) => {
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

      if (isPending) {
        return (
          <Detail>
            <DetailLabel>Service</DetailLabel>
            <DetailValue>Loading...</DetailValue>
          </Detail>
        );
      }

      const serviceName = services.find((service) => service.id === id)?.name;
      return (
        <Detail>
          <DetailLabel>Service</DetailLabel>
          <DetailValue>{serviceName ?? id}</DetailValue>
        </Detail>
      );
    }

    case RenderSyncScope.EnvironmentGroup: {
      const id = secretSync.destinationConfig.environmentGroupId;

      if (isGroupsPending) {
        return (
          <Detail>
            <DetailLabel>Environment Group</DetailLabel>
            <DetailValue>Loading...</DetailValue>
          </Detail>
        );
      }

      const envName = groups.find((g) => g.id === id)?.name;
      return (
        <Detail>
          <DetailLabel>Environment Group</DetailLabel>
          <DetailValue>{envName ?? id}</DetailValue>
        </Detail>
      );
    }
    default:
      throw new Error("Unknown render sync destination scope");
  }
};
