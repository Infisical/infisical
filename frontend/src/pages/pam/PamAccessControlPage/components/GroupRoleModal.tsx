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
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { TGroupMembership } from "@app/hooks/api/groups/types";
import { useUpdatePamProductGroupMember } from "@app/hooks/api/pam";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { ProductRoleOptionList } from "./ProductRoleOptionList";

type Props = {
  group: TGroupMembership | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const GroupRoleModal = ({ group, isOpen, onOpenChange }: Props) => {
  const { currentProject } = useProject();
  const updateRole = useUpdatePamProductGroupMember();

  const currentRole = group?.roles?.[0]?.role ?? ProjectMembershipRole.Member;
  const [selectedRole, setSelectedRole] = useState<string>(currentRole);

  useEffect(() => {
    if (group) {
      setSelectedRole(group.roles?.[0]?.role ?? ProjectMembershipRole.Member);
    }
  }, [group]);

  if (!group) return null;

  const hasChanges = selectedRole !== currentRole;

  const handleSave = () => {
    updateRole.mutate(
      {
        projectId: currentProject.id,
        groupId: group.group.id,
        role: selectedRole
      },
      {
        onSuccess: () => {
          createNotification({ text: "Group role updated", type: "success" });
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
          <DialogDescription>Update the product role for {group.group.name}.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Groups}>
            {(isAllowed) => (
              <ProductRoleOptionList
                value={selectedRole}
                onChange={setSelectedRole}
                isDisabled={!isAllowed}
              />
            )}
          </ProjectPermissionCan>
        </div>

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
      </DialogContent>
    </Dialog>
  );
};
