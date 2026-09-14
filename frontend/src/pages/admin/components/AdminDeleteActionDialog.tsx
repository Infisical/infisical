import { ReactNode, useId, useLayoutEffect, useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Field,
  FieldLabel,
  Input
} from "@app/components/v3";

type Props = {
  isOpen?: boolean;
  onClose?: () => void;
  onChange?: (isOpen: boolean) => void;
  confirmationKey: string;
  title: string;
  description?: string;
  onConfirm: () => Promise<void>;
  confirmButtonText?: string;
  formContent?: ReactNode;
  children?: ReactNode;
  confirmationMessage?: ReactNode;
  isDisabled?: boolean;
};

export const AdminDeleteActionDialog = ({
  isOpen,
  onClose,
  onChange,
  confirmationKey,
  onConfirm,
  title,
  description = "This action cannot be undone.",
  confirmButtonText = "Delete",
  formContent,
  confirmationMessage,
  isDisabled,
  children
}: Props) => {
  const [confirmation, setConfirmation] = useState("");
  const [isPending, setIsPending] = useState(false);
  const confirmationInputId = useId();

  useLayoutEffect(() => setConfirmation(""), [isOpen, confirmationKey]);

  const handleConfirm = async () => {
    setIsPending(true);
    try {
      await onConfirm();
      onChange?.(false);
      setConfirmation("");
      onClose?.();
    } finally {
      setIsPending(false);
    }
  };

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (isPending && !open) return;
        onChange?.(open);
        if (!open) {
          setConfirmation("");
          onClose?.();
        }
      }}
    >
      <AlertDialogContent>
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            handleConfirm().catch(() => undefined);
          }}
        >
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
          </AlertDialogHeader>
          {formContent}
          <Field>
            <FieldLabel htmlFor={confirmationInputId}>
              {confirmationMessage || (
                <span>
                  Type <strong>{confirmationKey}</strong> to confirm
                </span>
              )}
            </FieldLabel>
            <Input
              id={confirmationInputId}
              name={confirmationInputId}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={`Type ${confirmationKey} here`}
              autoComplete="new-password"
              data-1p-ignore
              data-lpignore="true"
              spellCheck={false}
            />
          </Field>
          {children}
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isPending}>Cancel</AlertDialogCancel>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              isPending={isPending}
              isDisabled={confirmation !== confirmationKey || isDisabled}
            >
              {confirmButtonText}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
};
