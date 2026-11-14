import { useMemo, useState } from "react";
import { FilterBar } from "@infisical/cipher/patterns/filter-bar";
import { Button } from "@infisical/cipher/ui/button";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { UserRoundXIcon } from "lucide-react";

import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type { TGroupMembership } from "@app/hooks/api/groups/types";

import { useV4Adapter } from "../../data/adapters";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { useProjectPermission } from "../permissions";
import { formatDate } from "../roles";
import { Gate, RESTRICTED, usePagedList } from "../ui";
import { GroupModal, RemoveGroupDialog } from "./group-modal";
import { GroupRoles } from "./group-roles";
import { accessLabel, accessNoun } from "./product";
import { useProjectScope } from "./scope";

export const ProjectGroupsTab = () => {
  const go = useGo();
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
        <RowLink
          link={go.link(accessLinks.projectGroup(scope, row.group.id))}
          title={row.group.name}
        >
          {row.group.name}
        </RowLink>
      )
    },
    {
      id: "role",
      header: `${accessLabel(scope.projectType, "role")}`,
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
        {`Remove group from ${accessNoun(scope.projectType)}`}
      </DropdownMenuItem>
    )
  };

  return (
    <Stack gap={16}>
      <FilterBar
        label={`${accessLabel(scope.projectType, "group")} filters`}
        fields={[]}
        value={[]}
        onChange={() => undefined}
        search={
          <Input
            icon="search"
            aria-label={`Search ${accessLabel(scope.projectType, "groups").toLowerCase()}...`}
            placeholder={`Search ${accessLabel(scope.projectType, "groups").toLowerCase()}...`}
            value={list.search}
            onChange={(event) => list.setSearch(event.target.value)}
          />
        }
        actions={
          <Gate allowed={canCreate}>
            <Button
              variant="accent"
              icon="plus"
              disabled={!canCreate}
              onClick={() => setAdding(true)}
            >
              {`Add group to ${accessNoun(scope.projectType)}`}
            </Button>
          </Gate>
        }
      />
      <DataTable
        label={`${accessLabel(scope.projectType, "groups")}`}
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
          (Boolean(groups.error) && (
            <EmptyState size="sm" icon="alert" title="Couldn't load groups" />
          )) ||
          (list.search.trim() ? (
            <EmptyState
              size="sm"
              icon="search"
              title={`No ${accessLabel(scope.projectType, "groups").toLowerCase()} match search`}
            />
          ) : (
            <EmptyState
              size="sm"
              icon="user"
              title={`No ${accessLabel(scope.projectType, "groups").toLowerCase()} found`}
            />
          ))
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
