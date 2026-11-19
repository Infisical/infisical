import { useQueryClient } from "@tanstack/react-query";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  ConfirmationAlertDialog
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useDeleteProjectRole } from "@app/hooks/api";
import { invalidateAgentVaultRoleDependents } from "@app/hooks/api/agentVaultRoles";
import { ProjectType } from "@app/hooks/api/projects/types";

export type TRoleToDelete = { id: string; name: string; slug: string };

type Props = {
  role: TRoleToDelete | null;
  // How many members hold the role, when that is known. The API refuses to delete a role anyone holds.
  holderCount?: number;
  onOpenChange: (isOpen: boolean) => void;
  onDeleted?: () => void;
};

export const DeleteAgentVaultRoleDialog = ({
  role,
  holderCount,
  onOpenChange,
  onDeleted
}: Props) => {
  const { projectId } = useProject();
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  const deleteRole = useDeleteProjectRole();

  if (role && holderCount) {
    return (
      <AlertDialog open onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Can&apos;t Delete &quot;{role.name}&quot; Yet</AlertDialogTitle>
            <AlertDialogDescription>
              {holderCount === 1 ? "1 member holds" : `${holderCount} members hold`} this role. Give{" "}
              {holderCount === 1 ? "them" : "each of them"} another role under Access Control, then
              delete it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <ConfirmationAlertDialog
      isOpen={Boolean(role)}
      onOpenChange={onOpenChange}
      title={`Delete "${role?.name ?? ""}"`}
      description={
        holderCount === 0
          ? "Nobody holds this role, so nobody loses access. This cannot be undone."
          : "The role and its rules are deleted. This cannot be undone."
      }
      confirmKey={role?.slug ?? ""}
      confirmLabel="Delete Role"
      isPending={deleteRole.isPending}
      onConfirm={async () => {
        if (!role) return;
        await deleteRole.mutateAsync({
          id: role.id,
          projectId,
          projectType: ProjectType.AgentVault
        });
        createNotification({ type: "success", text: `Role "${role.name}" deleted` });
        invalidateAgentVaultRoleDependents(queryClient, currentOrg.id, projectId);
        onOpenChange(false);
        onDeleted?.();
      }}
    />
  );
};
