import { PackageIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ConfirmationAlertDialog } from "@app/components/v3";
import { useDeleteAgentVaultSkill } from "@app/hooks/api/agentVault";
import { TAgentVaultSkill } from "@app/hooks/api/agentVault/types";

type Props = {
  skill: Pick<TAgentVaultSkill, "id" | "name" | "accessBundles"> | null;
  onOpenChange: (isOpen: boolean) => void;
  onDeleted?: () => void | Promise<void>;
};

export const DeleteSkillDialog = ({ skill, onOpenChange, onDeleted }: Props) => {
  const deleteSkill = useDeleteAgentVaultSkill();
  const accessBundles = skill?.accessBundles ?? [];

  const handleDelete = async () => {
    if (!skill) return;
    try {
      await deleteSkill.mutateAsync(skill.id);
    } catch {
      return;
    }
    createNotification({ text: `Skill "${skill.name}" deleted`, type: "success" });
    onOpenChange(false);
    await onDeleted?.();
  };

  return (
    <ConfirmationAlertDialog
      isOpen={Boolean(skill)}
      onOpenChange={onOpenChange}
      title={`Delete "${skill?.name}"`}
      description={
        accessBundles.length > 0
          ? "Deleting it removes it from every access bundle below and deletes every version. This cannot be undone."
          : "This skill isn't in any access bundle. Every version of it is deleted. This cannot be undone."
      }
      confirmKey={skill?.name ?? ""}
      isPending={deleteSkill.isPending}
      onConfirm={handleDelete}
    >
      {accessBundles.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">
            Used by {accessBundles.length} access bundle{accessBundles.length === 1 ? "" : "s"}
          </p>
          <ul className="flex max-h-48 thin-scrollbar flex-col gap-2 overflow-y-auto rounded-md border border-border bg-container/50 p-3">
            {accessBundles.map((bundle) => (
              <li key={bundle.id} className="flex items-center gap-2 text-sm">
                <PackageIcon className="size-3.5 shrink-0 text-muted" />
                <span className="truncate">{bundle.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ConfirmationAlertDialog>
  );
};
