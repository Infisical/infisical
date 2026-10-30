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

import { useAccess } from "../context";

export const AssumePrivilegesDialog = ({
  open,
  noun = "user",
  onOpenChange
}: {
  open: boolean;
  noun?: "user" | "machine identity";
  onOpenChange: (open: boolean) => void;
}) => {
  const { saved } = useAccess();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent tone="neutral" confirmText="assume">
        <AlertDialogHeader>
          <AlertDialogTitle>{`Assume privileges of this ${noun}`}</AlertDialogTitle>
          <AlertDialogDescription>
            {`This will set your privileges to those of the ${noun} for the next hour.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="primary"
            onClick={() => {
              onOpenChange(false);
              saved(
                `${noun === "user" ? "User" : "Machine identity"} privilege assumption has started`
              );
            }}
          >
            Assume privileges
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const RemoveMemberDialog = ({
  name,
  onOpenChange,
  onConfirm
}: {
  name?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) => (
  <AlertDialog open={Boolean(name)} onOpenChange={onOpenChange}>
    <AlertDialogContent tone="danger" confirmText="remove">
      <AlertDialogHeader>
        <AlertDialogTitle>{`Remove ${name ?? "this user"} from the project?`}</AlertDialogTitle>
        <AlertDialogDescription>
          This user will lose access granted by this membership. This cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onClick={onConfirm}>
          Remove user
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
