import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Field,
  FieldLabel,
  Input
} from "@app/components/v3";

type Props = {
  isOpen: boolean;
  roleName: string;
  confirmationKey: string;
  isPending: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => Promise<void>;
};

export const DeleteProjectRoleDialog = ({
  isOpen,
  roleName,
  confirmationKey,
  isPending,
  onOpenChange,
  onConfirm
}: Props) => {
  const [confirmation, setConfirmation] = useState("");
  const isConfirmed = confirmation === confirmationKey;

  const handleOpenChange = (open: boolean) => {
    if (!open) setConfirmation("");
    onOpenChange(open);
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &quot;{roleName}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            This project role and its policies will be deleted. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field>
          <FieldLabel htmlFor="delete-project-role-confirmation">
            Type &quot;{confirmationKey}&quot; to confirm
          </FieldLabel>
          <Input
            id="delete-project-role-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            disabled={isPending}
          />
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel isDisabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            isDisabled={!isConfirmed}
            isPending={isPending}
            onClick={async (event) => {
              event.preventDefault();
              try {
                await onConfirm();
              } catch {
                // Mutation errors are surfaced globally and the dialog stays open for retry.
              }
            }}
          >
            Delete Role
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
