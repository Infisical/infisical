import { useEffect, useMemo, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
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
import { useNavigate, useSearch } from "@tanstack/react-router";

import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";

import { useV4Adapter } from "../../../data/adapters";
import { failed, saved, toast } from "../../toast";
import { DEFAULT_PRODUCT_ROLE, memberDisplayName, ProductRoleField } from "./shared";

const CANDIDATE_LIMIT = 100;
const REQUESTER_LIMIT = 20;

export const InviteMembersDialog = ({
  projectId,
  open,
  onOpenChange
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const av = useV4Adapter("agentVault");
  const addMembers = av.useAddMembers(projectId);
  const navigate = useNavigate();
  const requesterEmail = useSearch({
    strict: false,
    select: (search) => (search as { requesterEmail?: string }).requesterEmail
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [role, setRole] = useState<string>(DEFAULT_PRODUCT_ROLE);
  const [pending, setPending] = useState(false);

  const { data: requesterMatch } = av.useMembers(
    projectId,
    { actorType: AgentVaultMemberType.User, search: requesterEmail, limit: REQUESTER_LIMIT },
    Boolean(requesterEmail)
  );
  const { data: available, isPending: loadingCandidates } = av.useAvailableMembers(
    projectId,
    { actorType: AgentVaultMemberType.User, limit: CANDIDATE_LIMIT },
    open
  );
  const { data: requesterCandidates } = av.useAvailableMembers(
    projectId,
    { actorType: AgentVaultMemberType.User, search: requesterEmail, limit: REQUESTER_LIMIT },
    Boolean(requesterEmail)
  );

  const requester = requesterEmail
    ? requesterCandidates?.actors.find(
        (actor) => actor.username === requesterEmail || actor.email === requesterEmail
      )
    : undefined;
  const requesterLabel = requester ? memberDisplayName(requester) : "";
  const requesterUserId = requester?.id;
  const isRequesterMember = Boolean(
    requesterEmail && requesterMatch?.members.some((member) => member.username === requesterEmail)
  );

  const options = useMemo(() => {
    const actors = [...(available?.actors ?? [])];
    if (requester && !actors.some((actor) => actor.id === requester.id)) actors.push(requester);
    return actors.map((actor) => ({
      value: actor.id,
      label: memberDisplayName(actor),
      meta: actor.email || actor.username
    }));
  }, [available, requester]);
  const truncated = (available?.totalCount ?? 0) > (available?.actors.length ?? 0);

  useEffect(() => {
    if (!requesterEmail) return;
    if (isRequesterMember) {
      setSelected([]);
      return;
    }
    if (requesterUserId) setSelected([requesterUserId]);
  }, [requesterEmail, requesterUserId, isRequesterMember]);

  const close = () => {
    setSelected([]);
    setRole(DEFAULT_PRODUCT_ROLE);
    if (requesterEmail)
      navigate({
        to: ".",
        search: (prev: object) => ({ ...prev, requesterEmail: "" }),
        replace: true
      });
    onOpenChange(false);
  };

  const submit = async () => {
    setPending(true);
    try {
      const { members, skipped } = await addMembers.mutateAsync({ userIds: selected, role });
      if (members.length) {
        saved(
          `${members.length} user${members.length === 1 ? "" : "s"} added${skipped.length ? `. ${skipped.length} already had access.` : ""}`
        );
      } else {
        toast({
          title:
            skipped.length === 1
              ? "That user already has access to this project"
              : `All ${skipped.length} already have access to this project`
        });
      }
      close();
    } catch (error) {
      failed("Failed to add users", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Add users</DialogTitle>
          <DialogDescription>Add existing members of your organization.</DialogDescription>
        </DialogHeader>
        <form
          id="add-agent-vault-users"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Stack gap={16}>
            <Field
              label="Users"
              description={truncated ? `Showing the first ${CANDIDATE_LIMIT} users.` : undefined}
            >
              <Combobox
                multiple
                label="Users"
                placeholder="Pick users..."
                disabled={loadingCandidates}
                emptyText="No one matches who is not already a member"
                options={options}
                value={selected}
                onChange={setSelected}
              />
            </Field>
            <ProductRoleField value={role} onChange={setRole} idPrefix="invite-role" />
            {requesterEmail && isRequesterMember && (
              <Alert tone="bad">The requested user already has access to this project.</Alert>
            )}
            {requesterEmail && !isRequesterMember && requesterUserId && (
              <Alert>{`Assign a role to give access to requesting user ${requesterLabel}.`}</Alert>
            )}
            {requesterEmail && !isRequesterMember && !requesterUserId && (
              <Alert>{`No member of your organization matches ${requesterEmail}.`}</Alert>
            )}
          </Stack>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="add-agent-vault-users"
            loading={pending}
            disabled={!selected.length}
          >
            Add users
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
