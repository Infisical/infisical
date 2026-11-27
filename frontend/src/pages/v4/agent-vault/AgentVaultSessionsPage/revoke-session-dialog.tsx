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

import type { TAgentVaultSession } from "@app/hooks/api/agentVault/types";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { describeSession } from "./sessions";

export const RevokeSessionDialog = ({
  orgId,
  projectId,
  session,
  onClose
}: {
  orgId: string;
  projectId: string;
  session: TAgentVaultSession | null;
  onClose: () => void;
}) => {
  const revoke = useV4Adapter("agentVault").useRevokeSession(orgId, projectId);

  return (
    <AlertDialog open={Boolean(session)} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent tone="danger" icon="x" confirmText="revoke" pending={revoke.isPending}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {session ? `Revoke session ${describeSession(session)}` : "Revoke session"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Proxies stop attaching credentials for this session at their next poll. This cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            loading={revoke.isPending}
            onClick={async () => {
              if (!session) return;
              try {
                await revoke.mutateAsync(session.id);
                saved(`Session ${describeSession(session)} revoked`);
                onClose();
              } catch (error) {
                failed("Failed to revoke session", error);
              }
            }}
          >
            Revoke session
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
