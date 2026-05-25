import { useState } from "react";
import { AlertTriangleIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { TSecretSync } from "@app/hooks/api/secretSyncs";

import { EditSecretSyncForm } from "./forms";
import { SecretSyncModalHeader } from "./SecretSyncModalHeader";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  secretSync?: TSecretSync;
};

export const EditSecretSyncModal = ({ isOpen, secretSync, onOpenChange }: Props) => {
  const [isDirty, setIsDirty] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  if (!secretSync) return null;

  const closeSheet = () => {
    setConfirmDiscardOpen(false);
    onOpenChange(false);
  };

  const handleSheetOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isDirty) {
      setConfirmDiscardOpen(true);
      return;
    }
    onOpenChange(nextOpen);
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleSheetOpenChange}>
        <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-[1500px]">
          <SheetHeader className="border-b">
            <SheetTitle>
              <SecretSyncModalHeader isConfigured destination={secretSync.destination} />
            </SheetTitle>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col">
            <EditSecretSyncForm
              secretSync={secretSync}
              onComplete={() => onOpenChange(false)}
              onDirtyChange={setIsDirty}
            />
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <AlertTriangleIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your unsaved changes to this sync will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={closeSheet}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
