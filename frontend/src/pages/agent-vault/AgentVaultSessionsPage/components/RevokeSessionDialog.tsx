import { TriangleAlertIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
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
import { useRevokeAgentVaultSession } from "@app/hooks/api/agentVault";
import { TAgentVaultSession } from "@app/hooks/api/agentVault/types";

type Props = {
  session: TAgentVaultSession | null;
  onOpenChange: (isOpen: boolean) => void;
};

export const RevokeSessionDialog = ({ session, onOpenChange }: Props) => {
  const revokeSession = useRevokeAgentVaultSession();

  const handleRevoke = async () => {
    if (!session) return;

    await revokeSession.mutateAsync(session.id);
    createNotification({ text: `Session for "${session.actorName}" revoked`, type: "success" });
    onOpenChange(false);
  };

  return (
    <AlertDialog open={Boolean(session)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <TriangleAlertIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Revoke session for &quot;{session?.actorName}&quot;</AlertDialogTitle>
          <AlertDialogDescription>
            Proxies stop attaching credentials for this session within about a minute. This cannot
            be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            isPending={revokeSession.isPending}
            onClick={async (event) => {
              event.preventDefault();
              await handleRevoke();
            }}
          >
            Revoke Session
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
