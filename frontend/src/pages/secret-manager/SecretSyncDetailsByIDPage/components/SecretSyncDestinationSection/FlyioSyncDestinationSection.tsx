import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TFlyioSync } from "@app/hooks/api/secretSyncs/types/flyio-sync";

type Props = {
  secretSync: TFlyioSync;
};

export const FlyioSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { appId }
  } = secretSync;

  return <GenericFieldLabel label="App">{appId}</GenericFieldLabel>;
};
