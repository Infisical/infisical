import { useRef } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v3";

type Props = {
  /** The version to roll back to, or null while closed. */
  version: number | null;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: (version: number) => void;
};

// Radix focuses Cancel when an alert dialog opens, so an Enter meant for the Roll Back button underneath can't publish.
export const RollBackSkillAlertDialog = ({ version, onOpenChange, onConfirm }: Props) => {
  // Kept while the dialog animates closed, so its title doesn't lose the number.
  const shownRef = useRef(version);
  if (version !== null) shownRef.current = version;
  const shown = shownRef.current;

  return (
    <AlertDialog open={version !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Roll Back to v{shown}?</AlertDialogTitle>
          <AlertDialogDescription>
            This publishes a copy of v{shown} as the new latest version.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="av"
            onClick={() => {
              if (version !== null) onConfirm(version);
            }}
          >
            Roll Back
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
