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
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { ProjectPermissionActions } from "@app/context";
import { TAccessApprovalPolicy } from "@app/hooks/api/types";

import { RequestAccessForm } from "./RequestAccessForm";

export const RequestAccessModal = ({
  isOpen,
  onOpenChange,
  policies,
  ...props
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  policies: TAccessApprovalPolicy[];
  selectedActions?: ProjectPermissionActions[];
  secretPath?: string;
}) => {
  const [isDirty, setIsDirty] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const closeSheet = () => {
    setConfirmDiscardOpen(false);
    setIsDirty(false);
    onOpenChange(false);
  };

  const handleSheetOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isDirty) {
      setConfirmDiscardOpen(true);
      return;
    }
    if (!nextOpen) setIsDirty(false);
    onOpenChange(nextOpen);
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleSheetOpenChange}>
        <SheetContent className="flex h-full flex-col gap-y-0 overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="border-b">
            <SheetTitle>Request Access</SheetTitle>
            <SheetDescription>
              Request access to secrets, folders and other resources based on the predefined
              policies.
            </SheetDescription>
          </SheetHeader>
          <RequestAccessForm
            onClose={() => handleSheetOpenChange(false)}
            onSuccess={closeSheet}
            onDirtyChange={setIsDirty}
            policies={policies}
            {...props}
          />
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <AlertTriangleIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Discard access request?</AlertDialogTitle>
            <AlertDialogDescription>
              Your unsaved changes to this access request will be lost.
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
