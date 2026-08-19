import { useCallback, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";

type Props = {
  isDirty: boolean;
  onDiscard: () => void;
  blockNavigation?: boolean;
};

export const useDiscardChangesGuard = ({ isDirty, onDiscard, blockNavigation = false }: Props) => {
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);
  // AlertDialogAction closes the dialog after onClick, which fires onOpenChange(false).
  // Skip blocker.reset() in that case so a proceeded navigation is not cancelled.
  const isConfirmingDiscard = useRef(false);

  const shouldBlockFn = useCallback(() => isDirty, [isDirty]);

  const blocker = useBlocker({
    shouldBlockFn,
    withResolver: true as const,
    enableBeforeUnload: isDirty,
    disabled: !blockNavigation
  });

  const requestDiscard = useCallback(() => {
    if (isDirty) {
      setIsDiscardDialogOpen(true);
      return;
    }

    onDiscard();
  }, [isDirty, onDiscard]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsDiscardDialogOpen(open);
      if (open) return;

      if (isConfirmingDiscard.current) {
        isConfirmingDiscard.current = false;
        return;
      }

      blocker.reset?.();
    },
    [blocker.reset]
  );

  const confirmDiscard = useCallback(() => {
    isConfirmingDiscard.current = true;
    setIsDiscardDialogOpen(false);
    onDiscard();
    blocker.proceed?.();
  }, [onDiscard, blocker.proceed]);

  return {
    confirmDiscard,
    isDiscardDialogOpen: isDiscardDialogOpen || blocker.status === "blocked",
    requestDiscard,
    setIsDiscardDialogOpen: handleOpenChange
  };
};
