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
  FilterableSelect
} from "@app/components/v3";
import { useDebounce } from "@app/hooks";
import {
  useAddAgentVaultMembers,
  useListAvailableAgentVaultMembers
} from "@app/hooks/api/agentVault";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { ProductRoleField } from "./ProductRoleField";

const CANDIDATE_LIMIT = 50;

type TOption = { value: string; label: string };

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const AddGroupDialog = ({ isOpen, onOpenChange }: Props) => {
  const addMembers = useAddAgentVaultMembers();

  const [group, setGroup] = useState<TOption | null>(null);
  const [role, setRole] = useState<string>(ProjectMembershipRole.Member);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);

  const { data, isFetching } = useListAvailableAgentVaultMembers(
    {
      actorType: AgentVaultMemberType.Group,
      search: debouncedSearch.trim() || undefined,
      limit: CANDIDATE_LIMIT
    },
    isOpen
  );

  const options = useMemo<TOption[]>(
    () => (data?.actors ?? []).map((actor) => ({ value: actor.id, label: actor.name })),
    [data]
  );

  const isListTruncated = (data?.totalCount ?? 0) > options.length;

  const handleClose = () => {
    setGroup(null);
    setRole(ProjectMembershipRole.Member);
    setSearch("");
    onOpenChange(false);
  };

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
      handleClose();
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
          return;
        }
        onOpenChange(open);
      }}
    >
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
              isLoading={isFetching || search !== debouncedSearch}
              onInputChange={(value, actionMeta) => {
                if (actionMeta.action === "input-change") setSearch(value);
              }}
              filterOption={() => true}
              noOptionsMessage={() =>
                search
                  ? "No group matches that is not already a member"
                  : "Every group in the organization is already a member"
              }
            />
            {isListTruncated && (
              <FieldDescription>
                Search by name to find groups that are not listed.
              </FieldDescription>
            )}
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel>Product Role</FieldLabel>
          <FieldContent>
            <ProductRoleField value={role} onChange={setRole} idPrefix="add-group-role" />
          </FieldContent>
        </Field>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
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
