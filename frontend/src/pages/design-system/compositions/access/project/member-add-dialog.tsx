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

import { useAccess } from "../context";
import { displayName, type OrgMember, type ProjectMember } from "../model";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userLabel = (member: OrgMember) => displayName(member.user) ?? member.user.email;

export const AddMemberDialog = ({
  open,
  onOpenChange,
  prefill,
  openUserPicker
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: boolean;
  openUserPicker?: boolean;
}) => {
  const { data, update, saved } = useAccess();
  const [users, setUsers] = useState<string[]>(() => (prefill ? ["tom@acme.dev"] : []));
  const [roles, setRoles] = useState<string[]>([]);
  const [invited, setInvited] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  const projectUserIds = new Set(data.projectMembers.map((member) => member.userId));
  const available = data.orgMembers.filter(
    (member) => member.membership && !projectUserIds.has(member.user.id)
  );
  const known = useMemo(
    () => new Set(data.orgMembers.flatMap((member) => [member.user.email, member.user.username])),
    [data.orgMembers]
  );
  const options = [
    ...available.map((member) => ({ value: member.user.username, label: userLabel(member) })),
    ...invited.map((email) => ({ value: email, label: email }))
  ];

  const reset = () => {
    setUsers([]);
    setRoles([]);
    setInvited([]);
  };
  const close = () => {
    reset();
    onOpenChange(false);
  };

  const submit = () => {
    setPending(true);
    window.setTimeout(() => {
      const newOrgMembers: OrgMember[] = users
        .filter((username) => !known.has(username))
        .map((email) => ({
          user: { id: `u-${email}`, email, username: email },
          membership: {
            id: `m-${email}`,
            role: "member",
            isActive: true,
            status: "invited",
            createdAt: "Oct 30, 2026"
          },
          groups: []
        }));
      const orgMembers = [...data.orgMembers, ...newOrgMembers];
      const added: ProjectMember[] = users.flatMap((username) => {
        const member = orgMembers.find((item) => item.user.username === username);
        if (!member) return [];
        return [
          {
            id: `pm-${member.user.id}`,
            userId: member.user.id,
            roles: roles.map((role, index) => ({
              id: `pr-${member.user.id}-${index}`,
              role,
              isTemporary: false
            })),
            createdAt: "Oct 30, 2026"
          }
        ];
      });
      update((current) => ({
        ...current,
        orgMembers: [...current.orgMembers, ...newOrgMembers],
        projectMembers: [...current.projectMembers, ...added]
      }));
      setPending(false);
      saved("Successfully added user to the project");
      close();
    }, 500);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent
        onOpenAutoFocus={openUserPicker ? (event) => event.preventDefault() : undefined}
      >
        <DialogHeader>
          <DialogTitle>Add users to your project</DialogTitle>
          <DialogDescription>
            Users will receive an email with instructions to gain access.
          </DialogDescription>
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
              defaultOpen={openUserPicker}
              label="Invite users to project"
              placeholder="Add one or more users..."
              emptyText={
                available.length
                  ? "Invite new users to your organization by typing out their email address."
                  : "All organization members are already assigned to this project."
              }
              options={options}
              value={users}
              onChange={setUsers}
              onCreate={(query) => {
                const email = query.trim();
                if (!EMAIL.test(email) || known.has(email))
                  throw new Error("Enter an email address that isn't already in this organization");
                setInvited((current) => [...new Set([...current, email])]);
                setUsers((current) => [...new Set([...current, email])]);
              }}
            />
            <MultiSelect
              label="Select roles"
              placeholder="Select roles..."
              searchable
              defaultOpen={prefill}
              options={data.projectRoles.map((role) => ({
                value: role.slug,
                label: role.name,
                description: role.description
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
