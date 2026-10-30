import { useMemo, useState } from "react";
import { PencilIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
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
import { Select } from "@app/components/v4/ui/select";

import { useAccess } from "../context";
import { type OrgGroup, roleName } from "../model";
import { type AccessColumn, AccessTable } from "../table";
import { Gate, ListToolbar, useCan, usePagedList } from "../ui";
import { GroupDialog, setGroupRole } from "./group-dialog";
import { reapGroup } from "./memberships";

import styles from "../access.module.css";

export { OrgGroupDetail } from "./group-detail";

export const OrgGroupsTab = () => {
  const { data, update, saved, toast, loading, navigate, startsWith } = useAccess();
  const can = useCan("org");
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [dialog, setDialog] = useState<{ group?: OrgGroup } | undefined>(() =>
    startsWith("create") ? {} : undefined
  );
  const [deleting, setDeleting] = useState<OrgGroup>();
  const rows = useMemo(
    () => data.orgGroups.filter((group) => !roleFilter.length || roleFilter.includes(group.role)),
    [data.orgGroups, roleFilter]
  );
  const list = usePagedList({
    rows,
    initialSort: { columnId: "name", direction: "asc" },
    matches: (group, needle) =>
      [group.name, group.slug].some((value) => value.toLowerCase().includes(needle)),
    compare: (a, b, column) => {
      if (column === "slug") return a.slug.localeCompare(b.slug);
      if (column === "role")
        return roleName(data.orgRoles, a.role).localeCompare(roleName(data.orgRoles, b.role));
      return a.name.localeCompare(b.name);
    }
  });
  const openDetail = (group: OrgGroup) =>
    navigate({ detail: { kind: "org-group", id: group.id, label: group.name } });

  const columns: AccessColumn<OrgGroup>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      width: "33%",
      render: (group) => <span>{group.name}</span>
    },
    {
      id: "slug",
      header: "Slug",
      sortable: true,
      width: "33%",
      render: (group) => <span>{group.slug}</span>
    },
    {
      id: "role",
      header: "Organization role",
      sortable: true,
      render: (group) => (
        <span
          className={styles.roleSelect}
          onClick={(event) => event.stopPropagation()}
          role="presentation"
        >
          <Gate allowed={can("groups", "edit")}>
            <Select
              size="sm"
              label={`Organization role for ${group.name}`}
              value={group.role}
              disabled={!can("groups", "edit")}
              options={data.orgRoles.map((role) => ({ value: role.slug, label: role.name }))}
              onChange={(role) => {
                update((current) => setGroupRole(current, group.id, role));
                saved("Successfully updated group role");
              }}
            />
          </Gate>
        </span>
      )
    },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      render: (group) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-row" icon="more" iconOnly>
              {`Actions for ${group.name}`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                navigator.clipboard?.writeText(group.id);
                toast({ tone: "neutral", title: "Copied group ID to clipboard" });
              }}
            >
              <Icon name="copy" />
              Copy group ID
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!can("groups", "edit")}
              onSelect={() => setDialog({ group })}
            >
              <Icon icon={PencilIcon} />
              Edit group
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!can("groups", "edit")} onSelect={() => openDetail(group)}>
              <Icon name="user" />
              Manage members
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={!can("groups", "delete")}
              onSelect={() => setDeleting(group)}
            >
              <Icon name="trash" />
              Delete group
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

  const searching = Boolean(list.search.trim());
  return (
    <Stack gap={16}>
      <div className={styles.toolbar}>
        <div className={styles.grow}>
          <ListToolbar
            search={list.search}
            onSearch={list.setSearch}
            placeholder="Search organization groups..."
            filter={{
              label: "Filter by organization role",
              options: data.orgRoles.map((role) => ({ value: role.slug, label: role.name })),
              selected: roleFilter,
              onToggle: (slug) => {
                setRoleFilter((current) =>
                  current.includes(slug) ? current.filter((r) => r !== slug) : [...current, slug]
                );
                list.resetPage();
              }
            }}
          />
        </div>
        <Gate allowed={can("groups", "create")}>
          <Button
            variant="primary"
            icon="plus"
            disabled={!can("groups", "create")}
            onClick={() => setDialog({})}
          >
            Create
          </Button>
        </Gate>
      </div>
      <Stack gap={8}>
        <AccessTable
          label="Organization groups"
          rows={list.pageRows}
          columns={columns}
          getRowId={(group) => group.id}
          rowLabel={(group) => group.name}
          loading={loading ? 10 : undefined}
          sort={list.sort}
          onSortChange={list.setSort}
          onRowClick={openDetail}
          empty={
            searching || roleFilter.length ? (
              <EmptyState
                size="sm"
                icon="search"
                title={`No organization groups match ${searching ? "search" : "filter criteria"}`}
                description="Adjust your search or filter criteria."
              />
            ) : (
              <EmptyState
                size="sm"
                icon="user"
                title="No organization groups found"
                description="Create a group to get started."
              />
            )
          }
        />
        {!loading && list.pagination}
      </Stack>
      {dialog && (
        <GroupDialog
          key={dialog.group?.id ?? "new"}
          group={dialog.group}
          open
          onOpenChange={(open) => !open && setDialog(undefined)}
        />
      )}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText="confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {`Are you sure you want to delete the group named ${deleting?.name ?? ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>This action is irreversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!deleting) return;
                update((current) => reapGroup(current, deleting.id));
                saved(`Successfully deleted the group named ${deleting.name}`);
                setDeleting(undefined);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Stack>
  );
};
