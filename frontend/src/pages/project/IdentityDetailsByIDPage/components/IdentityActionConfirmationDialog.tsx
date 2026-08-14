import { FormEvent, ReactNode, useEffect, useId, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Field,
  FieldLabel,
  Input
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
};

export const IdentityActionConfirmationDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmationText,
  actionLabel,
  onConfirm,
  isDisabled
}: Props) => {
  const inputId = useId();
  const [confirmation, setConfirmation] = useState("");
  const [isPending, setIsPending] = useState(false);
  const isConfirmed = confirmation === confirmationText;

  useEffect(() => {
    if (!open) setConfirmation("");
  }, [open]);

  const handleConfirm = async () => {
    if (!isConfirmed || isPending || isDisabled) return;

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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handleConfirm().catch(() => undefined);
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isPending) onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <form onSubmit={handleSubmit}>
          <AlertDialogConfirmationField>
            <Field>
              <FieldLabel htmlFor={inputId}>
                Type &quot;{confirmationText}&quot; to confirm
              </FieldLabel>
              <Input
                id={inputId}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                autoFocus
              />
            </Field>
          </AlertDialogConfirmationField>
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel isDisabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant="danger"
            isPending={isPending}
            isDisabled={!isConfirmed || isDisabled}
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
