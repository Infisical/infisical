import { SecretSyncLabel } from "@app/components/secret-syncs";
import { TAzureAppConfigurationSync } from "@app/hooks/api/secretSyncs/types/azure-app-configuration-sync";

type Props = {
  secretSync: TAzureAppConfigurationSync;
};

export const AzureAppConfigurationSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { configurationUrl, label }
  } = secretSync;

  return (
    <>
      <SecretSyncLabel label="Configuration URL">{configurationUrl}</SecretSyncLabel>
      <SecretSyncLabel label="Label">{label}</SecretSyncLabel>
    </>
  );
};
