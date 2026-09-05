import { createNotification } from "@app/components/notifications";
import { DeleteConfirmDialog } from "@app/components/v3";
import { useDeleteAgentVaultAccessBundle } from "@app/hooks/api/agentVault";
import { TAgentVaultAccessBundle } from "@app/hooks/api/agentVault/types";

type Props = {
  accessBundle: TAgentVaultAccessBundle | null;
  onOpenChange: (isOpen: boolean) => void;
  onDeleted?: () => void;
};

export const DeleteAccessBundleDialog = ({ accessBundle, onOpenChange, onDeleted }: Props) => {
  const deleteAccessBundle = useDeleteAgentVaultAccessBundle();

  const handleDelete = async () => {
    if (!accessBundle) return;

    await deleteAccessBundle.mutateAsync(accessBundle.id);
    createNotification({ text: `Access bundle "${accessBundle.name}" deleted`, type: "success" });
    onOpenChange(false);
    onDeleted?.();
  };

  return (
    <DeleteConfirmDialog
      isOpen={Boolean(accessBundle)}
      onOpenChange={onOpenChange}
      title={`Delete "${accessBundle?.name}"`}
      description="Its connections and every grant on it go with it. Any live session carrying it loses them at the next proxy poll. This cannot be undone."
      confirmKey={accessBundle?.name ?? ""}
      isPending={deleteAccessBundle.isPending}
      onConfirm={handleDelete}
    />
  );
};
