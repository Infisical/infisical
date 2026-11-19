import { useEffect, useState } from "react";

import { ProductRolesField } from "@app/components/agent-vault/ProductRolesField";
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
import {
  actorIdsPayload,
  defaultAgentVaultRoles,
  isSameRoleSet
} from "@app/helpers/agentVaultMembers";
import { useUpdateAgentVaultMemberRoles } from "@app/hooks/api/agentVault";
import { TAgentVaultProductMember } from "@app/hooks/api/agentVault/types";

type Props = {
  member: Pick<TAgentVaultProductMember, "type" | "id" | "roles"> | null;
  onOpenChange: (isOpen: boolean) => void;
  subject: string;
};

export const ProductRoleDialog = ({ member, onOpenChange, subject }: Props) => {
  const { projectId } = useProject();
  const updateRoles = useUpdateAgentVaultMemberRoles(projectId);
  const currentRoles = member?.roles ?? defaultAgentVaultRoles();
  const [roles, setRoles] = useState(currentRoles);

  useEffect(() => {
    if (member) setRoles(member.roles);
  }, [member]);

  const handleSave = async () => {
    try {
      // Guarded here, not by returning null, so the exit animation still runs.
      if (!member) return;
      const { members } = await updateRoles.mutateAsync({ ...actorIdsPayload([member]), roles });
      // Save is disabled for the current roles, so a skip means the member changed under the dialog.
      createNotification(
        members.length
          ? { text: `Updated the roles of ${subject}`, type: "success" }
          : {
              text: `Roles not changed. ${subject} may have been removed from this project or already has those roles.`,
              type: "info"
            }
      );
      onOpenChange(false);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  return (
    <Dialog open={Boolean(member)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Roles</DialogTitle>
          <DialogDescription>Choose what {subject} can do in this project.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="agent-vault-edit-roles">Roles</FieldLabel>
          <FieldContent>
            <ProductRolesField
              id="agent-vault-edit-roles"
              projectId={projectId}
              value={roles}
              onChange={setRoles}
            />
          </FieldContent>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="av"
            isPending={updateRoles.isPending}
            isDisabled={isSameRoleSet(roles, currentRoles)}
            onClick={handleSave}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
