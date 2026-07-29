import { ReactNode, useEffect, useState } from "react";

import { Button } from "../../generic/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../../generic/Dialog";
import { Field, FieldLabel } from "../../generic/Field";
import { Input } from "../../generic/Input";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmKey: string;
  confirmLabel?: string;
  isPending?: boolean;
  onConfirm: () => void;
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

  useEffect(() => {
    if (!isOpen) setTypedValue("");
  }, [isOpen]);

  const canConfirm = typedValue === confirmKey && !isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="delete-confirm-input">
            Type <span className="font-semibold text-foreground">{confirmKey}</span> to confirm
          </FieldLabel>
          <Input
            id="delete-confirm-input"
            autoComplete="off"
            value={typedValue}
            placeholder={`Type ${confirmKey} here`}
            onChange={(e) => setTypedValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canConfirm) onConfirm();
            }}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            isDisabled={!canConfirm}
            isPending={isPending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
