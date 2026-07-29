import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useDeleteMe } from "@app/hooks/api";

const DELETE_CONFIRMATION = "delete my account";

export const DeleteAccountSection = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  const { mutateAsync: deleteUserMutateAsync, isPending } = useDeleteMe();

  const handleDeleteAccountSubmit = async () => {
    try {
      await deleteUserMutateAsync();

      createNotification({
        text: "Account deleted.",
        type: "success"
      });

      setIsOpen(false);
      navigate({ to: "/login" });
    } catch {
      createNotification({
        text: "Failed to delete account.",
        type: "error"
      });
    }
  };

  return (
    <>
      <Card className="border-danger/25">
        <CardHeader>
          <CardTitle>Delete Account</CardTitle>
          <CardDescription>
            Permanently delete your account and revoke its access to Infisical. This cannot be
            undone.
          </CardDescription>
          <CardAction>
            <Button variant="danger" onClick={() => setIsOpen(true)}>
              <Trash2Icon />
              Delete account
            </Button>
          </CardAction>
        </CardHeader>
      </Card>

      <AlertDialog
        open={isOpen}
        onOpenChange={(open) => {
          if (isPending) return;
          setIsOpen(open);
          if (!open) setConfirmation("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              Your account will permanently lose access to Infisical. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="delete-account-confirmation">
              Type <span className="font-mono">{DELETE_CONFIRMATION}</span> to continue
            </FieldLabel>
            <Input
              id="delete-account-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
            />
            <FieldDescription>This confirmation is case-sensitive.</FieldDescription>
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={isPending}
              isDisabled={confirmation !== DELETE_CONFIRMATION}
              onClick={(event) => {
                event.preventDefault();
                handleDeleteAccountSubmit();
              }}
            >
              Delete account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
