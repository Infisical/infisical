import { useEffect } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

import { environmentLabel, Gate } from "../flows/shared";
import { useManagedBlock } from "./permissions";
import type { RowActionHostProps } from "./types";

export function ImportActions({
  action,
  onClose,
  scope,
  onApply,
  onToast
}: RowActionHostProps<"import">) {
  const blockFor = useManagedBlock(scope.project);
  const importBlock = (
    entry: { environment: string; path: string },
    importAction: ProjectPermissionActions,
    verb: string
  ) =>
    blockFor(
      ProjectPermissionSub.SecretImports,
      importAction,
      { environment: entry.environment, secretPath: entry.path },
      verb
    );
  const resync = action?.action === "resync" ? action.entry : undefined;
  useEffect(() => {
    if (!resync) return;
    const block = importBlock(resync, ProjectPermissionActions.Edit, "resync this secret import");
    if (block) {
      onToast("bad", { title: "Failed to resync replicated secrets", description: block });
      onClose();
      return;
    }
    const timestamp = new Date().toISOString();
    onApply(
      (current) =>
        current.map((resource) =>
          resource.id === resync.id && resource.kind === "import"
            ? { ...resource, replicationStatus: "succeeded", lastReplicated: timestamp }
            : resource
        ),
      { title: "Resync of replicated secrets started" }
    );
    onClose();
  }, [resync]);
  const removing = action?.action === "delete" ? action.entry : undefined;
  const deleteBlock =
    removing && importBlock(removing, ProjectPermissionActions.Delete, "remove this secret import");
  return (
    <AlertDialog
      open={Boolean(removing)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent tone="danger">
        <AlertDialogHeader>
          <AlertDialogTitle>Remove secret import</AlertDialogTitle>
          <AlertDialogDescription>
            {`Unlinks secrets imported from ${removing ? environmentLabel(removing.source.environment) : ""}. The source secrets are not affected.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Gate reason={deleteBlock}>
            <AlertDialogAction
              variant="destructive"
              disabled={Boolean(deleteBlock)}
              onClick={() => {
                if (!removing) return;
                onApply((current) => current.filter((resource) => resource.id !== removing.id), {
                  title: "Successfully removed secret link"
                });
                onClose();
              }}
            >
              Remove
            </AlertDialogAction>
          </Gate>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
