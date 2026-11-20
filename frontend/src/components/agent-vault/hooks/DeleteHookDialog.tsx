import { createNotification } from "@app/components/notifications";
import { ConfirmationAlertDialog } from "@app/components/v3";
import { useProject } from "@app/context";
import { useDeleteAgentVaultHook } from "@app/hooks/api/agentVault";
import { TAgentVaultHook } from "@app/hooks/api/agentVault/types";

import { listNames } from "./hookSchema";

type Props = {
  hook: Pick<TAgentVaultHook, "id" | "name" | "usedBy"> | null;
  onOpenChange: (isOpen: boolean) => void;
};

const deleteDescription = (usedBy: TAgentVaultHook["usedBy"]) => {
  if (!usedBy.length) return "This cannot be undone.";
  const names = listNames(usedBy.map((service) => service.name));
  if (usedBy.length === 1) {
    return `It checks ${names}, which won't be checked after this. This cannot be undone.`;
  }
  return `It checks ${names}. They won't be checked after this. This cannot be undone.`;
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
      description={deleteDescription(hook?.usedBy ?? [])}
      confirmKey={hook?.name ?? ""}
      isPending={deleteHook.isPending}
      onConfirm={handleDelete}
    />
  );
};
