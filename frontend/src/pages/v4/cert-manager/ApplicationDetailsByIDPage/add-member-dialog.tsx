import { useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Combobox } from "@infisical/cipher/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { Tabs } from "@infisical/cipher/ui/tabs";

import type {
  TPkiApplicationMember,
  TPkiApplicationMemberKind
} from "@app/hooks/api/pkiApplications/types";

import { failed, saved, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { APP_ROLES } from "./shared";

const kinds: { value: TPkiApplicationMemberKind; label: string; empty: string }[] = [
  {
    value: "user",
    label: "Users",
    empty: "No matching users. Grant users access from Access Control first."
  },
  {
    value: "identity",
    label: "Machine identities",
    empty: "No matching machine identities. Grant them access from Access Control first."
  },
  {
    value: "group",
    label: "Groups",
    empty: "No matching groups. Grant groups access from Access Control first."
  }
];

const memberKey = (member: TPkiApplicationMember) => {
  if (member.actorUserId) return `user:${member.actorUserId}`;
  if (member.actorIdentityId) return `identity:${member.actorIdentityId}`;
  if (member.actorGroupId) return `group:${member.actorGroupId}`;
  return "";
};

export const AddMemberDialog = ({
  projectId,
  applicationId,
  existingMembers,
  onClose
}: {
  projectId: string;
  applicationId: string;
  existingMembers: TPkiApplicationMember[];
  onClose: () => void;
}) => {
  const adapter = useV4Adapter("pkiApplications");
  const candidates = adapter.useMemberCandidates(projectId, true);
  const addMember = adapter.useAddMember();
  const addUsers = adapter.useAddUserMembers();
  const [kind, setKind] = useState<TPkiApplicationMemberKind>("user");
  const [selected, setSelected] = useState<string[]>([]);
  const [role, setRole] = useState("operator");
  const [pending, setPending] = useState(false);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: selected.length > 0 || role !== "operator",
    onDiscard: onClose
  });

  const taken = new Set(existingMembers.map(memberKey));
  const pool = {
    user: candidates.users,
    identity: candidates.identities,
    group: candidates.groups
  }[kind];
  const options = (pool.data ?? []).filter((option) => !taken.has(`${kind}:${option.value}`));
  const current = kinds.find((entry) => entry.value === kind) ?? kinds[0];

  const submit = async () => {
    if (!selected.length) return;
    setPending(true);
    try {
      if (kind === "user") {
        const result = await addUsers.mutateAsync({
          applicationId,
          userIds: selected,
          emails: [],
          role
        });
        if (result.unresolved.length) {
          const names = result.unresolved.map(
            (id) => options.find((option) => option.value === id)?.label ?? id
          );
          toast({
            tone: "bad",
            title: `Couldn't add ${names.join(", ")}`,
            description: "Grant them access from Access Control, then try again."
          });
        }
      } else {
        await selected.reduce<Promise<unknown>>(
          (previous, memberId) =>
            previous.then(() => addMember.mutateAsync({ applicationId, kind, memberId, role })),
          Promise.resolve()
        );
      }
      saved(selected.length === 1 ? "Member added" : "Members added");
      onClose();
    } catch (error) {
      failed("Failed to add members", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && requestDiscard()}>
        <DialogContent pending={pending}>
          <DialogHeader>
            <DialogTitle>Add members</DialogTitle>
            <DialogDescription>
              Only users, machine identities and groups that already have access to Certificate
              Manager can be added.
            </DialogDescription>
          </DialogHeader>
          <form
            id="add-application-members"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Stack gap={16}>
              <Tabs
                variant="segmented"
                width="full"
                label="Member type"
                value={kind}
                tabs={kinds.map(({ value, label }) => ({ value, label }))}
                onValueChange={(next) => {
                  setKind(next as TPkiApplicationMemberKind);
                  setSelected([]);
                }}
              />
              <Field label={current.label}>
                <Combobox
                  multiple
                  label={current.label}
                  placeholder={`Select ${current.label.toLowerCase()}`}
                  emptyText={pool.isPending ? "Loading" : current.empty}
                  options={options}
                  value={selected}
                  onValueChange={setSelected}
                />
              </Field>
              <Field label="Role">
                <Select label="Role" options={APP_ROLES} value={role} onChange={setRole} />
              </Field>
            </Stack>
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={requestDiscard} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="add-application-members"
              loading={pending}
              disabledReason={
                selected.length ? undefined : `Select ${current.label.toLowerCase()} to add`
              }
            >
              {selected.length > 1 ? `Add ${selected.length} members` : "Add member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="Your pending member selection will be lost."
      />
    </>
  );
};
