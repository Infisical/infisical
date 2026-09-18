import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TDigitalOceanAppPlatformSync } from "@app/hooks/api/secretSyncs/types/digital-ocean-app-platform-sync";

type Props = {
  secretSync: TDigitalOceanAppPlatformSync;
};

export const DigitalOceanAppPlatformSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <Detail>
      <DetailLabel>App</DetailLabel>
      <DetailValue>{destinationConfig.appName}</DetailValue>
    </Detail>
  );
};
