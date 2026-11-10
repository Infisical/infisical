import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Label } from "@app/components/v4/ui/label";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { RadioGroup, RadioGroupItem } from "@app/components/v4/ui/radio-group";
import { PAM_PRODUCT_ROLE_OPTIONS } from "@app/helpers/roles";

import { failed, saved } from "../../toast";
import { Muted } from "../../ui";

export const ProductRoleField = ({
  id,
  value,
  onChange,
  disabled
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) => (
  <RadioGroup aria-label="Product role" value={value} onValueChange={onChange} disabled={disabled}>
    {PAM_PRODUCT_ROLE_OPTIONS.map((option) => (
      <Inline key={option.value} gap={12} align="start">
        <RadioGroupItem id={`${id}-${option.value}`} value={option.value} />
        <Stack gap={4}>
          <Label htmlFor={`${id}-${option.value}`}>{option.label}</Label>
          <Muted>{option.description}</Muted>
        </Stack>
      </Inline>
    ))}
  </RadioGroup>
);

export const ProductRoleDialog = ({
  open,
  onOpenChange,
  name,
  currentRole,
  onSave,
  successMessage,
  failureMessage
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  currentRole: string;
  onSave: (role: string) => Promise<unknown>;
  successMessage: string;
  failureMessage: string;
}) => {
  const [role, setRole] = useState(currentRole);
  const [pending, setPending] = useState(false);

  const save = async () => {
    setPending(true);
    try {
      await onSave(role);
      saved(successMessage);
      onOpenChange(false);
    } catch (error) {
      failed(failureMessage, error);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>{`Edit product role for ${name}`}</DialogTitle>
        </DialogHeader>
        <ProductRoleField id="pam-edit-role" value={role} onChange={setRole} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={role === currentRole}
            onClick={save}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const ProductRemoveDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  actionLabel,
  onConfirm
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText: string;
  actionLabel: string;
  onConfirm: () => void;
}) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent tone="danger" confirmText={confirmText}>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onClick={onConfirm}>
          {actionLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
