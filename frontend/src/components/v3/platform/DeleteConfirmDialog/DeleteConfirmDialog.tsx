import { FormEvent, ReactNode, useEffect, useId, useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogConfirmationLabel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "../../generic/AlertDialog";
import { Button } from "../../generic/Button";
import { Field } from "../../generic/Field";
import { Input } from "../../generic/Input";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmKey: string;
  confirmLabel?: string;
  isPending?: boolean;
  onConfirm: () => void | Promise<void>;
};

export const DeleteConfirmDialog = ({
  isOpen,
  onOpenChange,
  title,
  description,
  confirmKey,
  confirmLabel = "Delete",
  isPending,
  onConfirm
}: Props) => {
  const [typedValue, setTypedValue] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const confirmationInputId = useId();
  const isActionPending = Boolean(isPending || isConfirming);

  useEffect(() => {
    setTypedValue("");
  }, [confirmKey, isOpen]);

  const canConfirm = Boolean(confirmKey) && typedValue === confirmKey && !isActionPending;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canConfirm) return;

    setIsConfirming(true);
    Promise.resolve()
      .then(onConfirm)
      .catch(() => undefined)
      .finally(() => setIsConfirming(false));
  };

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && isActionPending) return;
        onOpenChange(open);
      }}
    >
      <AlertDialogContent>
        <form className="contents" onSubmit={handleSubmit}>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {description ? (
              <AlertDialogDescription asChild>
                <div className="w-full">{description}</div>
              </AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogConfirmationField>
            <Field>
              <AlertDialogConfirmationLabel
                htmlFor={confirmationInputId}
                confirmationValue={confirmKey}
              />
              <Input
                id={confirmationInputId}
                autoComplete="off"
                autoFocus
                disabled={isActionPending}
                placeholder={confirmKey}
                spellCheck={false}
                value={typedValue}
                onChange={(event) => setTypedValue(event.target.value)}
              />
            </Field>
          </AlertDialogConfirmationField>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isActionPending}>Cancel</AlertDialogCancel>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              isDisabled={!canConfirm}
              isPending={isActionPending}
            >
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
};
