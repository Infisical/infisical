import { useEffect, useMemo, useState } from "react";
import { BotIcon, UserIcon, UsersIcon } from "lucide-react";

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
  FieldLabel
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  useAddAgentVaultAccessBundleMember,
  useListAgentVaultProductIdentities
} from "@app/hooks/api/agentVault";
import { TAgentVaultMember } from "@app/hooks/api/agentVault/types";
import { useGetWorkspaceUsers, useListWorkspaceGroups } from "@app/hooks/api/projects/queries";

enum MemberKind {
  User = "user",
  Identity = "identity",
  Group = "group"
}

const KIND_ICON: Record<MemberKind, typeof UserIcon> = {
  [MemberKind.User]: UserIcon,
  [MemberKind.Identity]: BotIcon,
  [MemberKind.Group]: UsersIcon
};

type Option = { kind: MemberKind; id: string; label: string; subtitle: string };

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  accessBundleId: string;
  members: TAgentVaultMember[];
};

export const AddMemberDialog = ({ isOpen, onOpenChange, accessBundleId, members }: Props) => {
  const { currentProject } = useProject();
  const addMember = useAddAgentVaultAccessBundleMember();

  const [selected, setSelected] = useState<Option | null>(null);

  useEffect(() => {
    if (isOpen) setSelected(null);
  }, [isOpen]);

  const { data: users } = useGetWorkspaceUsers(currentProject.id, false, undefined, {
    enabled: isOpen
  });
  const { data: groupMemberships } = useListWorkspaceGroups(
    currentProject.id,
    currentProject.type,
    { enabled: isOpen }
  );
  const { data: identities } = useListAgentVaultProductIdentities(isOpen);

  // Anyone already granted the bundle is filtered out, so the 409 the API returns for a duplicate
  // is never reachable from the picker.
  const grantedIds = useMemo(
    () =>
      new Set(members.map((member) => member.userId ?? member.identityId ?? member.groupId ?? "")),
    [members]
  );

  // One list rather than a tab per kind: an admin knows the name they are granting to, not which
  // of the three it is filed under.
  const options = useMemo<Option[]>(() => {
    const userOptions = (users ?? [])
      .map((membership) => {
        const fullName = [membership.user.firstName, membership.user.lastName]
          .filter(Boolean)
          .join(" ");
        return {
          kind: MemberKind.User,
          id: membership.user.id,
          label: fullName || membership.user.username || membership.user.email,
          subtitle: membership.user.email || membership.user.username
        };
      })
      .filter((option) => !grantedIds.has(option.id));

    const groupOptions = (groupMemberships ?? [])
      .map((membership) => ({
        kind: MemberKind.Group,
        id: membership.group.id,
        label: membership.group.name,
        subtitle: "Group"
      }))
      .filter((option) => !grantedIds.has(option.id));

    const identityOptions = (identities ?? [])
      .map((identity) => ({
        kind: MemberKind.Identity,
        id: identity.id,
        label: identity.name,
        subtitle: "Machine Identity"
      }))
      .filter((option) => !grantedIds.has(option.id));

    return [...userOptions, ...groupOptions, ...identityOptions];
  }, [users, groupMemberships, identities, grantedIds]);

  const handleAdd = async () => {
    if (!selected) return;

    await addMember.mutateAsync({
      accessBundleId,
      ...(selected.kind === MemberKind.User && { userId: selected.id }),
      ...(selected.kind === MemberKind.Identity && { identityId: selected.id }),
      ...(selected.kind === MemberKind.Group && { groupId: selected.id })
    });
    createNotification({ text: `Access bundle granted to "${selected.label}"`, type: "success" });
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant Access</DialogTitle>
          <DialogDescription>
            Whoever holds this bundle can mint a session over it. They must already be a member of
            Agent Vault.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="agent-vault-grant-to">Grant To</FieldLabel>
          <FieldContent>
            <Combobox
              id="agent-vault-grant-to"
              options={options}
              value={selected}
              getOptionValue={(option) => `${option.kind}:${option.id}`}
              getOptionLabel={(option) => option.label}
              getOptionKeywords={(option) => [option.subtitle]}
              placeholder="Pick a user, group, or machine identity..."
              searchPlaceholder="Pick a user, group, or machine identity..."
              searchAriaLabel="Search users, groups, and machine identities"
              emptyMessage="Nobody left to grant. Add them under Access Control first."
              modal
              onValueChange={setSelected}
              renderOption={(option) => {
                const Icon = KIND_ICON[option.kind];
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
          </FieldContent>
        </Field>

        <DialogFooter>
          <Button
            variant="av"
            isDisabled={!selected}
            isPending={addMember.isPending}
            onClick={async () => handleAdd()}
          >
            Grant Access
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
