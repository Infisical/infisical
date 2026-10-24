import { useEffect, useMemo, useState } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
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
  Toggle
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

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  machineIdentityId: string;
  machineIdentityName: string;
  delegation: TAgentVaultDelegation | null;
};

export const AddDelegationSubjectsDialog = ({
  isOpen,
  onOpenChange,
  machineIdentityId,
  machineIdentityName,
  delegation
}: Props) => {
  const setDelegation = useSetAgentVaultDelegation();

  const isCurrentlyAllMembers = delegation?.scope === AgentVaultDelegationScope.AllMembers;
  const [isAllMembers, setIsAllMembers] = useState(false);
  const [selected, setSelected] = useState<SubjectOption[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);

  useEffect(() => {
    if (!isOpen) return;
    setIsAllMembers(isCurrentlyAllMembers);
    setSelected([]);
    setSearch("");
  }, [isOpen]);

  // A subject has to be an Agent Vault member, so the picker lists members rather than the whole org.
  const isPickerShown = isOpen && !isAllMembers;
  const memberSearch = { search: debouncedSearch.trim() || undefined, limit: PICKER_LIMIT };
  const { data: users, isFetching: isFetchingUsers } = useListAgentVaultMembers(
    { ...memberSearch, actorType: AgentVaultMemberType.User },
    isPickerShown
  );
  const { data: groups, isFetching: isFetchingGroups } = useListAgentVaultMembers(
    { ...memberSearch, actorType: AgentVaultMemberType.Group },
    isPickerShown
  );

  const listedUserIds = new Set(delegation?.users.map((user) => user.id));
  const listedGroupIds = new Set(delegation?.groups.map((group) => group.id));

  const options = useMemo<SubjectOption[]>(
    () => [
      ...(users?.members ?? [])
        .filter((user) => !listedUserIds.has(user.id))
        .map((user) => ({
          type: AgentVaultMemberType.User as const,
          id: user.id,
          label: memberDisplayName(user),
          subtitle: memberSubtitle(user)
        })),
      ...(groups?.members ?? [])
        .filter((group) => !listedGroupIds.has(group.id))
        .map((group) => ({
          type: AgentVaultMemberType.Group as const,
          id: group.id,
          label: group.name,
          subtitle: MEMBER_KIND[AgentVaultMemberType.Group].label
        }))
    ],
    [users, groups, delegation]
  );

  const isListTruncated =
    (users?.totalCount ?? 0) > (users?.members.length ?? 0) ||
    (groups?.totalCount ?? 0) > (groups?.members.length ?? 0);

  const isUnchanged = isAllMembers ? isCurrentlyAllMembers : !selected.length;

  const handleSave = async () => {
    try {
      if (isAllMembers) {
        await setDelegation.mutateAsync({
          machineIdentityId,
          scope: AgentVaultDelegationScope.AllMembers
        });
        createNotification({
          text: `"${machineIdentityName}" now acts on behalf of every Agent Vault member`,
          type: "success"
        });
      } else {
        const idsOf = (type: SubjectOption["type"]) =>
          selected.filter((option) => option.type === type).map((option) => option.id);
        await setDelegation.mutateAsync({
          machineIdentityId,
          scope: AgentVaultDelegationScope.Selected,
          userIds: [...listedUserIds, ...idsOf(AgentVaultMemberType.User)],
          groupIds: [...listedGroupIds, ...idsOf(AgentVaultMemberType.Group)]
        });
        createNotification({
          text:
            selected.length === 1
              ? `"${selected[0].label}" added to the delegation`
              : `${selected.length} users and groups added to the delegation`,
          type: "success"
        });
      }
      onOpenChange(false);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  // Only narrowing gets a note: switching to all members still covers everyone listed.
  const note =
    !isAllMembers && isCurrentlyAllMembers
      ? "This replaces All Agent Vault Members with the users and groups you pick."
      : null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Users or Groups</DialogTitle>
          <DialogDescription>
            &quot;{machineIdentityName}&quot; can start sessions on behalf of the users you add, and
            of every member of the groups you add.
          </DialogDescription>
        </DialogHeader>

        <Field orientation="horizontal" className="rounded-md border border-border p-4">
          <FieldContent>
            <FieldTitle>All Agent Vault Members</FieldTitle>
            <FieldDescription>
              Act on behalf of every user in Agent Vault, including users added later.
            </FieldDescription>
          </FieldContent>
          <Toggle
            id="agent-vault-delegation-all-members"
            variant="av"
            checked={isAllMembers}
            onCheckedChange={setIsAllMembers}
          />
        </Field>

        {!isAllMembers && (
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
                    ? "No Agent Vault users or groups that aren't already added match your search."
                    : "Every Agent Vault user and group is already in the delegation."
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
                  : "Only members of Agent Vault are listed. A user who is in Agent Vault through a group is covered by adding the group."}
              </FieldDescription>
            </FieldContent>
          </Field>
        )}

        {note && (
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertDescription>{note}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="av"
            isDisabled={isUnchanged}
            isPending={setDelegation.isPending}
            onClick={async () => handleSave()}
          >
            {isAllMembers ? "Allow All Members" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
