import { createNotification } from "@app/components/notifications";
import { ConfirmationAlertDialog } from "@app/components/v3";
import { useProject } from "@app/context";
import { useDeleteAgentVaultHook } from "@app/hooks/api/agentVault";
import { TAgentVaultHook } from "@app/hooks/api/agentVault/types";

type Props = {
  hook: Pick<TAgentVaultHook, "id" | "name"> | null;
  onOpenChange: (isOpen: boolean) => void;
};

export const DeleteHookDialog = ({ hook, onOpenChange }: Props) => {
  const { projectId } = useProject();
  const deleteHook = useDeleteAgentVaultHook(projectId);

  const handleDelete = async () => {
    if (!hook) return;
    await deleteHook.mutateAsync(hook.id);
    createNotification({ text: `Hook "${hook.name}" deleted`, type: "success" });
    onOpenChange(false);
  };

  return (
    <ConfirmationAlertDialog
      isOpen={Boolean(hook)}
      onOpenChange={onOpenChange}
      title={`Delete "${hook?.name}"`}
      description="Sessions created with it keep running without a hook. This cannot be undone."
      confirmKey={hook?.name ?? ""}
      isPending={deleteHook.isPending}
      onConfirm={handleDelete}
    />
  );
};
