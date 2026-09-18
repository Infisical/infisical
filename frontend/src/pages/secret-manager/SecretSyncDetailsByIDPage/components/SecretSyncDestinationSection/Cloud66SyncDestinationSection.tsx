import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TCloud66Sync } from "@app/hooks/api/secretSyncs/types/cloud-66-sync";

type Props = {
  secretSync: TCloud66Sync;
};

export const Cloud66SyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { stackId, stackName }
  } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Stack</DetailLabel>
        <DetailValue>{stackName}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Stack ID</DetailLabel>
        <DetailValue>{stackId}</DetailValue>
      </Detail>
    </>
  );
};
