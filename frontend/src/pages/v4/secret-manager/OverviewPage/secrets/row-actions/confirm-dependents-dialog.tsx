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

import type { Dependent } from "./references-dialog";

import styles from "./row-actions.module.css";

export function ConfirmDependentsDialog({
  open,
  dependents,
  pending,
  plural,
  onOpenChange,
  onConfirm
}: {
  open: boolean;
  dependents: Dependent[];
  pending?: boolean;
  plural?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent icon="alert" confirmText="confirm" pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {plural ? "Update these secrets?" : "Update this secret?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {plural
              ? "Other secrets reference them. Saving updates them everywhere they're referenced."
              : "Other secrets reference this one. Saving updates it everywhere it's referenced."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className={styles.dependentList}>
          {dependents.map((dependent) => (
            <li key={dependent.id}>
              <code>{dependent.name}</code>
              <span className={styles.muted}>{`${dependent.environment} ${dependent.path}`}</span>
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Save Changes</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
