import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ConfirmationAlertDialog
} from "@app/components/v3";
import { useDeleteMe } from "@app/hooks/api";

const DELETE_CONFIRMATION = "delete my account";

export const DeleteAccountSection = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

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
      <Card className="gap-0 overflow-hidden border-danger/25 p-0">
        <CardHeader className="p-6">
          <CardTitle className="font-alliance">Delete Account</CardTitle>
          <CardDescription>
            Permanently delete your account and revoke its access to Infisical. This cannot be
            undone.
          </CardDescription>
        </CardHeader>
        <CardFooter className="min-h-8 justify-end border-t border-danger/15 bg-danger/5 p-4">
          <Button variant="danger" size="sm" onClick={() => setIsOpen(true)}>
            <Trash2Icon />
            Delete account
          </Button>
        </CardFooter>
      </Card>

      <ConfirmationAlertDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title="Delete your account?"
        description="Your account will permanently lose access to Infisical. This cannot be undone."
        confirmKey={DELETE_CONFIRMATION}
        confirmLabel="Delete account"
        isPending={isPending}
        onConfirm={handleDeleteAccountSubmit}
      />
    </>
  );
};
