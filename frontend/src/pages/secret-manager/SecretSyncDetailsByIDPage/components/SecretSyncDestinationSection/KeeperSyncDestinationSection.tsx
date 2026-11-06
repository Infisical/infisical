import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TKeeperSync } from "@app/hooks/api/secretSyncs/types/keeper-sync";

type Props = {
  secretSync: TKeeperSync;
};

export const KeeperSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { folderUid, folderName }
  } = secretSync;

  return (
    <>
      {folderName && (
        <Detail>
          <DetailLabel>Shared Folder</DetailLabel>
          <DetailValue>{folderName}</DetailValue>
        </Detail>
      )}
      <Detail>
        <DetailLabel>Shared Folder UID</DetailLabel>
        <DetailValue>{folderUid}</DetailValue>
      </Detail>
    </>
  );
};
