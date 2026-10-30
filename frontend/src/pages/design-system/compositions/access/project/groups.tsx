import { useMemo, useState } from "react";
import { UserRoundXIcon } from "lucide-react";

import { Button } from "@app/components/v4/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Stack } from "@app/components/v4/ui/layout";

import { useAccess } from "../context";
import type { OrgGroup, ProjectGroup } from "../model";
import { type AccessColumn, AccessTable } from "../table";
import { Gate, ListToolbar, useCan, usePagedList } from "../ui";
import { RemoveGroupDialog } from "./group-detail";
import { GroupModal } from "./group-modal";
import { GroupRoles } from "./group-roles";

import styles from "../access.module.css";

export { ProjectGroupDetail } from "./group-detail";

type Row = ProjectGroup & { group: OrgGroup };

export const ProjectGroupsTab = () => {
  const { data, loading, navigate, startsWith } = useAccess();
  const can = useCan("project");
  const [adding, setAdding] = useState(() => startsWith("add"));
  const [removing, setRemoving] = useState<Row>();

  const rows = useMemo(
    () =>
      data.projectGroups.flatMap((membership) => {
        const group = data.orgGroups.find((item) => item.id === membership.groupId);
        return group ? [{ ...membership, group }] : [];
      }),
    [data.projectGroups, data.orgGroups]
  );
  const list = usePagedList({
    rows,
    initialSort: { columnId: "name", direction: "asc" },
    matches: (row, needle) =>
      row.group.name.toLowerCase().includes(needle) ||
      row.group.slug.toLowerCase().includes(needle),
    compare: (a, b) => a.group.name.toLowerCase().localeCompare(b.group.name.toLowerCase())
  });

  const columns: AccessColumn<Row>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      width: "33%",
      render: (row) => <span>{row.group.name}</span>
    },
    {
      id: "role",
      header: "Project role",
      render: (row) => (
        <GroupRoles groupId={row.groupId} groupName={row.group.name} roles={row.roles} />
      )
    },
    {
      id: "added",
      header: "Added on",
      render: (row) => <span>{row.createdAt}</span>
    },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      render: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-row" icon="more" iconOnly>
              {`Actions for ${row.group.name}`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              disabled={!can("groups", "delete")}
              onSelect={() => setRemoving(row)}
            >
              <Icon icon={UserRoundXIcon} />
              Remove group from project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

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
        <Gate allowed={can("groups", "create")}>
          <Button
            variant="primary"
            icon="plus"
            disabled={!can("groups", "create")}
            onClick={() => setAdding(true)}
          >
            Add group to project
          </Button>
        </Gate>
      </div>
      <Stack gap={8}>
        <AccessTable
          label="Project groups"
          rows={list.pageRows}
          columns={columns}
          getRowId={(row) => row.groupId}
          rowLabel={(row) => row.group.name}
          loading={loading ? 10 : undefined}
          sort={list.sort}
          onSortChange={list.setSort}
          onRowClick={(row) =>
            navigate({ detail: { kind: "project-group", id: row.groupId, label: row.group.name } })
          }
          empty={
            list.search.trim() ? (
              <EmptyState
                size="sm"
                icon="search"
                title="No project groups match search"
                description="Adjust your search criteria."
              />
            ) : (
              <EmptyState
                size="sm"
                icon="user"
                title="No project groups found"
                description="Add a group to get started."
              />
            )
          }
        />
        {!loading && list.pagination}
      </Stack>
      <GroupModal open={adding} onOpenChange={setAdding} />
      <RemoveGroupDialog
        group={removing?.group}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      />
    </Stack>
  );
};
