import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TTriggerDevSync } from "@app/hooks/api/secretSyncs/types/trigger-dev-sync";

type Props = {
  secretSync: TTriggerDevSync;
};

export const TriggerDevSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { projectRef, environment }
  } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Project</DetailLabel>
        <DetailValue>{projectRef}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Environment</DetailLabel>
        <DetailValue className="capitalize">{environment}</DetailValue>
      </Detail>
    </>
  );
};
