import { createNotification } from "@app/components/notifications";
import { DeleteConfirmDialog } from "@app/components/v3";
import {
  useDeleteAgentVaultAccessBundle,
  useGetAgentVaultAccessBundleLiveSessionCount
} from "@app/hooks/api/agentVault";
import { TAgentVaultAccessBundle } from "@app/hooks/api/agentVault/types";

type Props = {
  accessBundle: TAgentVaultAccessBundle | null;
  onOpenChange: (isOpen: boolean) => void;
  onDeleted?: () => void;
};

export const DeleteAccessBundleDialog = ({ accessBundle, onOpenChange, onDeleted }: Props) => {
  const deleteAccessBundle = useDeleteAgentVaultAccessBundle();
  const { data: liveSessionCount } = useGetAgentVaultAccessBundleLiveSessionCount(
    accessBundle?.id ?? "",
    Boolean(accessBundle)
  );

  const handleDelete = async () => {
    if (!accessBundle) return;

    await deleteAccessBundle.mutateAsync(accessBundle.id);
    createNotification({ text: `Access bundle "${accessBundle.name}" deleted`, type: "success" });
    onOpenChange(false);
    onDeleted?.();
  };

  const liveSessionNote =
    liveSessionCount && liveSessionCount > 0
      ? ` ${liveSessionCount} live session${liveSessionCount === 1 ? "" : "s"} ${
          liveSessionCount === 1 ? "carries" : "carry"
        } it, and ${liveSessionCount === 1 ? "its agent loses" : "their agents lose"} these connections within about a minute.`
      : "";

  return (
    <DeleteConfirmDialog
      isOpen={Boolean(accessBundle)}
      onOpenChange={onOpenChange}
      title={`Delete "${accessBundle?.name}"`}
      description={`Its connections and every grant on it go with it.${liveSessionNote} This cannot be undone.`}
      confirmKey={accessBundle?.name ?? ""}
      isPending={deleteAccessBundle.isPending}
      onConfirm={handleDelete}
    />
  );
};
