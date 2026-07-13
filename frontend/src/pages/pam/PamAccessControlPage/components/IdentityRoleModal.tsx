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
import { IdentityProjectMembershipV2 } from "@app/hooks/api/identities/types";
import { useUpdatePamProductIdentityMember } from "@app/hooks/api/pam";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { ProductRoleOptionList } from "./ProductRoleOptionList";

type Props = {
  identity: IdentityProjectMembershipV2 | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const IdentityRoleModal = ({ identity, isOpen, onOpenChange }: Props) => {
  const { currentProject } = useProject();
  const updateRole = useUpdatePamProductIdentityMember();

  const currentRole = identity?.roles?.[0]?.role ?? ProjectMembershipRole.Member;
  const [selectedRole, setSelectedRole] = useState<string>(currentRole);

  useEffect(() => {
    if (identity) {
      setSelectedRole(identity.roles?.[0]?.role ?? ProjectMembershipRole.Member);
    }
  }, [identity]);

  if (!identity) return null;

  const hasChanges = selectedRole !== currentRole;

  const handleSave = () => {
    updateRole.mutate(
      {
        identityId: identity.identity.id,
        role: selectedRole,
        projectId: currentProject.id
      },
      {
        onSuccess: () => {
          createNotification({ text: "Identity role updated", type: "success" });
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
          <DialogDescription>
            Update the product role for {identity.identity.name || "this identity"}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Identity}>
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
