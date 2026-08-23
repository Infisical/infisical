import { useState } from "react";

import { SecretRotationV2ModalHeader } from "@app/components/secret-rotations-v2/SecretRotationV2ModalHeader";
import {
  DiscardChangesAlertDialog,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";

import { SecretRotationV2Form } from "./forms";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  secretRotation?: TSecretRotationV2;
};

export const EditSecretRotationV2Modal = ({ secretRotation, isOpen, onOpenChange }: Props) => {
  const [isDirty, setIsDirty] = useState(false);

  const closeSheet = () => {
    setIsDirty(false);
    onOpenChange(false);
  };

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: closeSheet });

  if (!secretRotation) return null;

  const handleSheetOpenChange = (open: boolean) => {
    if (!open) {
      requestDiscard();
      return;
    }
    onOpenChange(true);
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleSheetOpenChange}>
        <SheetContent className="flex h-full max-h-full w-full flex-col gap-y-0 p-0 sm:w-3/4 sm:max-w-[1500px]">
          <SheetHeader>
            <SheetTitle className="sr-only">Edit secret rotation</SheetTitle>
            <SecretRotationV2ModalHeader isConfigured type={secretRotation.type} />
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col">
            <SecretRotationV2Form
              onComplete={closeSheet}
              onCancel={closeSheet}
              onDirtyChange={setIsDirty}
              secretRotation={secretRotation}
              type={secretRotation.type}
              secretPath={secretRotation.folder.path}
              environment={secretRotation.environment.slug}
            />
          </div>
        </SheetContent>
      </Sheet>

      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Changes?"
        description="Your unsaved changes to this secret rotation will be lost."
      />
    </>
  );
};
