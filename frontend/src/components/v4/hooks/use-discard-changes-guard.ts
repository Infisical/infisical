import * as React from "react";

export function useDiscardChangesGuard({
  isDirty,
  onDiscard
}: {
  isDirty: boolean;
  onDiscard: () => void;
}) {
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = React.useState(false);
  const requestDiscard = React.useCallback(() => {
    if (isDirty) {
      setIsDiscardDialogOpen(true);
      return;
    }
    onDiscard();
  }, [isDirty, onDiscard]);
  const confirmDiscard = React.useCallback(() => {
    setIsDiscardDialogOpen(false);
    onDiscard();
  }, [onDiscard]);
  return {
    confirmDiscard,
    isDiscardDialogOpen,
    requestDiscard,
    setIsDiscardDialogOpen,
    discardDialogProps: {
      open: isDiscardDialogOpen,
      onOpenChange: setIsDiscardDialogOpen,
      onDiscard: confirmDiscard
    }
  };
}
