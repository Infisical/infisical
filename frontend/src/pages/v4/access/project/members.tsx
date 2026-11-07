import { useMemo, useState } from "react";
import { subject } from "@casl/ability";
import { UserXIcon } from "lucide-react";

import { FilterBar, type FilterBarFilter } from "@app/components/v4/patterns/filter-bar";
import { Button } from "@app/components/v4/ui/button";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { RowLink } from "@app/components/v4/ui/row-link";
import {
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { supportsAssumePrivileges } from "@app/helpers/project";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import type { TWorkspaceUser } from "@app/hooks/api/users/types";

import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { useProjectPermission } from "../permissions";
import { failed, saved } from "../toast";
import { Gate, Muted, RESTRICTED, RoleBadges, usePagedList } from "../ui";
import { personName, useMemberRoleAccess } from "./member-access";
import { AddMemberDialog } from "./member-add-dialog";
import { type AssumeTarget, AssumePrivilegesDialog, RemoveMemberDialog } from "./member-dialogs";
import { useProjectScope } from "./scope";

const SELF_REASON = "You cannot modify your own membership";

export const ProjectMembersTab = () => {
  const go = useGo();
  const scope = useProjectScope();
  const { orgId, projectId } = scope;
  const access = useV4Adapter("access");
  const session = useV4Session();
  const { permission } = useProjectPermission(projectId);
  const { roles } = useMemberRoleAccess(projectId);
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const roleFilter = useMemo(
    () => filters.find((filter) => filter.field === "role")?.values ?? [],
    [filters]
  );

  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TWorkspaceUser>();
  const [assuming, setAssuming] = useState<AssumeTarget>();
  const members = access.useProjectUsers(
    projectId,
    undefined,
    roleFilter.length ? roleFilter : undefined
  );
  const removeUsers = access.useRemoveProjectUsers();

  const canCreate = permission.can(
    ProjectPermissionMemberActions.Create,
    ProjectPermissionSub.Member
  );
  const canDelete = permission.can(
    ProjectPermissionMemberActions.Delete,
    ProjectPermissionSub.Member
  );
  const canAssume = (member: TWorkspaceUser) =>
    supportsAssumePrivileges(scope.projectType) &&
    permission.can(
      ProjectPermissionMemberActions.AssumePrivileges,
      subject(ProjectPermissionSub.Member, { userEmail: member.user.email })
    );
  const isSelf = (member: TWorkspaceUser) => member.user.email === session.user.email;

  const rows = useMemo(() => members.data ?? [], [members.data]);
  const list = usePagedList({
    rows,
    initialSort: { columnId: "name", direction: "asc" },
    matches: (member, needle) =>
      [member.user.firstName, member.user.lastName, member.user.username, member.user.email].some(
        (value) => value?.toLowerCase().includes(needle)
      ),
    compare: (a, b, column) => {
      const value = (member: TWorkspaceUser) =>
        (column === "email" ? member.user.email : member.user.firstName)?.toLowerCase();
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
          title={personName(member.user) ?? undefined}
        >
          {personName(member.user) ?? <Muted>-</Muted>}
        </RowLink>
      )
    },
    {
      id: "email",
      header: "Email",
      sortable: true,
      grow: true,
      render: (member) => <span>{member.user.email}</span>
    },
    {
      id: "role",
      header: "Project role",
      render: (member) => <RoleBadges roles={member.roles} />
    }
  ];

  const rowActions: DataTableRowActions<TWorkspaceUser> = {
    menuDisabledReason: (member) => (isSelf(member) ? SELF_REASON : undefined),
    renderMenu: (member) => (
      <>
        <DropdownMenuItem
          disabled={!canAssume(member)}
          onSelect={() => setAssuming({ id: member.user.id, type: ActorType.USER })}
        >
          <Icon name="user" />
          Assume privileges
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={!canDelete}
          description={canDelete ? undefined : RESTRICTED}
          onSelect={() => setRemoving(member)}
        >
          <Icon icon={UserXIcon} />
          Remove user from project
        </DropdownMenuItem>
      </>
    )
  };

  const searching = Boolean(list.search.trim() || roleFilter.length);

  const remove = async () => {
    const member = removing;
    setRemoving(undefined);
    if (!member) return;
    try {
      await removeUsers.mutateAsync({
        orgId,
        usernames: [member.user.username],
        projectId,
        projectType: scope.projectType
      });
      saved("Successfully removed user from project");
    } catch (error) {
      failed("Failed to remove user from project", error);
    }
  };

  return (
    <Stack gap={16}>
      <FilterBar
        label="Project user filters"
        fields={[
          {
            key: "role",
            label: "Project role",
            type: "multi-select",
            options: roles.map((role) => ({ value: role.slug, label: role.name }))
          }
        ]}
        value={filters}
        onChange={(next) => {
          setFilters(next);
          list.resetPage();
        }}
        search={
          <Input
            icon="search"
            aria-label="Search project users..."
            placeholder="Search project users..."
            value={list.search}
            onChange={(event) => list.setSearch(event.target.value)}
          />
        }
        actions={
          <Gate allowed={canCreate} reason="You don't have permission to add users to this project">
            <Button
              variant="accent"
              icon="user-plus"
              disabled={!canCreate}
              onClick={() => setAdding(true)}
            >
              Add users to project
            </Button>
          </Gate>
        }
      />
      <DataTable
        label="Project users"
        rows={list.pageRows}
        columns={columns}
        rowActions={rowActions}
        getRowId={(member) => member.id}
        rowLabel={(member) => member.user.email}
        loading={members.isPending}
        loadingRows={10}
        sort={list.sort}
        onSortChange={list.setSort}
        empty={
          searching ? (
            <EmptyState size="sm" icon="search" title="No project users match search" />
          ) : (
            <EmptyState size="sm" icon="user" title="No project users found" />
          )
        }
        pagination={members.isPending ? undefined : list.pagination}
      />
      <AddMemberDialog projectId={projectId} open={adding} onOpenChange={setAdding} />
      <RemoveMemberDialog
        name={removing?.user.username}
        onOpenChange={(next) => !next && setRemoving(undefined)}
        onConfirm={remove}
      />
      <AssumePrivilegesDialog
        projectId={projectId}
        target={assuming}
        onOpenChange={(next) => !next && setAssuming(undefined)}
      />
    </Stack>
  );
};
