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

import { environmentLabel, LOCAL_ONLY } from "../flows/shared";
import type { RowActionHostProps } from "./types";

export function ImportActions({ action, onClose, onApply }: RowActionHostProps<"import">) {
  const resync = action?.action === "resync" ? action.entry : undefined;
  useEffect(() => {
    if (!resync) return;
    const timestamp = new Date().toISOString();
    onApply(
      (current) =>
        current.map((resource) =>
          resource.id === resync.id && resource.kind === "import"
            ? { ...resource, replicationStatus: "succeeded", lastReplicated: timestamp }
            : resource
        ),
      { title: "Resynced replicated secrets in local demo data", description: LOCAL_ONLY }
    );
    onClose();
  }, [resync]);
  const removing = action?.action === "delete" ? action.entry : undefined;
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
            {`This will unlink secrets imported from ${removing ? environmentLabel(removing.source.environment) : ""}. The source secrets will not be affected.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (!removing) return;
              onApply((current) => current.filter((resource) => resource.id !== removing.id), {
                title: "Successfully removed secret link",
                description: LOCAL_ONLY
              });
              onClose();
            }}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
