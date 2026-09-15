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
import {
  useAddAgentVaultAccessBundleMembers,
  useListAgentVaultProductGroupMembers,
  useListAgentVaultProductIdentityMembers,
  useListAgentVaultProductUserMembers
} from "@app/hooks/api/agentVault";
import { TAgentVaultMember } from "@app/hooks/api/agentVault/types";

import { PendingInvitationBadge } from "./PendingInvitationBadge";

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

type Option = {
  kind: MemberKind;
  id: string;
  label: string;
  subtitle: string;
  isPendingInvitation?: boolean;
};

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  accessBundleId: string;
  members: TAgentVaultMember[];
};

export const AddMemberDialog = ({ isOpen, onOpenChange, accessBundleId, members }: Props) => {
  const addMembers = useAddAgentVaultAccessBundleMembers();

  const [selected, setSelected] = useState<Option[]>([]);

  useEffect(() => {
    if (isOpen) setSelected([]);
  }, [isOpen]);

  const { data: users } = useListAgentVaultProductUserMembers(isOpen);
  const { data: groupMemberships } = useListAgentVaultProductGroupMembers(isOpen);
  const { data: identities } = useListAgentVaultProductIdentityMembers(isOpen);

  const grantedIds = useMemo(
    () =>
      new Set(members.map((member) => member.userId ?? member.identityId ?? member.groupId ?? "")),
    [members]
  );

  const options = useMemo<Option[]>(() => {
    const userOptions = (users ?? [])
      .filter((member) => member.userId)
      .map((member) => {
        const fullName = [member.firstName, member.lastName].filter(Boolean).join(" ");
        return {
          kind: MemberKind.User,
          id: member.userId as string,
          label: fullName || member.username || member.email || "",
          subtitle: member.email || member.username,
          isPendingInvitation: member.isOrgMembershipPending
        };
      })
      .filter((option) => !grantedIds.has(option.id));

    const groupOptions = (groupMemberships ?? [])
      .filter((member) => member.groupId)
      .map((member) => ({
        kind: MemberKind.Group,
        id: member.groupId as string,
        label: member.name,
        subtitle: "Group"
      }))
      .filter((option) => !grantedIds.has(option.id));

    const identityOptions = (identities ?? [])
      .filter((member) => member.identityId)
      .map((member) => ({
        kind: MemberKind.Identity,
        id: member.identityId as string,
        label: member.name,
        subtitle: "Machine Identity"
      }))
      .filter((option) => !grantedIds.has(option.id))
      .sort((a, b) => a.label.localeCompare(b.label));

    return [...userOptions, ...groupOptions, ...identityOptions];
  }, [users, groupMemberships, identities, grantedIds]);

  const handleAdd = async () => {
    try {
      if (!selected.length) return;

      const idsOfKind = (kind: MemberKind) =>
        selected.filter((option) => option.kind === kind).map((option) => option.id);

      const { members: granted, skipped } = await addMembers.mutateAsync({
        accessBundleId,
        userIds: idsOfKind(MemberKind.User),
        identityIds: idsOfKind(MemberKind.Identity),
        groupIds: idsOfKind(MemberKind.Group)
      });

      if (!granted.length) {
        createNotification({ text: "They already had this access bundle", type: "info" });
      } else {
        const grantedText =
          granted.length === 1 && selected.length === 1
            ? `Access bundle granted to "${selected[0].label}"`
            : `Access bundle granted to ${granted.length} members`;
        createNotification({
          text: skipped.length ? `${grantedText}. ${skipped.length} already had it.` : grantedText,
          type: "success"
        });
      }
      onOpenChange(false);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
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
              multiple
              options={options}
              value={selected}
              getOptionValue={(option) => `${option.kind}:${option.id}`}
              getOptionLabel={(option) => option.label}
              getOptionKeywords={(option) => [option.subtitle]}
              placeholder="Pick users, groups, or machine identities..."
              searchPlaceholder="Pick users, groups, or machine identities..."
              searchAriaLabel="Search users, groups, and machine identities"
              emptyMessage={
                options.length
                  ? "No matches."
                  : "Nobody left to grant. Add them under Access Control first."
              }
              clearAriaLabel="Clear all grantees"
              modal
              onValueChange={(next) => setSelected([...next])}
              renderValue={(option) => {
                const Icon = KIND_ICON[option.kind];
                return (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Icon className="size-3.5 shrink-0 text-muted" />
                    <span className="truncate">{option.label}</span>
                  </span>
                );
              }}
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
                    <PendingInvitationBadge isPending={Boolean(option.isPendingInvitation)} />
                  </span>
                );
              }}
            />
          </FieldContent>
        </Field>

        <DialogFooter>
          <Button
            variant="av"
            isDisabled={!selected.length}
            isPending={addMembers.isPending}
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
