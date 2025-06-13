import { GenericFieldLabel } from "@app/components/secret-syncs";
import { useRenderConnectionListServices } from "@app/hooks/api/appConnections/render";
import { TRenderSync } from "@app/hooks/api/secretSyncs/render-sync";

type Props = {
  secretSync: TRenderSync;
};

export const RenderSyncDestinationSection = ({ secretSync }: Props) => {
  const { data: services = [], isPending } = useRenderConnectionListServices(
    secretSync.connectionId
  );
  const {
    destinationConfig: { serviceId }
  } = secretSync;

  if (isPending) {
    return <GenericFieldLabel label="Service">Loading...</GenericFieldLabel>;
  }

  const serviceName = services.find((service) => service.id === serviceId)?.name;
  return <GenericFieldLabel label="Service">{serviceName ?? serviceId}</GenericFieldLabel>;
};
