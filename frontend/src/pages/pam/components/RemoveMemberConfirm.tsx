import { AlertTriangle } from "lucide-react";

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
} from "@app/components/v3";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  memberName?: string;
  onConfirm: () => void;
};

export const RemoveMemberConfirm = ({ isOpen, onOpenChange, memberName, onConfirm }: Props) => (
  <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogMedia>
          <AlertTriangle />
        </AlertDialogMedia>
        <AlertDialogTitle>Remove access?</AlertDialogTitle>
        <AlertDialogDescription>
          {memberName ? (
            <>
              <span className="font-medium text-foreground">{memberName}</span> will lose this
              access.
            </>
          ) : (
            "This member will lose this access."
          )}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="danger" onClick={onConfirm}>
          Remove
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
