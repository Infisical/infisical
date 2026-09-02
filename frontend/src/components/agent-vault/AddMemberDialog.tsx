import { useEffect, useState } from "react";

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
  FieldLabel,
  Tabs,
  TabsList,
  TabsTrigger
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

type Option = { id: string; label: string };

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  accessBundleId: string;
  members: TAgentVaultMember[];
};

export const AddMemberDialog = ({ isOpen, onOpenChange, accessBundleId, members }: Props) => {
  const { currentProject } = useProject();
  const addMember = useAddAgentVaultAccessBundleMember();

  const [kind, setKind] = useState(MemberKind.User);
  const [selected, setSelected] = useState<Option | null>(null);

  useEffect(() => {
    if (isOpen) {
      setKind(MemberKind.User);
      setSelected(null);
    }
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
  const grantedIds = new Set(
    members.map((member) => member.userId ?? member.identityId ?? member.groupId)
  );

  let options: Option[] = [];
  if (kind === MemberKind.User) {
    options = (users ?? [])
      .map((membership) => ({
        id: membership.user.id,
        label:
          [membership.user.firstName, membership.user.lastName].filter(Boolean).join(" ") ||
          membership.user.username ||
          membership.user.email
      }))
      .filter((option) => !grantedIds.has(option.id));
  } else if (kind === MemberKind.Identity) {
    options = (identities ?? [])
      .map((identity) => ({ id: identity.id, label: identity.name }))
      .filter((option) => !grantedIds.has(option.id));
  } else {
    options = (groupMemberships ?? [])
      .map((membership) => ({ id: membership.group.id, label: membership.group.name }))
      .filter((option) => !grantedIds.has(option.id));
  }

  const handleAdd = async () => {
    if (!selected) return;

    await addMember.mutateAsync({
      accessBundleId,
      ...(kind === MemberKind.User && { userId: selected.id }),
      ...(kind === MemberKind.Identity && { identityId: selected.id }),
      ...(kind === MemberKind.Group && { groupId: selected.id })
    });
    createNotification({ text: `Access bundle granted to "${selected.label}"`, type: "success" });
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant Access Bundle</DialogTitle>
          <DialogDescription>
            Whoever holds this bundle can mint a session over it. They must already be a member of
            Agent Vault.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Tabs
            value={kind}
            onValueChange={(value) => {
              setKind(value as MemberKind);
              setSelected(null);
            }}
          >
            <TabsList variant="av" aria-label="Member type">
              <TabsTrigger value={MemberKind.User}>User</TabsTrigger>
              <TabsTrigger value={MemberKind.Identity}>Machine Identity</TabsTrigger>
              <TabsTrigger value={MemberKind.Group}>Group</TabsTrigger>
            </TabsList>
          </Tabs>

          <Field>
            <FieldLabel>Grant To</FieldLabel>
            <FieldContent>
              <Combobox
                options={options}
                value={selected}
                getOptionValue={(option) => option.id}
                getOptionLabel={(option) => option.label}
                placeholder="Select"
                searchPlaceholder="Search..."
                emptyMessage="Nobody left to grant. Add them under Access Control first."
                onValueChange={setSelected}
              />
            </FieldContent>
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="av"
            isDisabled={!selected}
            isPending={addMember.isPending}
            onClick={async () => handleAdd()}
          >
            Grant Access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
