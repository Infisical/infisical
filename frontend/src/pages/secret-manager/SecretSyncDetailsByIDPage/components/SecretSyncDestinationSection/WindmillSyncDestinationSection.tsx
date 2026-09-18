import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TWindmillSync } from "@app/hooks/api/secretSyncs/types/windmill-sync";

type Props = {
  secretSync: TWindmillSync;
};

export const WindmillSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { path, workspace }
  } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Workspace</DetailLabel>
        <DetailValue>{workspace}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Path</DetailLabel>
        <DetailValue>{path}</DetailValue>
      </Detail>
    </>
  );
};
