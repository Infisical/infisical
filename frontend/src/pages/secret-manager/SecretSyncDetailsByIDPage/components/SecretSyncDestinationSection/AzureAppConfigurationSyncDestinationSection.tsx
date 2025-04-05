import { GenericFieldLabel } from "@app/components/secret-syncs";
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
      <GenericFieldLabel label="Configuration URL">{configurationUrl}</GenericFieldLabel>
      <GenericFieldLabel label="Label">{label}</GenericFieldLabel>
    </>
  );
};
