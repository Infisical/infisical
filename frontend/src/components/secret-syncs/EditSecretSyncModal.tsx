import { useState } from "react";

import {
  DiscardChangesAlertDialog,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { TSecretSync } from "@app/hooks/api/secretSyncs";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";

import { EditSecretSyncForm } from "./forms";
import { SecretSyncModalHeader } from "./SecretSyncModalHeader";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  secretSync?: TSecretSync;
};

export const EditSecretSyncModal = ({ isOpen, secretSync, onOpenChange }: Props) => {
  const [isDirty, setIsDirty] = useState(false);

  const closeSheet = () => {
    setIsDirty(false);
    onOpenChange(false);
  };

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: closeSheet });

  if (!secretSync) return null;

  const handleSheetOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      requestDiscard();
      return;
    }
    onOpenChange(true);
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleSheetOpenChange}>
        <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-[1500px]">
          <SheetHeader className="border-b">
            <SheetTitle className="sr-only">Edit secret sync</SheetTitle>
            <SecretSyncModalHeader
              isConfigured
              destination={secretSync.destination}
              showDocLink={false}
            />
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col">
            <EditSecretSyncForm
              secretSync={secretSync}
              onComplete={closeSheet}
              onDirtyChange={setIsDirty}
              onCancel={() => handleSheetOpenChange(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Changes?"
        description="Your unsaved changes to this sync will be lost."
      />
    </>
  );
};
