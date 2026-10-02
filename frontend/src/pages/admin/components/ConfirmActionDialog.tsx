import { type ReactNode, useState } from "react";

import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v3";

type Props = {
  isOpen?: boolean;
  onOpenChange: (isOpen: boolean) => void;
  confirmationKey: string;
  title: string;
  description?: string;
  onConfirm: () => Promise<void>;
  confirmLabel?: string;
  children?: ReactNode;
};

export const ConfirmActionDialog = ({
  isOpen,
  onOpenChange,
  confirmationKey,
  title,
  description = "This action is irreversible.",
  onConfirm,
  confirmLabel = "Delete",
  children
}: Props) => {
  const [isPending, setIsPending] = useState(false);

  const handleConfirm = async () => {
    setIsPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // The mutation cache reports request errors globally.
    } finally {
      setIsPending(false);
    }
  };

  return (
    <AlertDialog
      open={isOpen}
      confirmationValue={confirmationKey}
      onOpenChange={(open) => {
        if (isPending && !open) return;
        onOpenChange(open);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <Alert variant="danger" appearance="borderless">
              <AlertDescription>{description}</AlertDescription>
            </Alert>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogConfirmationField
          onConfirm={() => {
            handleConfirm().catch(() => undefined);
          }}
        />
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel isDisabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            isPending={isPending}
            onClick={(event) => {
              event.preventDefault();
              handleConfirm().catch(() => undefined);
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
