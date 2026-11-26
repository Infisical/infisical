import { useMemo, useState } from "react";
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
import { Stack } from "@infisical/cipher/ui/layout";
import { MultiSelect } from "@infisical/cipher/ui/multi-select";
import { useNavigate, useSearch } from "@tanstack/react-router";

import {
  OrgPermissionMemberActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import {
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { isValidEmail, normalizeEmail } from "@app/helpers/email";
import { ProjectVersion } from "@app/hooks/api/projects/types";

import { useV4Adapter } from "../../data/adapters";
import { useOrgId, useOrgPermission, useProjectPermission } from "../permissions";
import { failed, saved } from "../toast";
import { personName, useMemberRoleAccess } from "./member-access";
import { accessNoun, accessThe, accessThis } from "./product";
import { useProjectScope } from "./scope";

export const AddMemberDialog = ({
  projectId,
  open,
  onOpenChange
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const orgId = useOrgId();
  const scope = useProjectScope();
  const access = useV4Adapter("access");
  const { permission: orgPermission } = useOrgPermission();
  const { permission: projectPermission } = useProjectPermission(projectId);
  const members = access.useProjectUsers(projectId);
  const availableUsers = access.useAvailableProjectUsers(projectId, scope.projectType);
  const orgUsers = access.useOrgUsers(orgId, {
    enabled: orgPermission.can(OrgPermissionMemberActions.Read, OrgPermissionSubjects.Member)
  });
  const project = access.useProject(projectId);
  const { assignable } = useMemberRoleAccess(projectId);
  const addUsers = access.useAddProjectUsers();
  const navigate = useNavigate();
  const requesterEmail = useSearch({
    strict: false,
    select: (search) => (search as { requesterEmail?: string }).requesterEmail
  });
  const [picked, setPicked] = useState<string[]>();
  const [roles, setRoles] = useState<string[]>([]);
  const [invited, setInvited] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  const canAdd = projectPermission.can(
    ProjectPermissionMemberActions.Create,
    ProjectPermissionSub.Member
  );
  const loadFailed = Boolean(members.error || availableUsers.error);
  const canInvite = orgPermission.can(
    OrgPermissionMemberActions.Create,
    OrgPermissionSubjects.Member
  );
  const available = useMemo(() => availableUsers.data ?? [], [availableUsers.data]);
  const requester = requesterEmail
    ? available.find((user) => user.username === requesterEmail)
    : undefined;
  const isRequesterMember = Boolean(
    requesterEmail && members.data?.some((member) => member.user.username === requesterEmail)
  );
  const users = picked ?? (requester && !isRequesterMember ? [requester.username] : []);
  const setUsers = (next: string[] | ((current: string[]) => string[])) =>
    setPicked(typeof next === "function" ? next(users) : next);
  const known = useMemo(
    () =>
      new Set([
        ...(members.data ?? []).flatMap((member) => [member.user.username, member.user.email]),
        ...available.flatMap((user) => [user.username, user.email]),
        ...(orgUsers.data ?? []).flatMap(({ user, membership }) => [
          user.username,
          user.email,
          membership?.inviteEmail
        ])
      ]),
    [members.data, available, orgUsers.data]
  );
  const options = [
    ...available.map((user) => ({
      value: user.username,
      label: personName(user) ?? user.email ?? user.username
    })),
    ...invited.map((email) => ({ value: email, label: email }))
  ];

  let emptyText = `All organization members are already assigned to ${accessThis(scope.projectType)}.`;
  if (available.length)
    emptyText = canInvite
      ? "Invite new users to your organization by typing out their email address."
      : "No users match your search";

  const close = () => {
    setPicked(undefined);
    if (requesterEmail)
      navigate({
        to: ".",
        search: (prev: object) => ({ ...prev, requesterEmail: "" }),
        replace: true
      });
    setRoles([]);
    setInvited([]);
    onOpenChange(false);
  };

  const submit = async () => {
    if (!canAdd || loadFailed) return;
    if (project.data?.version === ProjectVersion.V1) {
      failed(
        `Please upgrade ${accessThe(scope.projectType)} to invite new members to ${accessThe(scope.projectType)}.`
      );
      return;
    }
    setPending(true);
    try {
      await addUsers.mutateAsync({
        usernames: users,
        orgId,
        projectId,
        projectType: scope.projectType,
        roleSlugs: roles
      });
      saved(`Successfully added user to ${accessThe(scope.projectType)}`);
      close();
    } catch (error) {
      failed(`Failed to add users to ${accessThe(scope.projectType)}`, error);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>{`Add users to ${accessThe(scope.projectType)}`}</DialogTitle>
          <DialogDescription>Users get an email with instructions to join.</DialogDescription>
        </DialogHeader>
        <form
          id="add-project-members"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Stack gap={16}>
            {!canAdd && (
              <Alert
                tone="warn"
                title="Permission required"
              >{`You don't have permission to add users to ${accessThis(scope.projectType)}.`}</Alert>
            )}
            {loadFailed && (
              <Alert tone="bad" title="Could not load member options">
                Refresh the page to try again.
              </Alert>
            )}
            {isRequesterMember && (
              <Alert
                tone="bad"
                title={`The requested user is already part of ${accessThe(scope.projectType)}`}
              />
            )}
            {requester && !isRequesterMember && (
              <Alert
                tone="info"
                title={`Assign a role to give ${personName(requester) ?? requester.email ?? requester.username} access`}
              />
            )}
            <Combobox
              multiple
              label={`Invite users to ${accessNoun(scope.projectType)}`}
              placeholder="Add one or more users..."
              disabled={availableUsers.isPending}
              emptyText={emptyText}
              options={options}
              value={users}
              onChange={setUsers}
              createLabel={(query) => `Invite ${query}`}
              onCreate={
                canInvite
                  ? (query) => {
                      const email = normalizeEmail(query);
                      if (!isValidEmail(email) || known.has(email))
                        throw new Error(
                          "Enter an email address that isn't already in this organization"
                        );
                      setInvited((current) => [...new Set([...current, email])]);
                      setUsers((current) => [...new Set([...current, email])]);
                    }
                  : undefined
              }
            />
            <MultiSelect
              label="Select roles"
              placeholder="Select roles..."
              searchable
              options={assignable.map((role) => ({
                value: role.slug,
                label: role.name,
                description: role.description ?? undefined
              }))}
              value={roles}
              onChange={setRoles}
            />
          </Stack>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="add-project-members"
            loading={pending}
            disabled={!canAdd || loadFailed || !users.length || !roles.length}
          >
            Add members
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
