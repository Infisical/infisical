import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TDigitalOceanAppPlatformSync } from "@app/hooks/api/secretSyncs/types/digital-ocean-app-platform-sync";

type Props = {
  secretSync: TDigitalOceanAppPlatformSync;
};

export const DigitalOceanAppPlatformSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return <GenericFieldLabel label="App">{destinationConfig.appName}</GenericFieldLabel>;
};
