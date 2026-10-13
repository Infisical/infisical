import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const KeeperSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Keeper }>();
  const [folderUid, folderName] = watch([
    "destinationConfig.folderUid",
    "destinationConfig.folderName"
  ]);

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
