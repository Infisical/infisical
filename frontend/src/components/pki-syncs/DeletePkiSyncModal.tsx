import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { TPkiSync, useDeletePkiSync } from "@app/hooks/api/pkiSyncs";

type Props = {
  pkiSync?: TPkiSync;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onComplete?: () => void;
};

export const DeletePkiSyncModal = ({ isOpen, onOpenChange, pkiSync, onComplete }: Props) => {
  const deleteSync = useDeletePkiSync();

  if (!pkiSync) return null;

  const { id: syncId, name, destination, projectId } = pkiSync;

  const handleDeletePkiSync = async () => {
    const destinationName = PKI_SYNC_MAP[destination].name;

    try {
      await deleteSync.mutateAsync({
        syncId,
        projectId
      });

      createNotification({
        text: `Successfully deleted ${destinationName} PKI Sync`,
        type: "success"
      });

      if (onComplete) onComplete();
      onOpenChange(false);
    } catch (err) {
      console.error(err);

      createNotification({
        text: `Failed to delete ${destinationName} PKI Sync`,
        type: "error"
      });
    }
  };

  return (
    <DeleteActionModal
      isOpen={isOpen}
      onChange={onOpenChange}
      title={`Are you sure you want to delete ${name}?`}
      deleteKey={name}
      onDeleteApproved={handleDeletePkiSync}
    >
      <p className="mt-4 text-sm text-bunker-300">
        This action will also remove all certificates that were synced by this configuration from
        the {PKI_SYNC_MAP[destination].name} destination.
      </p>
    </DeleteActionModal>
  );
};
