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

    await deleteSync.mutateAsync({
      syncId,
      projectId,
      destination
    });

    createNotification({
      text: `Successfully deleted ${destinationName} PKI Sync`,
      type: "success"
    });

    if (onComplete) onComplete();
    onOpenChange(false);
  };

  return (
    <DeleteActionModal
      isOpen={isOpen}
      onChange={onOpenChange}
      title={`Are you sure you want to delete ${name}?`}
      deleteKey={name}
      onDeleteApproved={handleDeletePkiSync}
    />
  );
};
