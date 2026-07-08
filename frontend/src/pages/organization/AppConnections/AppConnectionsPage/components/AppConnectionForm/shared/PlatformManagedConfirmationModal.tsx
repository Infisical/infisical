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
  AlertDialogTitle
} from "@app/components/v3";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => void;
};

export const PlatformManagedConfirmationModal = ({ isOpen, onOpenChange, onConfirm }: Props) => {
  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className="z-[80]" overlayClassName="z-[80]">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <AlertTriangleIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Platform Managed Credentials</AlertDialogTitle>
          <AlertDialogDescription>
            Once created, Infisical will update the password of this connection and you will no
            longer be able to access it. Are you sure you want Infisical to manage the credentials
            of this connection?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="warning" onClick={onConfirm}>
            Grant Infisical Ownership
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
