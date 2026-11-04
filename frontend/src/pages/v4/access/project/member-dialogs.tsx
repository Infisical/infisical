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
import { ActorType } from "@app/hooks/api/auditLogs/enums";

import { useV4Adapter } from "../../data/adapters";
import { accessLinks } from "../links";
import { failed, saved } from "../toast";
import { useProjectScope } from "./scope";

export type AssumeTarget = { id: string; type: ActorType.USER | ActorType.IDENTITY };

export const AssumePrivilegesDialog = ({
  projectId,
  target,
  onOpenChange
}: {
  projectId: string;
  target?: AssumeTarget;
  onOpenChange: (open: boolean) => void;
}) => {
  const scope = useProjectScope();
  const assume = useV4Adapter("access").useAssumeProjectPrivileges();
  const noun = target?.type === ActorType.IDENTITY ? "machine identity" : "user";
  const confirm = async () => {
    if (!target) return;
    try {
      await assume.mutateAsync({ actorId: target.id, actorType: target.type, projectId });
      saved(`${noun === "user" ? "User" : "Machine identity"} privilege assumption has started`);
      onOpenChange(false);
      window.location.assign(accessLinks.project(scope));
    } catch (error) {
      failed("Failed to assume privileges", error);
    }
  };
  return (
    <AlertDialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <AlertDialogContent tone="neutral" confirmText="assume">
        <AlertDialogHeader>
          <AlertDialogTitle>{`Assume privileges of this ${noun}`}</AlertDialogTitle>
          <AlertDialogDescription>
            {`This will set your privileges to those of the ${noun} for the next hour.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="primary"
            onClick={(event) => {
              event.preventDefault();
              confirm();
            }}
          >
            Assume privileges
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const RemoveMemberDialog = ({
  name,
  onOpenChange,
  onConfirm
}: {
  name?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) => (
  <AlertDialog open={Boolean(name)} onOpenChange={onOpenChange}>
    <AlertDialogContent tone="danger" confirmText="remove">
      <AlertDialogHeader>
        <AlertDialogTitle>{`Remove ${name ?? "this user"} from the project?`}</AlertDialogTitle>
        <AlertDialogDescription>
          This user will lose access granted by this membership. This cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onClick={onConfirm}>
          Remove user
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
