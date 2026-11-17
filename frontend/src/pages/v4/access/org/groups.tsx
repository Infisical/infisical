import { useMemo, useState } from "react";
import { FilterBar, type FilterBarFilter } from "@infisical/cipher/patterns/filter-bar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { Select } from "@infisical/cipher/ui/select";
import { PencilIcon } from "lucide-react";

import {
  OrgPermissionGroupActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import type { TGroupOrgMembership } from "@app/hooks/api/groups/types";

import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
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

const managedByColumn = (orgId: string): DataTableColumn<TGroupOrgMembership> => ({
  id: "managedBy",
  header: "Managed by",
  render: (group) => (
    <Badge tone="outline">
      <Icon name="building" size={12} />
      {group.orgId !== orgId ? "Root organization" : "Sub-organization"}
    </Badge>
  )
});

const editReason = (linked: boolean, canEdit: boolean) => {
  if (linked) return "Managed by the root organization";
  return canEdit ? undefined : RESTRICTED;
};

const GroupRowMenu = ({
  group,
  linked,
  canEdit,
  canDelete,
  onManage,
  onDelete
}: {
  group: TGroupOrgMembership;
  linked: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onManage: () => void;
  onDelete: () => void;
}) => (
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
    {!linked && (
      <DropdownMenuItem
        disabled={!canEdit}
        description={canEdit ? undefined : RESTRICTED}
        onSelect={onManage}
      >
        <Icon name="user" />
        Manage members
      </DropdownMenuItem>
    )}
    <DropdownMenuSeparator />
    <DropdownMenuItem
      variant="destructive"
      disabled={!canDelete}
      description={canDelete ? undefined : RESTRICTED}
      onSelect={onDelete}
    >
      <Icon name="trash" />
      {linked ? "Unlink group" : "Delete group"}
    </DropdownMenuItem>
  </>
);

const RemoveGroupDialog = ({
  group,
  onClose
}: {
  group: TGroupOrgMembership | undefined;
  onClose: () => void;
}) => {
  const orgId = useOrgId();
  const remove = useV4Adapter("access").useDeleteGroup();
  const linked = Boolean(group && group.orgId !== orgId);
  return (
    <AlertDialog open={Boolean(group)} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent tone="danger" confirmText="confirm">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {linked
              ? `Are you sure you want to unlink the group "${group?.name ?? ""}" from this sub-organization?`
              : `Are you sure you want to delete the group named ${group?.name ?? ""}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>This action is irreversible.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async () => {
              if (!group) return;
              try {
                await remove.mutateAsync({ id: group.id, organizationId: orgId });
                saved(
                  linked
                    ? "Successfully unlinked group from sub-organization"
                    : `Successfully deleted the group named ${group.name}`
                );
              } catch (error) {
                failed("Failed to delete group", error);
              }
              onClose();
            }}
          >
            {linked ? "Unlink" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const OrgGroupsTab = () => {
  const access = useV4Adapter("access");
  const orgId = useOrgId();
  const go = useGo();
  const { permission } = useOrgPermission();
  const isSubOrg = useV4Session().organization.isSubOrganization;
  const orgWord = isSubOrg ? "sub-organization" : "organization";
  const can = (action: OrgPermissionGroupActions) =>
    permission.can(action, OrgPermissionSubjects.Groups);
  const { data: roles = [] } = access.useOrgRoles(orgId);
  const update = access.useUpdateGroup();
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
        <RowLink link={go.link(accessLinks.orgGroup(orgId, group.id))} title={group.name}>
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
    },
    ...(isSubOrg ? [managedByColumn(orgId)] : [])
  ];

  const rowActions: DataTableRowActions<TGroupOrgMembership> = {
    inline: [
      {
        label: "Edit group",
        icon: PencilIcon,
        disabledReason: (group) => editReason(group.orgId !== orgId, canEdit),
        onSelect: (group) => setDialog({ group: draftOf(group) })
      }
    ],
    renderMenu: (group) => (
      <GroupRowMenu
        group={group}
        linked={group.orgId !== orgId}
        canEdit={canEdit}
        canDelete={can(OrgPermissionGroupActions.Delete)}
        onManage={() => openDetail(group)}
        onDelete={() => setDeleting(group)}
      />
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
            aria-label={`Search ${orgWord} groups...`}
            placeholder={`Search ${orgWord} groups...`}
            slashShortcut
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
              {isSubOrg ? "Add" : "Create"}
            </Button>
          </Gate>
        }
      />
      <DataTable
        filtered={searching || roleFilter.length > 0}
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
              title={`No ${orgWord} groups match ${searching ? "search" : "filter criteria"}`}
            />
          ) : (
            <EmptyState size="sm" icon="user" title={`No ${orgWord} groups found`} />
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
      <RemoveGroupDialog group={deleting} onClose={() => setDeleting(undefined)} />
    </Stack>
  );
};
