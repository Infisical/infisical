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
import { useOrganization } from "@app/context";
import { useGetOrganizationGroups } from "@app/hooks/api";
import { useAddAgentVaultMembers } from "@app/hooks/api/agentVault";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { ProductRoleField } from "./ProductRoleField";

type TOption = { value: string; label: string };

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const AddGroupDialog = ({ isOpen, onOpenChange }: Props) => {
  const { currentOrg } = useOrganization();
  const { data: orgGroups = [] } = useGetOrganizationGroups(currentOrg.id);
  const addMembers = useAddAgentVaultMembers();

  const [group, setGroup] = useState<TOption | null>(null);
  const [role, setRole] = useState<string>(ProjectMembershipRole.Member);

  const options = useMemo(
    () => orgGroups.map((orgGroup) => ({ value: orgGroup.id, label: orgGroup.name })),
    [orgGroups]
  );

  const handleAdd = async () => {
    try {
      if (!group) return;
      const { skipped } = await addMembers.mutateAsync({ groupIds: [group.value], role });
      createNotification({
        text: skipped.length
          ? `"${group.label}" already has access to Agent Vault`
          : `"${group.label}" added`,
        type: skipped.length ? "info" : "success"
      });
      setGroup(null);
      onOpenChange(false);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Group</DialogTitle>
          <DialogDescription>
            Everyone in the group gets access, including people added to it later.
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
            isPending={addMembers.isPending}
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
