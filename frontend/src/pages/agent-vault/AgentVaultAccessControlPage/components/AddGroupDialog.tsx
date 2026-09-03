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
  FieldLabel,
  FilterableSelect
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useGetOrganizationGroups, useListWorkspaceGroups } from "@app/hooks/api";
import { useAddAgentVaultProductMember } from "@app/hooks/api/agentVault";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { ProductRoleField } from "./ProductRoleField";

type TOption = { value: string; label: string };

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const AddGroupDialog = ({ isOpen, onOpenChange }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { data: orgGroups = [] } = useGetOrganizationGroups(currentOrg.id);
  const { data: projectGroups = [] } = useListWorkspaceGroups(currentProject.id);
  const addMember = useAddAgentVaultProductMember();

  const [group, setGroup] = useState<TOption | null>(null);
  const [role, setRole] = useState<string>(ProjectMembershipRole.Member);

  const options = useMemo(() => {
    const attached = new Set(projectGroups.map((membership) => membership.group.id));
    return orgGroups
      .filter((orgGroup) => !attached.has(orgGroup.id))
      .map((orgGroup) => ({ value: orgGroup.id, label: orgGroup.name }));
  }, [orgGroups, projectGroups]);

  const handleAdd = async () => {
    if (!group) return;
    await addMember.mutateAsync({ projectId: currentProject.id, groupId: group.value, role });
    createNotification({ text: `"${group.label}" now has Agent Vault`, type: "success" });
    setGroup(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Group</DialogTitle>
          <DialogDescription>
            Everyone in the group gets Agent Vault, including people added to it later.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel>Group</FieldLabel>
          <FieldContent>
            <FilterableSelect
              value={group}
              onChange={(value) => setGroup((value ?? null) as TOption | null)}
              options={options}
              placeholder="Search groups..."
              getOptionLabel={(option) => option.label}
              getOptionValue={(option) => option.value}
            />
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel>Product Role</FieldLabel>
          <FieldContent>
            <ProductRoleField value={role} onChange={setRole} idPrefix="add-group-role" />
          </FieldContent>
        </Field>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="av"
            isPending={addMember.isPending}
            isDisabled={!group}
            onClick={handleAdd}
          >
            Add Group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
