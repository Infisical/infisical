import { ReactNode, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "../../generic/AlertDialog";
import { type ButtonProps } from "../../generic/Button";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmKey: string;
  confirmLabel?: string;
  confirmVariant?: ButtonProps["variant"];
  isPending?: boolean;
  onConfirm: () => void | Promise<void>;
  children?: ReactNode;
};

export const ConfirmationAlertDialog = ({
  isOpen,
  onOpenChange,
  isPending,
  onConfirm,
  ...contentProps
}: Props) => {
  const lastOpenContent = useRef(contentProps);
  if (isOpen) lastOpenContent.current = contentProps;
  const {
    title,
    description,
    confirmKey,
    confirmLabel = "Delete",
    confirmVariant = "danger",
    children
  } = isOpen ? contentProps : lastOpenContent.current;
  const [isConfirming, setIsConfirming] = useState(false);
  const isActionPending = Boolean(isPending || isConfirming);

  const handleConfirm = () => {
    if (isActionPending) return;

    setIsConfirming(true);
    Promise.resolve()
      .then(onConfirm)
      .catch(() => undefined)
      .finally(() => setIsConfirming(false));
  };

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={onOpenChange}
      confirmationValue={confirmKey}
      isPending={isActionPending}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription asChild>
              <div className="w-full">{description}</div>
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogConfirmationField onConfirm={handleConfirm} />
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={confirmVariant}
            onClick={(event) => {
              event.preventDefault();
              handleConfirm();
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
