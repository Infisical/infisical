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
import { useUpdateAgentVaultMemberRole } from "@app/hooks/api/agentVault";
import { TAgentVaultProductMember } from "@app/hooks/api/agentVault/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { ProductRoleField } from "./ProductRoleField";

type Props = {
  // The member being edited, or null while the dialog is closed. One prop rather than three, so the
  // empty actor the callers used to pass -- which no request could have been built from -- cannot be
  // expressed.
  member: Pick<TAgentVaultProductMember, "role" | "actor"> | null;
  onOpenChange: (isOpen: boolean) => void;
  subject: string;
};

export const ProductRoleDialog = ({ member, onOpenChange, subject }: Props) => {
  const updateRole = useUpdateAgentVaultMemberRole();
  const currentRole = member?.role ?? ProjectMembershipRole.Member;
  const [role, setRole] = useState(currentRole);

  useEffect(() => {
    if (member) setRole(member.role);
  }, [member]);

  const handleSave = async () => {
    try {
      // Guarded here rather than by returning null, so the dialog's exit animation still runs.
      if (!member) return;
      await updateRole.mutateAsync({ actor: member.actor, role });
      createNotification({
        text: `${subject} is now ${role === "admin" ? "an Admin" : "a Member"}`,
        type: "success"
      });
      onOpenChange(false);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  return (
    <Dialog open={Boolean(member)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Role</DialogTitle>
          <DialogDescription>Choose what {subject} can do in Agent Vault.</DialogDescription>
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
