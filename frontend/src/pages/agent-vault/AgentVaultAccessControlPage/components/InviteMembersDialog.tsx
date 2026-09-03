import { useMemo, useState } from "react";

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
  FieldDescription,
  FieldLabel,
  FilterableSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useGetOrgUsers, useGetWorkspaceUsers } from "@app/hooks/api";
import { useAddAgentVaultProductUserMembers } from "@app/hooks/api/agentVault";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

type TCandidate = { value: string; label: string; email: string };

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const InviteMembersDialog = ({ isOpen, onOpenChange }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { data: orgUsers = [] } = useGetOrgUsers(currentOrg.id);
  const { data: projectUsers = [] } = useGetWorkspaceUsers(currentProject.id);
  const addMembers = useAddAgentVaultProductUserMembers();

  const [selected, setSelected] = useState<TCandidate[]>([]);
  const [role, setRole] = useState<string>(ProjectMembershipRole.Member);

  // Only org members who are not already in Agent Vault, so the list never offers a no-op.
  const candidates = useMemo(() => {
    const attached = new Set(projectUsers.map((member) => member.user.id));
    return orgUsers
      .filter((orgUser) => !attached.has(orgUser.user.id))
      .map((orgUser) => {
        const name = `${orgUser.user.firstName ?? ""} ${orgUser.user.lastName ?? ""}`.trim();
        const email = orgUser.user.email || orgUser.user.username || "";
        return { value: orgUser.user.id, label: name || email, email };
      });
  }, [orgUsers, projectUsers]);

  const handleAdd = async () => {
    const { addedCount } = await addMembers.mutateAsync({
      userIds: selected.map((candidate) => candidate.value),
      emails: [],
      role
    });
    createNotification({
      text: `${addedCount} member${addedCount === 1 ? "" : "s"} added to Agent Vault`,
      type: "success"
    });
    setSelected([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Members</DialogTitle>
          <DialogDescription>
            Give people in {currentOrg.name} access to Agent Vault.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel>Members</FieldLabel>
          <FieldContent>
            <FilterableSelect
              isMulti
              value={selected}
              onChange={(value) => setSelected((value ?? []) as TCandidate[])}
              options={candidates}
              placeholder="Search by name or email..."
              getOptionLabel={(option) => option.label}
              getOptionValue={(option) => option.value}
            />
            <FieldDescription>
              Everyone already in Agent Vault is left out of this list.
            </FieldDescription>
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel>Product Role</FieldLabel>
          <FieldContent>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={ProjectMembershipRole.Admin}>Admin</SelectItem>
                <SelectItem value={ProjectMembershipRole.Member}>Member</SelectItem>
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
            isPending={addMembers.isPending}
            isDisabled={selected.length === 0}
            onClick={handleAdd}
          >
            Add Members
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
