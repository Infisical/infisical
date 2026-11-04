import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

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

type TCandidate = { value: string; label: string; email: string };

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

// The ?requesterEmail= link resolves against the candidate list (group-only members included); existing
// members are caught by requesterMatch. Both fetch a page since the search is a substring match.
export const InviteMembersDialog = ({ isOpen, onOpenChange }: Props) => {
  const { currentOrg } = useOrganization();
  const addMembers = useAddAgentVaultMembers();
  const navigate = useNavigate({ from: "" });
  const requesterEmail = useSearch({
    strict: false,
    select: (el) => (el as { requesterEmail?: string })?.requesterEmail
  });

  // A page, not one row: the search is a substring match, so another member can outrank the requester.
  // One buried under twenty still falls through, costing an add the server reports as already a member.
  const { data: requesterMatch } = useListAgentVaultMembers(
    { actorType: AgentVaultMemberType.User, search: requesterEmail, limit: 20 },
    Boolean(requesterEmail)
  );

  const [selected, setSelected] = useState<TCandidate[]>([]);
  const [role, setRole] = useState<string>(ProjectMembershipRole.Member);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);

  const { data: availableData, isFetching: isCandidatesFetching } =
    useListAvailableAgentVaultMembers(
      { actorType: AgentVaultMemberType.User, search: debouncedSearch.trim() || undefined },
      isOpen
    );
  const { data: requesterCandidates } = useListAvailableAgentVaultMembers(
    { actorType: AgentVaultMemberType.User, search: requesterEmail, limit: 20 },
    Boolean(requesterEmail)
  );

  const candidates = useMemo<TCandidate[]>(() => {
    return (availableData?.actors ?? []).map((actor) => {
      const name = `${actor.firstName ?? ""} ${actor.lastName ?? ""}`.trim();
      const email = actor.email || actor.username || "";
      return { value: actor.id, label: name || email, email };
    });
  }, [availableData]);

  const isCandidateListTruncated = (availableData?.totalCount ?? 0) > candidates.length;

  const memberUsernames = useMemo(
    () => new Set((requesterMatch?.members ?? []).map((member) => member.username)),
    [requesterMatch]
  );

  const requesterStatus = useMemo(() => {
    const requester = requesterEmail
      ? requesterCandidates?.actors.find(
          (actor) => actor.username === requesterEmail || actor.email === requesterEmail
        )
      : undefined;
    const name = `${requester?.firstName ?? ""} ${requester?.lastName ?? ""}`.trim();
    return {
      isProjectUser: Boolean(requesterEmail) && memberUsernames.has(requesterEmail as string),
      userLabel: name || requester?.email || requester?.username || "",
      userId: requester?.id
    };
  }, [requesterEmail, requesterCandidates, memberUsernames]);
  const requesterUserId = requesterStatus.userId;

  // Deps stay primitive on purpose: keying off the candidate list would re-run on any refetch and
  // re-select a requester the admin had just removed.
  useEffect(() => {
    if (!requesterEmail) return;
    // The org-user and project-user queries settle independently, so isProjectUser can flip true
    // after a preselect. Drop it rather than leave them chipped in under the "already has access"
    // warning, which would submit a no-op add.
    if (requesterStatus.isProjectUser) {
      setSelected([]);
      return;
    }
    if (!requesterUserId) return;
    setSelected([
      { value: requesterUserId, label: requesterStatus.userLabel, email: requesterEmail }
    ]);
  }, [requesterEmail, requesterUserId, requesterStatus.isProjectUser, requesterStatus.userLabel]);

  const clearRequesterEmail = () => {
    if (requesterEmail) navigate({ search: (prev) => ({ ...prev, requesterEmail: "" }) });
  };

  const handleClose = () => {
    setSelected([]);
    setRole(ProjectMembershipRole.Member);
    setSearch("");
    clearRequesterEmail();
    onOpenChange(false);
  };

  const handleAdd = () => {
    addMembers.mutate(
      {
        userIds: selected.map((candidate) => candidate.value),
        role
      },
      {
        onSuccess: ({ members, skipped }) => {
          const addedText = `${members.length} user${members.length === 1 ? "" : "s"} added`;
          createNotification({
            text: members.length
              ? `${addedText}${skipped.length ? `. ${skipped.length} already had access.` : ""}`
              : `${skipped.length === 1 ? "That user already has" : `All ${skipped.length} already have`} access to Agent Vault`,
            type: members.length ? "success" : "info"
          });
          handleClose();
        }
      }
    );
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
          <DialogTitle>Add Users</DialogTitle>
          <DialogDescription>Add existing members of {currentOrg.name}.</DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="agent-vault-invite-users">Users</FieldLabel>
          <FieldContent>
            <Combobox
              id="agent-vault-invite-users"
              multiple
              options={candidates}
              value={selected}
              isLoading={isCandidatesFetching}
              onSearchChange={setSearch}
              getOptionValue={(option) => option.value}
              getOptionLabel={(option) => option.label}
              placeholder="Pick users"
              searchPlaceholder="Search by name or email..."
              searchAriaLabel="Search users"
              emptyMessage={(inputValue) =>
                inputValue
                  ? "No one matches who is not already a member"
                  : "Everyone in the organization is already a member"
              }
              clearAriaLabel="Clear all users"
              modal
              onValueChange={(next) => setSelected([...next])}
            />
            {isCandidateListTruncated && (
              <FieldDescription>
                Search by name or email to find users that are not listed.
              </FieldDescription>
            )}
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel>Product Role</FieldLabel>
          <FieldContent>
            <ProductRoleField value={role} onChange={setRole} idPrefix="invite-role" />
          </FieldContent>
        </Field>

        {requesterEmail && requesterStatus.isProjectUser && (
          <Alert variant="danger">
            <AlertDescription>
              The requested user already has access to Agent Vault.
            </AlertDescription>
          </Alert>
        )}
        {requesterEmail && !requesterStatus.isProjectUser && requesterUserId && (
          <Alert>
            {/* AlertDescription is a grid, so a bare text node would land on its own row */}
            <AlertDescription>
              <span>
                Assign a role to give access to requesting user <b>{requesterStatus.userLabel}</b>.
              </span>
            </AlertDescription>
          </Alert>
        )}
        {requesterEmail && !requesterStatus.isProjectUser && !requesterUserId && (
          <Alert>
            <AlertDescription>
              <span>
                No member of {currentOrg.name} matches <b>{requesterEmail}</b>.
              </span>
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="av"
            isPending={addMembers.isPending}
            isDisabled={selected.length === 0}
            onClick={handleAdd}
          >
            Add Users
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
