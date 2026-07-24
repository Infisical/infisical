import { useState } from "react";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Input
} from "@app/components/v3";
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
  const [confirmation, setConfirmation] = useState("");

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
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) setConfirmation("");
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the PKI sync. Type {name} to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          aria-label={`Type ${name} to confirm deletion`}
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder={name}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            isDisabled={confirmation !== name}
            isPending={deleteSync.isPending}
            onClick={handleDeletePkiSync}
          >
            Delete PKI Sync
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
