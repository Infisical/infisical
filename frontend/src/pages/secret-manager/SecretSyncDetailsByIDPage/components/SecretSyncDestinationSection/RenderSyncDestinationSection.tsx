import { GenericFieldLabel } from "@app/components/secret-syncs";
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
        return <GenericFieldLabel label="Service">Loading...</GenericFieldLabel>;
      }

      const serviceName = services.find((service) => service.id === id)?.name;
      return <GenericFieldLabel label="Service">{serviceName ?? id}</GenericFieldLabel>;
    }

    case RenderSyncScope.EnvironmentGroup: {
      const id = secretSync.destinationConfig.environmentGroupId;

      if (isGroupsPending) {
        return <GenericFieldLabel label="Environment Group">Loading...</GenericFieldLabel>;
      }

      const envName = groups.find((g) => g.id === id)?.name;
      return <GenericFieldLabel label="Environment Group">{envName ?? id}</GenericFieldLabel>;
    }
    default:
      throw new Error("Unknown render sync destination scope");
  }
};
