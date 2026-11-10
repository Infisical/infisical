import { useEffect, useMemo, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { PencilIcon, UserXIcon } from "lucide-react";

import { FilterBar } from "@app/components/v4/patterns/filter-bar";
import { Alert } from "@app/components/v4/ui/alert";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Combobox } from "@app/components/v4/ui/combobox";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { RowLink } from "@app/components/v4/ui/row-link";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import {
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import type { TWorkspaceUser } from "@app/hooks/api/users/types";

import { useV4Adapter } from "../../../data/adapters";
import { useV4Session } from "../../../data/session/contract";
import { accessLinks } from "../../links";
import { useGo } from "../../navigation";
import { useProjectPermission } from "../../permissions";
import { personName } from "../../project/member-access";
import { useProjectScope } from "../../project/scope";
import { failed, saved } from "../../toast";
import { Gate, Muted, RESTRICTED, RoleBadges, usePagedList } from "../../ui";
import { ProductRemoveDialog, ProductRoleDialog, ProductRoleField } from "./product-dialogs";

const SELF_REASON = "You cannot modify your own membership";

const displayName = (member: TWorkspaceUser) =>
  personName(member.user) ?? (member.user.username || member.inviteEmail);

const AddMemberDialog = ({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const go = useGo();
  const scope = useProjectScope();
  const { projectId } = scope;
  const access = useV4Adapter("access");
  const addUsers = useV4Adapter("pam").useAddProductUserMember();
  const members = access.useProjectUsers(projectId);
  const candidates = access.useAvailableProjectUsers(projectId, scope.projectType);
  const requesterEmail = useSearch({
    strict: false,
    select: (search) => (search as { requesterEmail?: string })?.requesterEmail
  });
  const [users, setUsers] = useState<string[]>([]);
  const [role, setRole] = useState<string>(ProjectMembershipRole.Member);
  const [pending, setPending] = useState(false);

  const available = useMemo(() => candidates.data ?? [], [candidates.data]);
  const requesterIsMember = Boolean(
    requesterEmail && members.data?.some((member) => member.user.username === requesterEmail)
  );
  const requester = requesterEmail
    ? available.find((user) => user.username === requesterEmail)
    : undefined;
  const requesterId = requester?.id;

  useEffect(() => {
    if (requesterId && !requesterIsMember) setUsers([requesterId]);
  }, [requesterId, requesterIsMember]);

  const close = () => {
    setUsers([]);
    setRole(ProjectMembershipRole.Member);
    if (requesterEmail) go(accessLinks.project(scope));
    onOpenChange(false);
  };

  const submit = async () => {
    setPending(true);
    try {
      await addUsers.mutateAsync({ userIds: users, role, projectId });
      saved(`Successfully added ${users.length === 1 ? "member" : "members"}`);
      close();
    } catch (error) {
      failed("Failed to add members", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Add members</DialogTitle>
        </DialogHeader>
        <form
          id="add-pam-members"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Stack gap={16}>
            <Field label="Users">
              <Combobox
                multiple
                label="Users"
                placeholder="Select one or more users..."
                disabled={candidates.isPending}
                emptyText="All organization members have already been added."
                options={available.map((user) => ({
                  value: user.id,
                  label: personName(user) ?? user.email ?? user.username
                }))}
                value={users}
                onChange={setUsers}
              />
            </Field>
            <Field label="Product role">
              <ProductRoleField id="pam-add-member-role" value={role} onChange={setRole} />
            </Field>
            {requesterEmail && requesterIsMember && (
              <Alert tone="bad">Requested user is already a member of this product.</Alert>
            )}
            {requesterEmail && !requesterIsMember && requester && (
              <Alert tone="info">
                {`Assign a role to give ${personName(requester) ?? requester.email ?? requester.username} access.`}
              </Alert>
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
            form="add-pam-members"
            loading={pending}
            disabled={!users.length}
          >
            {users.length > 1 ? "Add members" : "Add member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const PamMembersTab = () => {
  const go = useGo();
  const scope = useProjectScope();
  const { projectId } = scope;
  const pam = useV4Adapter("pam");
  const session = useV4Session();
  const { permission } = useProjectPermission(projectId);
  const members = useV4Adapter("access").useProjectUsers(projectId);
  const removeMember = pam.useRemoveProductUserMember();
  const updateMember = pam.useUpdateProductUserMember();
  const requesterEmail = useSearch({
    strict: false,
    select: (search) => (search as { requesterEmail?: string })?.requesterEmail
  });
  const [adding, setAdding] = useState(Boolean(requesterEmail));
  const [editing, setEditing] = useState<TWorkspaceUser>();
  const [removing, setRemoving] = useState<TWorkspaceUser>();

  useEffect(() => {
    if (requesterEmail) setAdding(true);
  }, [requesterEmail]);

  const canCreate = permission.can(
    ProjectPermissionMemberActions.Create,
    ProjectPermissionSub.Member
  );
  const canEdit = permission.can(ProjectPermissionMemberActions.Edit, ProjectPermissionSub.Member);
  const canDelete = permission.can(
    ProjectPermissionMemberActions.Delete,
    ProjectPermissionSub.Member
  );
  const isSelf = (member: TWorkspaceUser) => member.user.email === session.user.email;

  const rows = useMemo(() => members.data ?? [], [members.data]);
  const list = usePagedList({
    rows,
    initialSort: { columnId: "name", direction: "asc" },
    matches: (member, needle) =>
      [
        member.user.firstName,
        member.user.lastName,
        member.user.username,
        member.user.email,
        member.inviteEmail
      ].some((value) => value?.toLowerCase().includes(needle)),
    compare: (a, b, column) => {
      const value = (member: TWorkspaceUser) =>
        (column === "email" ? member.user.email : displayName(member))?.toLowerCase();
      const [left, right] = [value(a), value(b)];
      if (!left) return 1;
      if (!right) return -1;
      return left.localeCompare(right);
    }
  });

  const columns: DataTableColumn<TWorkspaceUser>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      grow: true,
      render: (member) => (
        <RowLink
          {...go.link(accessLinks.projectMember(scope, member.id))}
          title={displayName(member) ?? undefined}
        >
          {displayName(member) ?? <Muted>-</Muted>}
          {member.user.isOrgMembershipPending && (
            <Tooltip content="Access begins once they accept their organization invitation.">
              <Badge tone="outline">Pending invitation</Badge>
            </Tooltip>
          )}
        </RowLink>
      )
    },
    {
      id: "email",
      header: "Email",
      sortable: true,
      grow: true,
      render: (member) => (
        <span>{member.user.email || member.inviteEmail || member.user.username}</span>
      )
    },
    {
      id: "role",
      header: "Product role",
      render: (member) => <RoleBadges roles={member.roles} />
    }
  ];

  const rowActions: DataTableRowActions<TWorkspaceUser> = {
    menuDisabledReason: (member) => (isSelf(member) ? SELF_REASON : undefined),
    renderMenu: (member) => (
      <>
        <DropdownMenuItem
          disabled={!canEdit}
          description={canEdit ? undefined : RESTRICTED}
          onSelect={() => setEditing(member)}
        >
          <Icon icon={PencilIcon} />
          Edit product role
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={!canDelete}
          description={canDelete ? undefined : RESTRICTED}
          onSelect={() => setRemoving(member)}
        >
          <Icon icon={UserXIcon} />
          Remove member
        </DropdownMenuItem>
      </>
    )
  };

  const remove = async () => {
    const member = removing;
    setRemoving(undefined);
    if (!member) return;
    try {
      await removeMember.mutateAsync({ projectId, userId: member.user.id });
      saved("Member removed");
    } catch (error) {
      failed("Failed to remove member", error);
    }
  };

  return (
    <Stack gap={16}>
      <FilterBar
        label="Member filters"
        fields={[]}
        value={[]}
        onChange={() => undefined}
        search={
          <Input
            icon="search"
            aria-label="Search members..."
            placeholder="Search members..."
            value={list.search}
            onChange={(event) => list.setSearch(event.target.value)}
          />
        }
        actions={
          <Gate allowed={canCreate} reason="You don't have permission to add members">
            <Button
              variant="accent"
              icon="user-plus"
              disabled={!canCreate}
              onClick={() => setAdding(true)}
            >
              Add member
            </Button>
          </Gate>
        }
      />
      <DataTable
        label="Members"
        rows={list.pageRows}
        columns={columns}
        rowActions={rowActions}
        getRowId={(member) => member.id}
        rowLabel={(member) => displayName(member) ?? member.id}
        loading={members.isPending}
        loadingRows={10}
        sort={list.sort}
        onSortChange={list.setSort}
        empty={
          list.search.trim() ? (
            <EmptyState size="sm" icon="search" title="No members match search" />
          ) : (
            <EmptyState size="sm" icon="user" title="No members found" />
          )
        }
        pagination={members.isPending ? undefined : list.pagination}
      />
      <AddMemberDialog open={adding} onOpenChange={setAdding} />
      <ProductRoleDialog
        key={editing?.id}
        open={Boolean(editing)}
        onOpenChange={(next) => !next && setEditing(undefined)}
        name={editing ? (displayName(editing) ?? "this member") : ""}
        currentRole={editing?.roles[0]?.role ?? ProjectMembershipRole.Member}
        onSave={(role) =>
          updateMember.mutateAsync({ projectId, userId: editing?.user.id ?? "", role })
        }
        successMessage="Role updated"
        failureMessage="Failed to update role"
      />
      <ProductRemoveDialog
        open={Boolean(removing)}
        onOpenChange={(next) => !next && setRemoving(undefined)}
        title={`Remove ${removing ? (displayName(removing) ?? "this member") : ""}?`}
        description="They lose their access to this product."
        confirmText="remove"
        actionLabel="Remove member"
        onConfirm={remove}
      />
    </Stack>
  );
};
