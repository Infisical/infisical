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
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { useUpdatePamProductIdentityMember } from "@app/hooks/api/pam";
import { TPamMember } from "@app/hooks/api/pam/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { ProductRoleOptionList } from "./ProductRoleOptionList";

type Props = {
  identity: TPamMember | null;
  identityName?: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const IdentityRoleModal = ({ identity, identityName, isOpen, onOpenChange }: Props) => {
  const updateRole = useUpdatePamProductIdentityMember();

  const currentRole = identity?.role ?? ProjectMembershipRole.Member;
  const [selectedRole, setSelectedRole] = useState<string>(currentRole);

  useEffect(() => {
    if (identity) {
      setSelectedRole(identity.role ?? ProjectMembershipRole.Member);
    }
  }, [identity]);

  if (!identity) return null;

  const hasChanges = selectedRole !== currentRole;

  const handleSave = () => {
    if (!identity.identityId) return;
    updateRole.mutate(
      {
        identityId: identity.identityId,
        role: selectedRole
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
            Update the product role for {identityName || "this identity"}.
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
