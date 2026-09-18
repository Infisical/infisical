import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
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
      <Detail>
        <DetailLabel>Configuration URL</DetailLabel>
        <DetailValue>{configurationUrl}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Label</DetailLabel>
        <DetailValue>{label}</DetailValue>
      </Detail>
    </>
  );
};
