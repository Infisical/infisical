import { useMemo, useState } from "react";
import { PencilIcon } from "lucide-react";

import { FilterBar, type FilterBarFilter } from "@app/components/v4/patterns/filter-bar";
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
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { Pagination } from "@app/components/v4/ui/pagination";
import { RowLink } from "@app/components/v4/ui/row-link";
import { Select } from "@app/components/v4/ui/select";
import {
  OrgPermissionGroupActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import type { TGroupOrgMembership } from "@app/hooks/api/groups/types";

import { useV4Adapter } from "../../data/adapters";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { useOrgId, useOrgPermission } from "../permissions";
import { failed, saved, toast } from "../toast";
import { Gate, RESTRICTED, type Sort } from "../ui";
import { type GroupDraft, GroupDialog } from "./group-dialog";
import { useDebounced } from "./use-debounced";

import styles from "../access.module.css";

const groupRoleSlug = (group: TGroupOrgMembership) =>
  group.role === "custom" ? (group.customRole?.slug ?? group.role) : group.role;

const draftOf = (group: TGroupOrgMembership): GroupDraft => ({
  id: group.id,
  name: group.name,
  slug: group.slug,
  roleSlug: groupRoleSlug(group)
});

export const OrgGroupsTab = () => {
  const access = useV4Adapter("access");
  const orgId = useOrgId();
  const go = useGo();
  const { permission } = useOrgPermission();
  const can = (action: OrgPermissionGroupActions) =>
    permission.can(action, OrgPermissionSubjects.Groups);
  const { data: roles = [] } = access.useOrgRoles(orgId);
  const update = access.useUpdateGroup();
  const remove = access.useDeleteGroup();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const roleFilter = useMemo(
    () => filters.find((filter) => filter.field === "role")?.values ?? [],
    [filters]
  );
  const [sort, setSort] = useState<Sort>({ columnId: "name", direction: "asc" });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [dialog, setDialog] = useState<{ group?: GroupDraft }>();
  const [deleting, setDeleting] = useState<TGroupOrgMembership>();
  const debouncedSearch = useDebounced(search.trim());
  const { data, isPending } = access.useOrgGroups({
    organizationId: orgId,
    offset: (page - 1) * perPage,
    limit: perPage,
    search: debouncedSearch,
    roles: roleFilter.length ? roleFilter : undefined,
    orderBy: sort.columnId,
    orderDirection: sort.direction
  });
  const groups = data?.groups ?? [];
  const totalCount = data?.totalCount ?? 0;
  const openDetail = (group: TGroupOrgMembership) => go(accessLinks.orgGroup(orgId, group.id));
  const canEdit = can(OrgPermissionGroupActions.Edit);

  const columns: DataTableColumn<TGroupOrgMembership>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      grow: true,
      render: (group) => (
        <RowLink {...go.link(accessLinks.orgGroup(orgId, group.id))} title={group.name}>
          {group.name}
        </RowLink>
      )
    },
    {
      id: "slug",
      header: "Slug",
      sortable: true,
      grow: true,
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
          <Gate allowed={canEdit}>
            <Select
              size="sm"
              label={`Organization role for ${group.name}`}
              value={groupRoleSlug(group)}
              disabled={!canEdit}
              options={roles.map((role) => ({ value: role.slug, label: role.name }))}
              onChange={async (role) => {
                try {
                  await update.mutateAsync({ id: group.id, role, organizationId: orgId });
                  saved("Successfully updated group role");
                } catch (error) {
                  failed("Failed to update group role", error);
                }
              }}
            />
          </Gate>
        </span>
      )
    }
  ];

  const rowActions: DataTableRowActions<TGroupOrgMembership> = {
    inline: [
      {
        label: "Edit group",
        icon: PencilIcon,
        disabledReason: () => (canEdit ? undefined : RESTRICTED),
        onSelect: (group) => setDialog({ group: draftOf(group) })
      }
    ],
    renderMenu: (group) => (
      <>
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
          disabled={!canEdit}
          description={canEdit ? undefined : RESTRICTED}
          onSelect={() => openDetail(group)}
        >
          <Icon name="user" />
          Manage members
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={!can(OrgPermissionGroupActions.Delete)}
          description={can(OrgPermissionGroupActions.Delete) ? undefined : RESTRICTED}
          onSelect={() => setDeleting(group)}
        >
          <Icon name="trash" />
          Delete group
        </DropdownMenuItem>
      </>
    )
  };

  const searching = Boolean(debouncedSearch);
  const canCreate = can(OrgPermissionGroupActions.Create);
  return (
    <Stack gap={16}>
      <FilterBar
        label="Organization group filters"
        fields={[
          {
            key: "role",
            label: "Organization role",
            type: "multi-select",
            options: roles.map((role) => ({ value: role.slug, label: role.name }))
          }
        ]}
        value={filters}
        onChange={(next) => {
          setFilters(next);
          setPage(1);
        }}
        search={
          <Input
            icon="search"
            aria-label="Search organization groups..."
            placeholder="Search organization groups..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        }
        actions={
          <Gate allowed={canCreate}>
            <Button
              variant="accent"
              icon="plus"
              disabled={!canCreate}
              onClick={() => setDialog({})}
            >
              Create
            </Button>
          </Gate>
        }
      />
      <DataTable
        label="Organization groups"
        rows={groups}
        columns={columns}
        rowActions={rowActions}
        getRowId={(group) => group.id}
        rowLabel={(group) => group.name}
        loading={isPending}
        loadingRows={10}
        sort={sort}
        onSortChange={(next) => {
          setSort(next);
          setPage(1);
        }}
        empty={
          searching || roleFilter.length ? (
            <EmptyState
              size="sm"
              icon="search"
              title={`No organization groups match ${searching ? "search" : "filter criteria"}`}
            />
          ) : (
            <EmptyState size="sm" icon="user" title="No organization groups found" />
          )
        }
        pagination={
          !isPending && totalCount > 0 ? (
            <Pagination
              label="Organization group pages"
              variant="compact"
              page={page}
              total={totalCount}
              pageSize={perPage}
              pageSizeOptions={[10, 20, 50, 100]}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPerPage(size);
                setPage(1);
              }}
            />
          ) : undefined
        }
      />
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
              onClick={async () => {
                if (!deleting) return;
                try {
                  await remove.mutateAsync({ id: deleting.id, organizationId: orgId });
                  saved(`Successfully deleted the group named ${deleting.name}`);
                } catch (error) {
                  failed("Failed to delete group", error);
                }
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
