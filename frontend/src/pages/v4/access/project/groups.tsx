import { useMemo, useState } from "react";
import { UserRoundXIcon } from "lucide-react";

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
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type { TGroupMembership } from "@app/hooks/api/groups/types";

import { useV4Adapter } from "../../data/adapters";
import { accessLinks } from "../links";
import { AccessRowLink } from "../navigation";
import { useProjectPermission } from "../permissions";
import { formatDate } from "../roles";
import { Gate, ListToolbar, RESTRICTED, usePagedList } from "../ui";
import { GroupModal, RemoveGroupDialog } from "./group-modal";
import { GroupRoles } from "./group-roles";
import { useProjectScope } from "./scope";

import styles from "../access.module.css";

export const ProjectGroupsTab = () => {
  const scope = useProjectScope();
  const { projectId } = scope;
  const { permission } = useProjectPermission(projectId);
  const groups = useV4Adapter("access").useProjectGroups(projectId, scope.projectType);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TGroupMembership>();
  const canCreate = permission.can(ProjectPermissionActions.Create, ProjectPermissionSub.Groups);
  const canDelete = permission.can(ProjectPermissionActions.Delete, ProjectPermissionSub.Groups);

  const rows = useMemo(() => groups.data ?? [], [groups.data]);
  const list = usePagedList({
    rows,
    initialSort: { columnId: "name", direction: "asc" },
    matches: (row, needle) =>
      row.group.name.toLowerCase().includes(needle) ||
      row.group.slug.toLowerCase().includes(needle),
    compare: (a, b) => a.group.name.toLowerCase().localeCompare(b.group.name.toLowerCase())
  });

  const columns: DataTableColumn<TGroupMembership>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      grow: true,
      render: (row) => (
        <AccessRowLink href={accessLinks.projectGroup(scope, row.group.id)} title={row.group.name}>
          {row.group.name}
        </AccessRowLink>
      )
    },
    {
      id: "role",
      header: "Project role",
      render: (row) => (
        <GroupRoles
          projectId={projectId}
          groupId={row.group.id}
          groupName={row.group.name}
          roles={row.roles}
        />
      )
    },
    {
      id: "added",
      header: "Added on",
      render: (row) => <span>{formatDate(row.createdAt)}</span>
    }
  ];

  const rowActions: DataTableRowActions<TGroupMembership> = {
    renderMenu: (group) => (
      <DropdownMenuItem
        variant="destructive"
        disabled={!canDelete}
        description={canDelete ? undefined : RESTRICTED}
        onSelect={() => setRemoving(group)}
      >
        <Icon icon={UserRoundXIcon} />
        Remove group from project
      </DropdownMenuItem>
    )
  };

  return (
    <Stack gap={16}>
      <div className={styles.toolbar}>
        <div className={styles.grow}>
          <ListToolbar
            search={list.search}
            onSearch={list.setSearch}
            placeholder="Search project groups..."
          />
        </div>
        <Gate allowed={canCreate}>
          <Button
            variant="accent"
            icon="plus"
            disabled={!canCreate}
            onClick={() => setAdding(true)}
          >
            Add group to project
          </Button>
        </Gate>
      </div>
      <DataTable
        label="Project groups"
        rows={list.pageRows}
        columns={columns}
        rowActions={rowActions}
        getRowId={(row) => row.group.id}
        rowLabel={(row) => row.group.name}
        loading={groups.isPending}
        loadingRows={10}
        sort={list.sort}
        onSortChange={list.setSort}
        empty={
          list.search.trim() ? (
            <EmptyState size="sm" icon="search" title="No project groups match search" />
          ) : (
            <EmptyState size="sm" icon="user" title="No project groups found" />
          )
        }
        pagination={groups.isPending ? undefined : list.pagination}
      />
      <GroupModal projectId={projectId} open={adding} onOpenChange={setAdding} />
      <RemoveGroupDialog
        projectId={projectId}
        group={removing?.group}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      />
    </Stack>
  );
};
