import { ReactNode, useState } from "react";

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
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmationText: string;
  actionLabel: string;
  onConfirm: () => Promise<void>;
  isDisabled?: boolean;
  descriptionAsAlert?: boolean;
};

export const IdentityActionConfirmationDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmationText,
  actionLabel,
  onConfirm,
  isDisabled,
  descriptionAsAlert = false
}: Props) => {
  const [isPending, setIsPending] = useState(false);

  const handleConfirm = async () => {
    if (isPending || isDisabled) return;

    setIsPending(true);
    try {
      await onConfirm();
    } catch {
      // Mutation errors are surfaced by the shared query mutation handler. Keep the dialog open so
      // the user can retry without re-entering the confirmation text.
    } finally {
      setIsPending(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      confirmationValue={confirmationText}
      onOpenChange={(nextOpen) => {
        if (!isPending) onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {descriptionAsAlert ? (
            <AlertDialogDescription asChild>
              <Alert variant="warning" appearance="borderless">
                <AlertDescription>{description}</AlertDescription>
              </Alert>
            </AlertDialogDescription>
          ) : (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogConfirmationField onConfirm={() => handleConfirm().catch(() => undefined)} />
        <AlertDialogFooter>
          <AlertDialogCancel isDisabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant="danger"
            isPending={isPending}
            isDisabled={isDisabled}
            onClick={(event) => {
              event.preventDefault();
              handleConfirm().catch(() => undefined);
            }}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
