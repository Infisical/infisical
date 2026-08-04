"use client";

import { useCallback, useRef, useState } from "react";
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
} from "../AlertDialog";

type UseUnsavedChangesGuardOptions = {
  isDirty: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Compose with a controlled Sheet/Dialog: intercept dismissals while dirty and
 * confirm via {@link DiscardChangesAlert}. Keep the overlay primitive itself dumb.
 */
export function useUnsavedChangesGuard({ isDirty, onOpenChange }: UseUnsavedChangesGuardOptions) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const runWithConfirm = useCallback(
    (action: () => void) => {
      if (!isDirty) {
        action();
        return;
      }
      pendingActionRef.current = action;
      setConfirmOpen(true);
    },
    [isDirty]
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        runWithConfirm(() => onOpenChange(false));
        return;
      }
      onOpenChange(true);
    },
    [onOpenChange, runWithConfirm]
  );

  const requestClose = useCallback(() => {
    runWithConfirm(() => onOpenChange(false));
  }, [onOpenChange, runWithConfirm]);

  const handleConfirmOpenChange = useCallback((open: boolean) => {
    setConfirmOpen(open);
    if (!open) pendingActionRef.current = null;
  }, []);

  const discard = useCallback(() => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    setConfirmOpen(false);
    action?.();
  }, []);

  return {
    onOpenChange: handleOpenChange,
    requestClose,
    confirmIfDirty: runWithConfirm,
    discardAlertProps: {
      open: confirmOpen,
      onOpenChange: handleConfirmOpenChange,
      onDiscard: discard
    }
  };
}

type DiscardChangesAlertProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
  title?: string;
  description?: string;
  keepLabel?: string;
  discardLabel?: string;
};

export function DiscardChangesAlert({
  open,
  onOpenChange,
  onDiscard,
  title = "Discard changes?",
  description = "Your unsaved changes will be lost.",
  keepLabel = "Keep Editing",
  discardLabel = "Discard"
}: DiscardChangesAlertProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <AlertTriangleIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{keepLabel}</AlertDialogCancel>
          <AlertDialogAction variant="danger" onClick={onDiscard}>
            {discardLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
