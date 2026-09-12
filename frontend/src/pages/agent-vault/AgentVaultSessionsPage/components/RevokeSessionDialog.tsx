import { createNotification } from "@app/components/notifications";
import { DeleteConfirmDialog } from "@app/components/v3";
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

    try {
      await revokeSession.mutateAsync(session.id);
      createNotification({ text: `Session for "${session.actorName}" revoked`, type: "success" });
      onOpenChange(false);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  return (
    <DeleteConfirmDialog
      isOpen={Boolean(session)}
      onOpenChange={onOpenChange}
      title={`Revoke Session for "${session?.actorName}"`}
      description="Proxies stop attaching credentials for this session at their next poll. This cannot be undone."
      confirmKey="revoke"
      confirmLabel="Revoke Session"
      isPending={revokeSession.isPending}
      onConfirm={handleRevoke}
    />
  );
};
