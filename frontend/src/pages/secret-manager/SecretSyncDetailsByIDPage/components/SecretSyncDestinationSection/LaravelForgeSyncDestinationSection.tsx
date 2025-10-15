import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TLaravelForgeSync } from "@app/hooks/api/secretSyncs/types/laravel-forge-sync";

type Props = {
  secretSync: TLaravelForgeSync;
};

export const LaravelForgeSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <GenericFieldLabel label="Account">
        {destinationConfig.orgName || destinationConfig.orgSlug}
      </GenericFieldLabel>
      <GenericFieldLabel label="Server">
        {destinationConfig.serverName || destinationConfig.serverId}
      </GenericFieldLabel>
      <GenericFieldLabel label="Site">
        {destinationConfig.siteName || destinationConfig.siteId}
      </GenericFieldLabel>
    </>
  );
};
