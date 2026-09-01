import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TRundeckSync } from "@app/hooks/api/secretSyncs/types/rundeck-sync";

type Props = {
  secretSync: TRundeckSync;
};

export const RundeckSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Project</DetailLabel>
        <DetailValue>{destinationConfig.project}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Path</DetailLabel>
        <DetailValue>{destinationConfig.path}</DetailValue>
      </Detail>
    </>
  );
};
