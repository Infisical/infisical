import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TExternalInfisicalSync } from "@app/hooks/api/secretSyncs/types/external-infisical-sync";

type Props = {
  secretSync: TExternalInfisicalSync;
};

export const ExternalInfisicalSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Project ID</DetailLabel>
        <DetailValue>{destinationConfig.projectId}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Environment</DetailLabel>
        <DetailValue>{destinationConfig.environment}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Secret Path</DetailLabel>
        <DetailValue>{destinationConfig.secretPath}</DetailValue>
      </Detail>
    </>
  );
};
