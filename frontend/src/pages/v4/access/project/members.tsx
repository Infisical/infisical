import { useMemo, useState } from "react";
import { subject } from "@casl/ability";
import { UserXIcon } from "lucide-react";

import { Button } from "@app/components/v4/ui/button";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Stack } from "@app/components/v4/ui/layout";
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
import { Gate, ListToolbar, Muted, RESTRICTED, RoleBadges, usePagedList } from "../ui";
import { personName, useMemberRoleAccess } from "./member-access";
import { AddMemberDialog } from "./member-add-dialog";
import { type AssumeTarget, AssumePrivilegesDialog, RemoveMemberDialog } from "./member-dialogs";
import { useProjectScope } from "./scope";

import styles from "../access.module.css";

const SELF_REASON = "You cannot modify your own membership";
const ASSUME_DESCRIPTION =
  "Assume the privileges of this user, allowing you to replicate their access behavior.";

export const ProjectMembersTab = () => {
  const scope = useProjectScope();
  const { orgId, projectId } = scope;
  const access = useV4Adapter("access");
  const go = useGo();
  const session = useV4Session();
  const { permission } = useProjectPermission(projectId);
  const { roles } = useMemberRoleAccess(projectId);
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
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
      render: (member) => <span>{personName(member.user) ?? <Muted>-</Muted>}</span>
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
          description={canAssume(member) ? ASSUME_DESCRIPTION : undefined}
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
              disabledReason:
                members.isPending && !roleFilter.length ? "Loading project users" : undefined,
              onToggle: (slug) => {
                setRoleFilter((current) =>
                  current.includes(slug) ? current.filter((r) => r !== slug) : [...current, slug]
                );
                list.resetPage();
              }
            }}
          />
        </div>
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
      </div>
      <Stack gap={8}>
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
          onRowActivate={(member) => go(accessLinks.projectMember(scope, member.id))}
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
        {!members.isPending && list.pagination}
      </Stack>
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
