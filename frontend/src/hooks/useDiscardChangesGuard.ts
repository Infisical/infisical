import { useCallback, useState } from "react";

type Props = {
  isDirty: boolean;
  onDiscard: () => void;
};

export const useDiscardChangesGuard = ({ isDirty, onDiscard }: Props) => {
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);

  const requestDiscard = useCallback(() => {
    if (isDirty) {
      setIsDiscardDialogOpen(true);
      return;
    }

    onDiscard();
  }, [isDirty, onDiscard]);

  const confirmDiscard = useCallback(() => {
    setIsDiscardDialogOpen(false);
    onDiscard();
  }, [onDiscard]);

  return {
    confirmDiscard,
    isDiscardDialogOpen,
    requestDiscard,
    setIsDiscardDialogOpen
  };
};
