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
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useUpdateAgentVaultProductMemberRole } from "@app/hooks/api/agentVault";
import { TAgentVaultProductMemberActor } from "@app/hooks/api/agentVault/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

// Admin and Member are the only slugs Agent Vault writes: everything else resolves to the member set,
// so offering it would promise less access than the role grants.
const ROLES = [
  { slug: ProjectMembershipRole.Admin, label: "Admin", hint: "Full control over Agent Vault" },
  { slug: ProjectMembershipRole.Member, label: "Member", hint: "Only the bundles granted to them" }
];

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  subject: string;
  currentRole: string;
  actor: TAgentVaultProductMemberActor;
};

export const ProductRoleDialog = ({ isOpen, onOpenChange, subject, currentRole, actor }: Props) => {
  const updateRole = useUpdateAgentVaultProductMemberRole();
  const [role, setRole] = useState(currentRole);

  useEffect(() => {
    if (isOpen) setRole(currentRole);
  }, [isOpen, currentRole]);

  const handleSave = async () => {
    await updateRole.mutateAsync({ ...actor, role });
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
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {ROLES.map((option) => (
                  <SelectItem key={option.slug} value={option.slug}>
                    {option.label}
                    <span className="ml-2 text-muted">{option.hint}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
