import { useEffect, useState } from "react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProject, useUser } from "@app/context";
import { useUpdateUserWorkspaceRole } from "@app/hooks/api";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { TWorkspaceUser } from "@app/hooks/api/users/types";

import { ProductRoleOptionList } from "./ProductRoleOptionList";

type Props = {
  member: TWorkspaceUser | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const MemberRoleModal = ({ member, isOpen, onOpenChange }: Props) => {
  const { currentProject } = useProject();
  const { user } = useUser();
  const updateRole = useUpdateUserWorkspaceRole();

  const currentRole = member?.roles?.[0]?.role ?? ProjectMembershipRole.Member;
  const [selectedRole, setSelectedRole] = useState<string>(currentRole);

  useEffect(() => {
    if (member) {
      setSelectedRole(member.roles?.[0]?.role ?? ProjectMembershipRole.Member);
    }
  }, [member]);

  if (!member) return null;

  const isSelf = member.user.id === user?.id;

  const displayName =
    member.user.firstName || member.user.lastName
      ? `${member.user.firstName ?? ""} ${member.user.lastName ?? ""}`.trim()
      : member.user.username;

  const hasChanges = selectedRole !== currentRole;

  const handleSave = () => {
    updateRole.mutate(
      {
        projectId: currentProject.id,
        membershipId: member.id,
        roles: [{ role: selectedRole, isTemporary: false }]
      },
      {
        onSuccess: () => {
          createNotification({ text: "Role updated", type: "success" });
          onOpenChange(false);
        }
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Role</DialogTitle>
          <DialogDescription>Update the product role for {displayName}.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {isSelf ? (
            <p className="text-sm text-muted">
              You cannot modify your own membership. Ask an admin to make changes.
            </p>
          ) : (
            <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Member}>
              {(isAllowed) => (
                <ProductRoleOptionList
                  value={selectedRole}
                  onChange={setSelectedRole}
                  isDisabled={!isAllowed}
                />
              )}
            </ProjectPermissionCan>
          )}
        </div>

        {!isSelf && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="pam"
              isDisabled={!hasChanges}
              isPending={updateRole.isPending}
              onClick={handleSave}
            >
              Save
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
