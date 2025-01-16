import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { TSecretSync, useDeleteSecretSync } from "@app/hooks/api/secretSyncs";

type Props = {
  secretSync?: TSecretSync;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onComplete?: () => void;
};

export const DeleteSecretSyncModal = ({ isOpen, onOpenChange, secretSync, onComplete }: Props) => {
  const deleteSync = useDeleteSecretSync();

  if (!secretSync) return null;

  const { id: syncId, name, destination } = secretSync;

  const handleDeleteSecretSync = async () => {
    const destinationName = SECRET_SYNC_MAP[destination].name;

    try {
      await deleteSync.mutateAsync({
        syncId,
        destination
      });

      createNotification({
        text: `Successfully removed ${destinationName} Sync`,
        type: "success"
      });

      if (onComplete) onComplete();
      onOpenChange(false);
    } catch (err) {
      console.error(err);

      createNotification({
        text: `Failed remove ${destinationName} Sync`,
        type: "error"
      });
    }
  };

  return (
    <DeleteActionModal
      isOpen={isOpen}
      onChange={onOpenChange}
      title={`Are you sure want to delete ${name}?`}
      deleteKey={name}
      onDeleteApproved={handleDeleteSecretSync}
    />
  );
};
