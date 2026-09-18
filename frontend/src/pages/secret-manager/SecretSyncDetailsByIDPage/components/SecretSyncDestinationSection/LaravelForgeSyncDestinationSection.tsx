import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TLaravelForgeSync } from "@app/hooks/api/secretSyncs/types/laravel-forge-sync";

type Props = {
  secretSync: TLaravelForgeSync;
};

export const LaravelForgeSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Account</DetailLabel>
        <DetailValue>{destinationConfig.orgName || destinationConfig.orgSlug}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Server</DetailLabel>
        <DetailValue>{destinationConfig.serverName || destinationConfig.serverId}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Site</DetailLabel>
        <DetailValue>{destinationConfig.siteName || destinationConfig.siteId}</DetailValue>
      </Detail>
    </>
  );
};
