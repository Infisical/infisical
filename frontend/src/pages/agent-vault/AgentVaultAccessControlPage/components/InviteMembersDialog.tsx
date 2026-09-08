import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldLabel,
  FilterableSelect
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useRequesterEmail } from "@app/hooks";
import { useGetOrgUsers, useGetWorkspaceUsers } from "@app/hooks/api";
import { useAddAgentVaultProductUserMembers } from "@app/hooks/api/agentVault";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { getRequesterStatus } from "@app/lib/fn/requesterStatus";

import { ProductRoleField } from "./ProductRoleField";

type TCandidate = { value: string; label: string; email: string };

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const InviteMembersDialog = ({ isOpen, onOpenChange }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { data: orgUsers = [] } = useGetOrgUsers(currentOrg.id);
  const { data: projectUsers = [] } = useGetWorkspaceUsers(currentProject.id);
  const addMembers = useAddAgentVaultProductUserMembers();
  const navigate = useNavigate({ from: "" });
  const requesterEmail = useRequesterEmail();

  const [selected, setSelected] = useState<TCandidate[]>([]);
  const [role, setRole] = useState<string>(ProjectMembershipRole.Member);

  const candidates = useMemo(() => {
    const attached = new Set(projectUsers.map((member) => member.user.id));
    return orgUsers
      .filter((orgUser) => !attached.has(orgUser.user.id))
      .map((orgUser) => {
        const name = `${orgUser.user.firstName ?? ""} ${orgUser.user.lastName ?? ""}`.trim();
        const email = orgUser.user.email || orgUser.user.username || "";
        return { value: orgUser.user.id, label: name || email, email };
      });
  }, [orgUsers, projectUsers]);

  const memberUsernames = useMemo(
    () => new Set(projectUsers.map((member) => member.user.username)),
    [projectUsers]
  );

  const requesterStatus = useMemo(
    () => getRequesterStatus(requesterEmail, orgUsers, memberUsernames),
    [requesterEmail, orgUsers, memberUsernames]
  );
  const requesterUserId = requesterStatus.orgUser?.user.id;

  // Deps stay primitive on purpose: keying off the candidate list would re-run on any refetch and
  // re-select a requester the admin had just removed.
  useEffect(() => {
    if (!requesterEmail || !requesterUserId || requesterStatus.isProjectUser) return;
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
    clearRequesterEmail();
    onOpenChange(false);
  };

  const handleAdd = () => {
    addMembers.mutate(
      {
        projectId: currentProject.id,
        userIds: selected.map((candidate) => candidate.value),
        emails: [],
        role
      },
      {
        onSuccess: ({ addedCount }) => {
          createNotification({
            text: `${addedCount} user${addedCount === 1 ? "" : "s"} added`,
            type: "success"
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
        if (!open) clearRequesterEmail();
        onOpenChange(open);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Users</DialogTitle>
          <DialogDescription>Add existing members of {currentOrg.name}.</DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel>Users</FieldLabel>
          <FieldContent>
            <FilterableSelect
              isMulti
              value={selected}
              onChange={(value) => setSelected((value ?? []) as TCandidate[])}
              options={candidates}
              placeholder="Search by name or email..."
              getOptionLabel={(option) => option.label}
              getOptionValue={(option) => option.value}
            />
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
            <AlertDescription>Requested user already has access to Agent Vault.</AlertDescription>
          </Alert>
        )}
        {requesterEmail && !requesterStatus.isProjectUser && requesterStatus.orgUser && (
          <Alert>
            <AlertDescription>
              {/* AlertDescription is a grid, so a bare text node would land on its own row */}
              <span>
                Assign a role to provide access to requesting user{" "}
                <b>{requesterStatus.userLabel}</b>.
              </span>
            </AlertDescription>
          </Alert>
        )}
        {requesterEmail && !requesterStatus.isProjectUser && !requesterStatus.orgUser && (
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
