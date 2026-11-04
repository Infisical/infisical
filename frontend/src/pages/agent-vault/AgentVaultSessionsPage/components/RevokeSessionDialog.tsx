import { memberDisplayName } from "@app/components/agent-vault/MemberName";
import { createNotification } from "@app/components/notifications";
import { ConfirmationAlertDialog } from "@app/components/v3";
import { useRevokeAgentVaultSession } from "@app/hooks/api/agentVault";
import { TAgentVaultSession } from "@app/hooks/api/agentVault/types";

// The label tells sessions apart when one identity holds several, so it leads when there is one.
const describeSession = (session: TAgentVaultSession) =>
  session.label
    ? `"${session.label}" for "${memberDisplayName(session.actor)}"`
    : `for "${memberDisplayName(session.actor)}"`;

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
      createNotification({
        text: `Session ${describeSession(session)} revoked`,
        type: "success"
      });
      onOpenChange(false);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  return (
    <ConfirmationAlertDialog
      isOpen={Boolean(session)}
      onOpenChange={onOpenChange}
      title={session ? `Revoke Session ${describeSession(session)}` : "Revoke Session"}
      description="Proxies stop attaching credentials for this session at their next poll. This cannot be undone."
      confirmKey="revoke"
      confirmLabel="Revoke Session"
      isPending={revokeSession.isPending}
      onConfirm={handleRevoke}
    />
  );
};
