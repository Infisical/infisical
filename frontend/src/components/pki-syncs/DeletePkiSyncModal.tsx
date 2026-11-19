import { createNotification } from "@app/components/notifications";
import { ConfirmationAlertDialog } from "@app/components/v3";
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
  const destinationName = PKI_SYNC_MAP[destination].name;

  const handleDeletePkiSync = async () => {
    await deleteSync.mutateAsync({
      syncId,
      projectId,
      destination
    });

    createNotification({
      text: `Successfully deleted ${destinationName} Certificate Sync`,
      type: "success"
    });

    onComplete?.();
    onOpenChange(false);
  };

  return (
    <ConfirmationAlertDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Delete "${name}"`}
      description={`This permanently deletes the ${destinationName} certificate sync. This cannot be undone.`}
      confirmKey={name}
      isPending={deleteSync.isPending}
      onConfirm={handleDeletePkiSync}
    />
  );
};
