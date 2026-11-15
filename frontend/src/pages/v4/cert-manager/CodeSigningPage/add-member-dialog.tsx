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

import { SignerMemberRole } from "@app/hooks/api/signers/types";

import { useV4Adapter } from "../../data/adapters";
import { SIGNER_MEMBER_KINDS, SIGNER_ROLE_OPTIONS, type SignerMemberKind } from "./signer-shared";

export type PickedSignerMembers = {
  kind: SignerMemberKind;
  members: { id: string; label: string }[];
  role: SignerMemberRole;
};

export const SignerAddMemberDialog = ({
  orgId,
  projectId,
  taken,
  excludeUserId,
  onSubmit,
  onClose
}: {
  orgId: string;
  projectId: string;
  taken: Set<string>;
  excludeUserId?: string;
  onSubmit: (picked: PickedSignerMembers) => Promise<void> | void;
  onClose: () => void;
}) => {
  const candidates = useV4Adapter("codeSigning").useMemberCandidates(orgId, projectId, true);
  const [kind, setKind] = useState<SignerMemberKind>("user");
  const [selected, setSelected] = useState<string[]>([]);
  const [role, setRole] = useState<SignerMemberRole>(SignerMemberRole.Operator);
  const [pending, setPending] = useState(false);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: selected.length > 0 || role !== SignerMemberRole.Operator,
    onDiscard: onClose
  });
  const pool = {
    user: candidates.users,
    identity: candidates.identities,
    group: candidates.groups
  }[kind];
  const options = (pool.data ?? []).filter(
    (option) =>
      !taken.has(`${kind}:${option.value}`) && !(kind === "user" && option.value === excludeUserId)
  );
  const current =
    SIGNER_MEMBER_KINDS.find((entry) => entry.value === kind) ?? SIGNER_MEMBER_KINDS[0];

  const submit = async () => {
    if (!selected.length) return;
    setPending(true);
    try {
      await onSubmit({
        kind,
        role,
        members: selected.map((id) => ({
          id,
          label: options.find((option) => option.value === id)?.label ?? id
        }))
      });
      onClose();
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && !pending && requestDiscard()}>
        <DialogContent pending={pending}>
          <DialogHeader>
            <DialogTitle>Add members</DialogTitle>
            <DialogDescription>
              Pick users, machine identities or groups, and the role they get on this signer.
            </DialogDescription>
          </DialogHeader>
          <form
            id="add-signer-members"
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
                tabs={SIGNER_MEMBER_KINDS.map(({ value, label }) => ({ value, label }))}
                onValueChange={(next) => {
                  setKind(next as SignerMemberKind);
                  setSelected([]);
                }}
              />
              <Field label={current.label}>
                <Combobox
                  multiple
                  label={current.label}
                  placeholder={`Select ${current.label.toLowerCase()}`}
                  emptyText={
                    pool.isPending
                      ? "Loading"
                      : `No ${current.label.toLowerCase()} left to add. They may already be members.`
                  }
                  options={options}
                  value={selected}
                  onValueChange={setSelected}
                />
              </Field>
              <Field label="Role">
                <Select
                  label="Role"
                  options={SIGNER_ROLE_OPTIONS}
                  value={role}
                  onChange={(next) => setRole(next as SignerMemberRole)}
                />
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
              form="add-signer-members"
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
        description="Your member selection and role will be lost."
      />
    </>
  );
};
