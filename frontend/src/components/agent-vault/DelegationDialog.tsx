import { useEffect, useMemo, useState } from "react";

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
  FieldLabel,
  FieldTitle,
  RadioGroup,
  RadioGroupItem
} from "@app/components/v3";
import { useDebounce } from "@app/hooks";
import { useListAgentVaultMembers, useSetAgentVaultDelegation } from "@app/hooks/api/agentVault";
import { AgentVaultDelegationScope, AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultDelegation } from "@app/hooks/api/agentVault/types";

import { MEMBER_KIND, memberDisplayName, memberSubtitle } from "./MemberName";

type SubjectOption = {
  type: AgentVaultMemberType.User | AgentVaultMemberType.Group;
  id: string;
  label: string;
  subtitle: string;
};

const PICKER_LIMIT = 50;

const userOption = (user: TAgentVaultDelegation["users"][number]): SubjectOption => {
  const actor = { type: AgentVaultMemberType.User as const, ...user };
  return {
    type: AgentVaultMemberType.User,
    id: user.id,
    label: memberDisplayName(actor),
    subtitle: memberSubtitle(actor)
  };
};

const groupOption = (group: TAgentVaultDelegation["groups"][number]): SubjectOption => ({
  type: AgentVaultMemberType.Group,
  id: group.id,
  label: group.name,
  subtitle: MEMBER_KIND[AgentVaultMemberType.Group].label
});

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  machineIdentityId: string;
  machineIdentityName: string;
  delegation: TAgentVaultDelegation | null;
};

export const DelegationDialog = ({
  isOpen,
  onOpenChange,
  machineIdentityId,
  machineIdentityName,
  delegation
}: Props) => {
  const setDelegation = useSetAgentVaultDelegation();

  const [scope, setScope] = useState(AgentVaultDelegationScope.Selected);
  const [selected, setSelected] = useState<SubjectOption[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);

  useEffect(() => {
    if (!isOpen) return;
    setScope(delegation?.scope ?? AgentVaultDelegationScope.Selected);
    setSelected([
      ...(delegation?.users ?? []).map(userOption),
      ...(delegation?.groups ?? []).map(groupOption)
    ]);
    setSearch("");
  }, [isOpen]);

  // A subject has to be an Agent Vault member, so the picker lists members rather than the whole org.
  const isPickerOpen = isOpen && scope === AgentVaultDelegationScope.Selected;
  const memberSearch = { search: debouncedSearch.trim() || undefined, limit: PICKER_LIMIT };
  const { data: users, isFetching: isFetchingUsers } = useListAgentVaultMembers(
    { ...memberSearch, actorType: AgentVaultMemberType.User },
    isPickerOpen
  );
  const { data: groups, isFetching: isFetchingGroups } = useListAgentVaultMembers(
    { ...memberSearch, actorType: AgentVaultMemberType.Group },
    isPickerOpen
  );

  const options = useMemo<SubjectOption[]>(
    () => [...(users?.members ?? []).map(userOption), ...(groups?.members ?? []).map(groupOption)],
    [users, groups]
  );

  const isListTruncated =
    (users?.totalCount ?? 0) > (users?.members.length ?? 0) ||
    (groups?.totalCount ?? 0) > (groups?.members.length ?? 0);

  const handleSave = async () => {
    try {
      const isSelected = scope === AgentVaultDelegationScope.Selected;
      await setDelegation.mutateAsync({
        machineIdentityId,
        scope,
        userIds: isSelected
          ? selected
              .filter((option) => option.type === AgentVaultMemberType.User)
              .map((option) => option.id)
          : [],
        groupIds: isSelected
          ? selected
              .filter((option) => option.type === AgentVaultMemberType.Group)
              .map((option) => option.id)
          : []
      });
      createNotification({
        text: `Delegation for "${machineIdentityName}" saved`,
        type: "success"
      });
      onOpenChange(false);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{delegation ? "Edit Delegation" : "Set Up Delegation"}</DialogTitle>
          <DialogDescription>
            &quot;{machineIdentityName}&quot; can start sessions on behalf of these users. Each
            session reaches only the user&apos;s access bundles and uses their personal values.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={scope}
          onValueChange={(value) => setScope(value as AgentVaultDelegationScope)}
        >
          <FieldLabel htmlFor="agent-vault-delegation-selected" variant="av">
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Selected Users and Groups</FieldTitle>
                <FieldDescription>
                  The users you pick, and the members of the groups you pick.
                </FieldDescription>
              </FieldContent>
              <RadioGroupItem
                value={AgentVaultDelegationScope.Selected}
                id="agent-vault-delegation-selected"
              />
            </Field>
          </FieldLabel>
          <FieldLabel htmlFor="agent-vault-delegation-all-members" variant="av">
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>All Agent Vault Members</FieldTitle>
                <FieldDescription>
                  Every user with access to Agent Vault, including users added later.
                </FieldDescription>
              </FieldContent>
              <RadioGroupItem
                value={AgentVaultDelegationScope.AllMembers}
                id="agent-vault-delegation-all-members"
              />
            </Field>
          </FieldLabel>
        </RadioGroup>

        {scope === AgentVaultDelegationScope.Selected && (
          <Field>
            <FieldLabel htmlFor="agent-vault-delegation-subjects">Users and Groups</FieldLabel>
            <FieldContent>
              <Combobox
                id="agent-vault-delegation-subjects"
                multiple
                options={options}
                value={selected}
                isLoading={isFetchingUsers || isFetchingGroups}
                onSearchChange={setSearch}
                getOptionValue={(option) => `${option.type}:${option.id}`}
                getOptionLabel={(option) => option.label}
                placeholder="Pick users or groups..."
                searchPlaceholder="Pick users or groups..."
                searchAriaLabel="Search users and groups"
                emptyMessage={(inputValue) =>
                  inputValue
                    ? "No Agent Vault users or groups match your search."
                    : "No users or groups are members of Agent Vault yet."
                }
                clearAriaLabel="Clear all users and groups"
                modal
                onValueChange={(next) => setSelected([...next])}
                renderValue={(option) => {
                  const { icon: Icon } = MEMBER_KIND[option.type];
                  return (
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Icon className="size-3.5 shrink-0 text-muted" />
                      <span className="truncate">{option.label}</span>
                    </span>
                  );
                }}
                renderOption={(option) => {
                  const { icon: Icon } = MEMBER_KIND[option.type];
                  return (
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Icon className="size-4 shrink-0 text-muted" />
                      <span className="min-w-0">
                        <span className="block truncate">{option.label}</span>
                        <span className="block truncate text-xs leading-4 text-muted">
                          {option.subtitle}
                        </span>
                      </span>
                    </span>
                  );
                }}
              />
              <FieldDescription>
                {isListTruncated
                  ? "Search by name to find users and groups that are not listed."
                  : "Only members of Agent Vault are listed. A user who is in Agent Vault through a group is covered by picking the group."}
              </FieldDescription>
            </FieldContent>
          </Field>
        )}

        <DialogFooter>
          <Button
            variant="av"
            isDisabled={scope === AgentVaultDelegationScope.Selected && !selected.length}
            isPending={setDelegation.isPending}
            onClick={async () => handleSave()}
          >
            Save Delegation
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
