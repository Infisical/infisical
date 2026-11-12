import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TCoolifySync } from "@app/hooks/api/secretSyncs/types/coolify-sync";

type Props = {
  secretSync: TCoolifySync;
};

export const CoolifySyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      {destinationConfig?.projectName && (
        <Detail>
          <DetailLabel>Project</DetailLabel>
          <DetailValue>{destinationConfig.projectName}</DetailValue>
        </Detail>
      )}
      {destinationConfig?.environmentName && (
        <Detail>
          <DetailLabel>Environment</DetailLabel>
          <DetailValue>{destinationConfig.environmentName}</DetailValue>
        </Detail>
      )}
      <Detail>
        <DetailLabel>Application</DetailLabel>
        <DetailValue>{destinationConfig?.appName || destinationConfig?.appId}</DetailValue>
      </Detail>
      {destinationConfig?.appName && (
        <Detail>
          <DetailLabel>Application ID</DetailLabel>
          <DetailValue>{destinationConfig.appId}</DetailValue>
        </Detail>
      )}
    </>
  );
};
