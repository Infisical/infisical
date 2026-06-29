import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { THasuraCloudSync } from "@app/hooks/api/secretSyncs/types/hasura-cloud-sync";

type Props = {
  secretSync: THasuraCloudSync;
};

export const HasuraCloudSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <Detail>
      <DetailLabel>Project</DetailLabel>
      <DetailValue>{destinationConfig.projectName}</DetailValue>
    </Detail>
  );
};
