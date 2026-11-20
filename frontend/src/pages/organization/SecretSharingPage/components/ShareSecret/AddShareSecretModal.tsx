import { useCallback, useState } from "react";

import {
  DiscardChangesAlertDialog,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { ShareSecretForm } from "@app/pages/public/ShareSecretPage/components";

type Props = {
  popUp: UsePopUpState<["createSharedSecret"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["createSharedSecret"]>,
    state?: boolean
  ) => void;
};

export const AddShareSecretModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentOrg } = useOrganization();
  const [isDirty, setIsDirty] = useState(false);

  const closeSheet = useCallback(() => {
    setIsDirty(false);
    handlePopUpToggle("createSharedSecret", false);
  }, [handlePopUpToggle]);

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: closeSheet });

  return (
    <>
      <Sheet
        open={popUp?.createSharedSecret?.isOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            requestDiscard();
            return;
          }
          handlePopUpToggle("createSharedSecret", true);
        }}
      >
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Share a Secret</SheetTitle>
            <SheetDescription>
              Create an encrypted link with controls for access, expiration, and delivery.
            </SheetDescription>
          </SheetHeader>
          <ShareSecretForm
            isPublic={false}
            value={(popUp.createSharedSecret.data as { value?: string })?.value}
            secretKey={(popUp.createSharedSecret.data as { name?: string })?.name}
            allowSecretSharingOutsideOrganization={
              currentOrg?.allowSecretSharingOutsideOrganization ?? true
            }
            maxSharedSecretLifetime={currentOrg?.maxSharedSecretLifetime}
            maxSharedSecretViewLimit={currentOrg?.maxSharedSecretViewLimit}
            onCancel={requestDiscard}
            onDirtyChange={setIsDirty}
          />
        </SheetContent>
      </Sheet>

      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Secret?"
        description="The secret and options you entered will be lost."
      />
    </>
  );
};
