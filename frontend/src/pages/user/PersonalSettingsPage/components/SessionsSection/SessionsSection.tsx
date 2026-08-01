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
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
      setIsRevokeAllOpen(false);
      window.location.href = "/login";
    } catch {
      // MutationCache.onError handles the error notification.
    }
  };

  return (
    <>
      <Card className="gap-0 overflow-hidden p-0">
        <CardHeader className="p-6">
          <CardTitle className="font-alliance">Sessions</CardTitle>
          <CardDescription>
            Review browser and CLI sessions with access to your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <SessionsTable />
        </CardContent>
        <CardFooter className="min-h-8 justify-end border-t border-neutral/15 bg-neutral/5 p-4">
          <Button variant="neutral" size="sm" onClick={() => setIsRevokeAllOpen(true)}>
            Sign out everywhere
          </Button>
        </CardFooter>
      </Card>

      <AlertDialog
        open={isRevokeAllOpen}
        onOpenChange={(open) => !isPending && setIsRevokeAllOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out everywhere?</AlertDialogTitle>
            <AlertDialogDescription>
              This signs your account out of every browser and CLI, including this session. You will
              need to sign in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              isPending={isPending}
              onClick={(event) => {
                event.preventDefault();
                onRevokeAllSessionsClick();
              }}
            >
              Sign out everywhere
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
