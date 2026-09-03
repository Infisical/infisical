import { useEffect, useState } from "react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldLabel
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useUpdateAgentVaultProductMemberRole } from "@app/hooks/api/agentVault";
import { TAgentVaultProductMemberActor } from "@app/hooks/api/agentVault/types";

import { ProductRoleField } from "./ProductRoleField";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  subject: string;
  currentRole: string;
  actor: TAgentVaultProductMemberActor;
};

export const ProductRoleDialog = ({ isOpen, onOpenChange, subject, currentRole, actor }: Props) => {
  const { currentProject } = useProject();
  const updateRole = useUpdateAgentVaultProductMemberRole();
  const [role, setRole] = useState(currentRole);

  useEffect(() => {
    if (isOpen) setRole(currentRole);
  }, [isOpen, currentRole]);

  const handleSave = async () => {
    await updateRole.mutateAsync({ projectId: currentProject.id, ...actor, role });
    createNotification({
      text: `${subject} is now ${role === "admin" ? "an Admin" : "a Member"}`,
      type: "success"
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Role</DialogTitle>
          <DialogDescription>What {subject} can do across Agent Vault.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>Product Role</FieldLabel>
          <FieldContent>
            <ProductRoleField value={role} onChange={setRole} idPrefix="change-role" />
          </FieldContent>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="av"
            isPending={updateRole.isPending}
            isDisabled={role === currentRole}
            onClick={handleSave}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
