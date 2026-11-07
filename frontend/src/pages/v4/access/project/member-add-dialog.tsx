import { useMemo, useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { Combobox } from "@app/components/v4/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Stack } from "@app/components/v4/ui/layout";
import { MultiSelect } from "@app/components/v4/ui/multi-select";
import {
  OrgPermissionMemberActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { isValidEmail, normalizeEmail } from "@app/helpers/email";
import { ProjectVersion } from "@app/hooks/api/projects/types";

import { useV4Adapter } from "../../data/adapters";
import { useOrgId, useOrgPermission } from "../permissions";
import { failed, saved } from "../toast";
import { personName, useMemberRoleAccess } from "./member-access";
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
  const members = access.useProjectUsers(projectId);
  const availableUsers = access.useAvailableProjectUsers(projectId, scope.projectType);
  const project = access.useProject(projectId);
  const { assignable } = useMemberRoleAccess(projectId);
  const addUsers = access.useAddProjectUsers();
  const [users, setUsers] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [invited, setInvited] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  const canInvite = orgPermission.can(
    OrgPermissionMemberActions.Create,
    OrgPermissionSubjects.Member
  );
  const available = useMemo(() => availableUsers.data ?? [], [availableUsers.data]);
  const known = useMemo(
    () =>
      new Set([
        ...(members.data ?? []).flatMap((member) => [member.user.username, member.user.email]),
        ...available.flatMap((user) => [user.username, user.email])
      ]),
    [members.data, available]
  );
  const options = [
    ...available.map((user) => ({
      value: user.username,
      label: personName(user) ?? user.email ?? user.username
    })),
    ...invited.map((email) => ({ value: email, label: email }))
  ];

  let emptyText = "All organization members are already assigned to this project.";
  if (available.length)
    emptyText = canInvite
      ? "Invite new users to your organization by typing out their email address."
      : "No users match your search";

  const close = () => {
    setUsers([]);
    setRoles([]);
    setInvited([]);
    onOpenChange(false);
  };

  const submit = async () => {
    if (project.data?.version === ProjectVersion.V1) {
      failed("Please upgrade your project to invite new members to the project.");
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
      saved("Successfully added user to the project");
      close();
    } catch (error) {
      failed("Failed to add users to the project", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Add users to your project</DialogTitle>
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
            <Combobox
              multiple
              label="Invite users to project"
              placeholder="Add one or more users..."
              disabled={availableUsers.isPending}
              emptyText={emptyText}
              options={options}
              value={users}
              onChange={setUsers}
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
            disabled={!users.length || !roles.length}
          >
            Add members
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
