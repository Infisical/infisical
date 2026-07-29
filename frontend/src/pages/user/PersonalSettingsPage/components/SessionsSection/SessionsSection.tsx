import { useState } from "react";
import { LogOutIcon } from "lucide-react";

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
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@app/components/v3";
import { useRevokeMySessions } from "@app/hooks/api";

import { SessionsTable } from "./SessionsTable";

export const SessionsSection = () => {
  const [isRevokeAllOpen, setIsRevokeAllOpen] = useState(false);
  const { mutateAsync, isPending } = useRevokeMySessions();

  const onRevokeAllSessionsClick = async () => {
    try {
      await mutateAsync();
      createNotification({
        text: "All sessions signed out.",
        type: "success"
      });
      setIsRevokeAllOpen(false);
      window.location.href = "/login";
    } catch {
      createNotification({
        text: "Failed to sign out all sessions.",
        type: "error"
      });
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>
            Review browser and CLI sessions with access to your account.
          </CardDescription>
          <CardAction>
            <Button variant="danger" size="sm" onClick={() => setIsRevokeAllOpen(true)}>
              <LogOutIcon />
              Sign out all
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <SessionsTable />
        </CardContent>
      </Card>

      <AlertDialog
        open={isRevokeAllOpen}
        onOpenChange={(open) => !isPending && setIsRevokeAllOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out all sessions?</AlertDialogTitle>
            <AlertDialogDescription>
              This signs your account out of every browser and CLI, including this session. You will
              need to sign in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={isPending}
              onClick={(event) => {
                event.preventDefault();
                onRevokeAllSessionsClick();
              }}
            >
              Sign out all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
