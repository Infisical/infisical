import { useRenderConnectionListServices } from "@app/hooks/api/appConnections/render";
import { TRenderSync } from "@app/hooks/api/secretSyncs/render-sync";

import { getSecretSyncDestinationColValues } from "../helpers";
import { SecretSyncTableCell } from "../SecretSyncTableCell";

type Props = {
  secretSync: TRenderSync;
};

export const RenderSyncDestinationCol = ({ secretSync }: Props) => {
  const { data: services = [], isPending } = useRenderConnectionListServices(
    secretSync.connectionId
  );

  const { primaryText, secondaryText } = getSecretSyncDestinationColValues({
    ...secretSync,
    destinationConfig: {
      ...secretSync.destinationConfig,
      serviceName: services.find((s) => s.id === secretSync.destinationConfig.serviceId)?.name
    }
  });

  if (isPending) {
    return <SecretSyncTableCell primaryText="Loading service info..." secondaryText="Service" />;
  }

  return <SecretSyncTableCell primaryText={primaryText} secondaryText={secondaryText} />;
};
