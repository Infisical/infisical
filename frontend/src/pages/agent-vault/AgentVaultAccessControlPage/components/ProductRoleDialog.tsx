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
import { useUpdateAgentVaultMemberRoles } from "@app/hooks/api/agentVault";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultActorIdsDTO, TAgentVaultProductMember } from "@app/hooks/api/agentVault/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { ProductRoleField } from "./ProductRoleField";

const ACTOR_IDS_KEY: Record<AgentVaultMemberType, keyof TAgentVaultActorIdsDTO> = {
  [AgentVaultMemberType.User]: "userIds",
  [AgentVaultMemberType.Group]: "groupIds",
  [AgentVaultMemberType.MachineIdentity]: "machineIdentityIds"
};

type Props = {
  member: Pick<TAgentVaultProductMember, "type" | "id" | "role"> | null;
  onOpenChange: (isOpen: boolean) => void;
  subject: string;
};

export const ProductRoleDialog = ({ member, onOpenChange, subject }: Props) => {
  const updateRole = useUpdateAgentVaultMemberRoles();
  const currentRole = member?.role ?? ProjectMembershipRole.Member;
  const [role, setRole] = useState(currentRole);

  useEffect(() => {
    if (member) setRole(member.role);
  }, [member]);

  const handleSave = async () => {
    try {
      // Guarded here, not by returning null, so the exit animation still runs.
      if (!member) return;
      await updateRole.mutateAsync({ [ACTOR_IDS_KEY[member.type]]: [member.id], role });
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
