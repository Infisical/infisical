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
  // How many of the members the caller can see hold the role, when that is known. The API refuses to delete a role
  // anyone holds.
  holderCount?: number;
  isHolderCountPending?: boolean;
  // The caller can see every kind of member, so a count of none means nobody holds the role.
  isHolderCountComplete?: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onDeleted?: () => void;
};

const holdersPhrase = (count: number, isComplete: boolean) => {
  const members = count === 1 ? "1 member holds" : `${count} members hold`;
  return isComplete ? members : `At least ${members}`;
};

const deleteDescription = (
  holderCount: number | undefined,
  isPending: boolean,
  isComplete: boolean
) => {
  if (isPending) return "Checking who holds this role.";
  if (holderCount === 0 && isComplete) {
    return "Nobody holds this role, so nobody loses access. This cannot be undone.";
  }
  return "The role and its rules are deleted. This cannot be undone.";
};

export const DeleteAgentVaultRoleDialog = ({
  role,
  holderCount,
  isHolderCountPending = false,
  isHolderCountComplete = false,
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
              {holdersPhrase(holderCount, isHolderCountComplete)} this role. Roles add up, so remove
              it from {holderCount === 1 ? "them" : "each of them"} under Access Control, then
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
      description={deleteDescription(holderCount, isHolderCountPending, isHolderCountComplete)}
      confirmKey={role?.slug ?? ""}
      confirmLabel="Delete Role"
      isPending={deleteRole.isPending || isHolderCountPending}
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
