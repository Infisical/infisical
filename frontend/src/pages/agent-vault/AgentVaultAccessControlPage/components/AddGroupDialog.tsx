import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useDebounce } from "@app/hooks";
import {
  useAddAgentVaultMembers,
  useListAgentVaultMembers,
  useListAvailableAgentVaultMembers
} from "@app/hooks/api/agentVault";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { ProductRoleField } from "./ProductRoleField";

type TOption = { value: string; label: string };

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const AddGroupDialog = ({ isOpen, onOpenChange }: Props) => {
  const { currentOrg } = useOrganization();
  const addMembers = useAddAgentVaultMembers();

  const [group, setGroup] = useState<TOption | null>(null);
  const [role, setRole] = useState<string>(ProjectMembershipRole.Member);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);

  const { data, isFetching } = useListAvailableAgentVaultMembers(
    { actorType: AgentVaultMemberType.Group, search: debouncedSearch.trim() || undefined },
    isOpen
  );
  // Only for the empty state: with nothing available, this is what tells an organization that has no
  // groups at all apart from one whose groups are all already members.
  const { data: memberData } = useListAgentVaultMembers(
    { actorType: AgentVaultMemberType.Group, limit: 1 },
    isOpen
  );

  const options = useMemo<TOption[]>(
    () => (data?.actors ?? []).map((actor) => ({ value: actor.id, label: actor.name })),
    [data]
  );

  const availableCount = data?.totalCount ?? 0;
  const isListTruncated = availableCount > options.length;
  // A search that matches nothing is not an empty organization, so it keeps the picker and answers
  // inside the dropdown instead.
  const hasNothingToAdd = Boolean(data) && availableCount === 0 && !debouncedSearch.trim();
  const orgHasNoGroups = hasNothingToAdd && (memberData?.totalCount ?? 0) === 0;

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

        {hasNothingToAdd ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              {orgHasNoGroups
                ? "Your organization has no groups yet. Create one at the organization level to add it to Agent Vault."
                : "Every group in your organization is already added. To add another, create one at the organization level first."}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button asChild variant="av">
                <Link
                  to={"/organizations/$orgId/access-management" as const}
                  params={{ orgId: currentOrg.id }}
                  search={{ selectedTab: "groups" }}
                >
                  Go to organization groups <ArrowRightIcon />
                </Link>
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <Field>
              <FieldLabel htmlFor="agent-vault-add-group">Group</FieldLabel>
              <FieldContent>
                <Combobox
                  id="agent-vault-add-group"
                  options={options}
                  value={group}
                  isLoading={isFetching}
                  onSearchChange={setSearch}
                  getOptionValue={(option) => option.value}
                  getOptionLabel={(option) => option.label}
                  placeholder="Pick a group"
                  searchPlaceholder="Search groups..."
                  searchAriaLabel="Search groups"
                  emptyMessage="No groups match your search"
                  modal
                  onValueChange={(next) => setGroup(next ?? null)}
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
