import { useState } from "react";

import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useTimedReset } from "@app/hooks";
import { UsePopUpState } from "@app/hooks/usePopUp";
import type { SharedSecretResultActions } from "@app/pages/public/ShareSecretPage/components";
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
  const [resultActions, setResultActions] = useState<SharedSecretResultActions | null>(null);
  const [, isCopyingLink, setCopyingLink] = useTimedReset<string>({
    initialState: "Copy shared link"
  });

  return (
    <Sheet
      open={popUp?.createSharedSecret?.isOpen}
      onOpenChange={(isOpen) => {
        if (!isOpen) setResultActions(null);
        handlePopUpToggle("createSharedSecret", isOpen);
      }}
    >
      <SheetContent className="flex h-full max-h-full flex-col gap-0 sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle>Share a Secret</SheetTitle>
          <SheetDescription>Securely share one off secrets with your team.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <ShareSecretForm
            isPublic={false}
            value={(popUp.createSharedSecret.data as { value?: string })?.value}
            allowSecretSharingOutsideOrganization={
              currentOrg?.allowSecretSharingOutsideOrganization ?? true
            }
            maxSharedSecretLifetime={currentOrg?.maxSharedSecretLifetime}
            maxSharedSecretViewLimit={currentOrg?.maxSharedSecretViewLimit}
            onResultActionsChange={setResultActions}
          />
        </div>
        {resultActions && (
          <SheetFooter className="flex-col border-t sm:flex-row">
            <Button
              className="w-full sm:flex-1"
              variant="project"
              size="lg"
              onClick={resultActions.createMore}
            >
              Create more
            </Button>
            {resultActions.hasLink && resultActions.copyLink && (
              <Button
                className="w-full sm:flex-1"
                variant="outline"
                size="lg"
                onClick={() => {
                  resultActions.copyLink?.();
                  setCopyingLink("Copied");
                }}
              >
                {isCopyingLink ? "Copied" : "Copy shared link"}
              </Button>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
};
