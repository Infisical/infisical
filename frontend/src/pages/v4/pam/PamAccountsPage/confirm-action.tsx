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
} from "@infisical/cipher/ui/alert-dialog";

export const ConfirmAction = ({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  action,
  tone = "danger",
  onConfirm
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  action: string;
  tone?: "danger" | "neutral";
  onConfirm: () => Promise<boolean>;
}) => {
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent tone={tone} confirmText={confirmText} pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={tone === "danger" ? "destructive" : "primary"}
            loading={pending}
            onClick={async (event) => {
              event.preventDefault();
              setPending(true);
              try {
                if (await onConfirm()) onOpenChange(false);
              } finally {
                setPending(false);
              }
            }}
          >
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
