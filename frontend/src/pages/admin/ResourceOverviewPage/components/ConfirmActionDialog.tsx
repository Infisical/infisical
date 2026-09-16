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
  InputGroup,
  InputGroupInput
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
  const [confirmation, setConfirmation] = useState("");
  const [isPending, setIsPending] = useState(false);
  const confirmationInputId = useId();

  useLayoutEffect(() => setConfirmation(""), [confirmationKey, isOpen]);

  const handleConfirm = async () => {
    setIsPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
      setConfirmation("");
    } catch {
      // The mutation cache reports request errors globally.
    } finally {
      setIsPending(false);
    }
  };

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (isPending && !open) return;
        onOpenChange(open);
        if (!open) setConfirmation("");
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
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex flex-col gap-2 text-sm" htmlFor={confirmationInputId}>
            <span>
              Type <strong>{confirmationKey}</strong> to perform this action
            </span>
            <InputGroup>
              <InputGroupInput
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
            </InputGroup>
          </label>
          {children}
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isPending}>Cancel</AlertDialogCancel>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              isPending={isPending}
              isDisabled={confirmation !== confirmationKey}
            >
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
};
