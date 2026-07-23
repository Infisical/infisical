import { useEffect, useState } from "react";

import { Button } from "@app/components/v3/generic/Button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v3/generic/Dialog";
import { Field, FieldContent, FieldLabel } from "@app/components/v3/generic/Field";
import { Input } from "@app/components/v3/generic/Input";
import { PamAccountType, usePamAccountTypeMap } from "@app/hooks/api/pam";

type Props = {
  isOpen: boolean;
  accountName: string;
  accountType?: PamAccountType;
  isLoading: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export const DeleteAccountModal = ({
  isOpen,
  accountName,
  accountType,
  isLoading,
  onConfirm,
  onOpenChange
}: Props) => {
  const { map } = usePamAccountTypeMap();
  const typeName = accountType ? map[accountType]?.name : "";

  const [confirmInput, setConfirmInput] = useState("");
  const canDelete = confirmInput === accountName && accountName.length > 0;

  useEffect(() => {
    setConfirmInput("");
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Delete Account</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canDelete && !isLoading) onConfirm();
          }}
        >
          <p className="text-sm text-muted">
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">{accountName}</span>
            {typeName ? ` (${typeName})` : ""}? This action cannot be undone.
          </p>
          <Field>
            <FieldLabel>
              Type <span className="font-medium text-foreground">{accountName}</span> to confirm
            </FieldLabel>
            <FieldContent>
              <Input
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder={accountName}
              />
            </FieldContent>
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" isPending={isLoading} isDisabled={!canDelete}>
              Delete
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
