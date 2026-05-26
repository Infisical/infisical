import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TNorthflankSync } from "@app/hooks/api/secretSyncs/types/northflank-sync";

type Props = {
  secretSync: TNorthflankSync;
};

export const NorthflankSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Project</DetailLabel>
        <DetailValue>{destinationConfig.projectName || destinationConfig.projectId}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Secret Group</DetailLabel>
        <DetailValue>
          {destinationConfig.secretGroupName || destinationConfig.secretGroupId}
        </DetailValue>
      </Detail>
    </>
  );
};
