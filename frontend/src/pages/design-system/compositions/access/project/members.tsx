import { useMemo, useState } from "react";
import { UserXIcon } from "lucide-react";

import { Button } from "@app/components/v4/ui/button";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import { DropdownMenuItem } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Stack } from "@app/components/v4/ui/layout";

import { useAccess } from "../context";
import { displayName, type OrgUser, type ProjectMember, SELF_USER_ID } from "../model";
import { Gate, ListToolbar, Muted, RoleBadges, useCan, usePagedList, RESTRICTED } from "../ui";
import { AddMemberDialog } from "./member-add-dialog";
import { AssumePrivilegesDialog, RemoveMemberDialog } from "./member-dialogs";

import styles from "../access.module.css";

export { ProjectMemberDetail } from "./member-detail";

type Row = ProjectMember & { user: OrgUser };

const SELF_REASON = "You cannot modify your own membership";
const ASSUME_DESCRIPTION =
  "Assume the privileges of this user, allowing you to replicate their access behavior.";

export const ProjectMembersTab = () => {
  const { data, update, saved, loading, navigate, startsWith } = useAccess();
  const can = useCan("project");
  const roles = data.projectRoles;
  const [roleFilter, setRoleFilter] = useState<string[]>(() =>
    startsWith("filter") ? ["admin"] : []
  );
  const [filterOpen, setFilterOpen] = useState(() => startsWith("filter"));
  const [adding, setAdding] = useState(() => startsWith("add") || startsWith("add-user-picker"));
  const [removing, setRemoving] = useState<Row | undefined>(() => {
    if (!startsWith("remove")) return undefined;
    const member = data.projectMembers.find((item) => item.id === "pm-diego");
    const user = data.orgMembers.find((item) => item.user.id === member?.userId)?.user;
    return member && user ? { ...member, user } : undefined;
  });
  const [assuming, setAssuming] = useState(false);

  const joined = useMemo(
    () =>
      data.projectMembers.flatMap((member) => {
        const user = data.orgMembers.find((item) => item.user.id === member.userId)?.user;
        return user ? [{ ...member, user }] : [];
      }),
    [data.projectMembers, data.orgMembers]
  );

  const rows = useMemo(
    () =>
      joined.filter(
        (member) => !roleFilter.length || member.roles.some((r) => roleFilter.includes(r.role))
      ),
    [joined, roleFilter]
  );
  const list = usePagedList({
    rows,
    initialSort: { columnId: "name", direction: "asc" },
    matches: (member, needle) =>
      [member.user.firstName, member.user.lastName, member.user.username, member.user.email].some(
        (value) => value?.toLowerCase().includes(needle)
      ),
    compare: (a, b, column) => {
      const value = (member: Row) =>
        (column === "email" ? member.user.email : member.user.firstName)?.toLowerCase();
      const [left, right] = [value(a), value(b)];
      if (!left) return 1;
      if (!right) return -1;
      return left.localeCompare(right);
    }
  });

  const open = (member: Row) =>
    navigate({
      detail: {
        kind: "project-member",
        id: member.id,
        label: displayName(member.user) ?? member.user.email
      }
    });

  const columns: DataTableColumn<Row>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      grow: true,
      render: (member) => <span>{displayName(member.user) ?? <Muted>-</Muted>}</span>
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
      render: (member) => <RoleBadges roles={member.roles} catalog={roles} />
    }
  ];

  const rowActions: DataTableRowActions<Row> = {
    inline: [
      {
        label: "Remove user from project",
        icon: UserXIcon,
        disabledReason: (member) => {
          if (member.userId === SELF_USER_ID) return SELF_REASON;
          return can("member", "delete") ? undefined : RESTRICTED;
        },
        onSelect: setRemoving
      }
    ],
    menuDisabledReason: (member) => (member.userId === SELF_USER_ID ? SELF_REASON : undefined),
    renderMenu: () => (
      <DropdownMenuItem
        disabled={!can("member", "edit")}
        description={can("member", "edit") ? ASSUME_DESCRIPTION : undefined}
        onSelect={() => setAssuming(true)}
      >
        <Icon name="user" />
        Assume privileges
      </DropdownMenuItem>
    )
  };

  const searching = Boolean(list.search.trim() || roleFilter.length);

  return (
    <Stack gap={16}>
      <div className={styles.toolbar}>
        <div className={styles.grow}>
          <ListToolbar
            search={list.search}
            onSearch={list.setSearch}
            placeholder="Search project users..."
            filter={{
              label: "Filter by project role",
              open: filterOpen,
              onOpenChange: setFilterOpen,
              options: roles.map((role) => ({ value: role.slug, label: role.name })),
              selected: roleFilter,
              disabled: loading,
              onToggle: (slug) => {
                setRoleFilter((current) =>
                  current.includes(slug) ? current.filter((r) => r !== slug) : [...current, slug]
                );
                list.resetPage();
              }
            }}
          />
        </div>
        <Gate
          allowed={can("member", "create")}
          reason="You don't have permission to add users to this project"
        >
          <Button
            variant="accent"
            icon="user-plus"
            disabled={!can("member", "create")}
            onClick={() => setAdding(true)}
          >
            Add users to project
          </Button>
        </Gate>
      </div>
      <Stack gap={8}>
        <DataTable
          label="Project users"
          rows={list.pageRows}
          columns={columns}
          rowActions={rowActions}
          getRowId={(member) => member.id}
          rowLabel={(member) => member.user.email}
          loading={loading}
          loadingRows={10}
          sort={list.sort}
          onSortChange={list.setSort}
          onRowActivate={open}
          empty={
            searching ? (
              <EmptyState
                size="sm"
                icon="search"
                title="No project users match search"
                description="Adjust your search or filter criteria."
              />
            ) : (
              <EmptyState
                size="sm"
                icon="user"
                title="No project users found"
                description="Add users to get started."
              />
            )
          }
        />
        {!loading && list.pagination}
      </Stack>
      <AddMemberDialog
        open={adding}
        onOpenChange={setAdding}
        prefill={startsWith("add")}
        openUserPicker={startsWith("add-user-picker")}
      />
      <RemoveMemberDialog
        name={removing?.user.username}
        onOpenChange={(next) => !next && setRemoving(undefined)}
        onConfirm={() => {
          const id = removing?.id;
          update((current) => ({
            ...current,
            projectMembers: current.projectMembers.filter((member) => member.id !== id)
          }));
          setRemoving(undefined);
          saved("Successfully removed user from project");
        }}
      />
      <AssumePrivilegesDialog open={assuming} onOpenChange={setAssuming} />
    </Stack>
  );
};
