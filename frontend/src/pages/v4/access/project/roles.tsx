import { useState } from "react";
import { PencilIcon, ServerIcon, WrenchIcon } from "lucide-react";

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
import { DropdownMenuItem } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Stack } from "@app/components/v4/ui/layout";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { isCustomProjectRole } from "@app/helpers/roles";
import type { TProjectRole } from "@app/hooks/api/roles/types";

import { useV4Adapter } from "../../data/adapters";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { useProjectPermission } from "../permissions";
import { failed, saved } from "../toast";
import { Gate, ListToolbar, RESTRICTED, usePagedList } from "../ui";
import { RoleListRoleSheet, type RoleSheetMode } from "./role-list-role-sheet";
import { useProjectScope } from "./scope";

import shared from "../access.module.css";
import styles from "./tokens-roles.module.css";

type ProjectRoleRow = Omit<TProjectRole, "permissions">;

export const ProjectRolesTab = () => {
  const scope = useProjectScope();
  const { projectId } = scope;
  const go = useGo();
  const access = useV4Adapter("access");
  const { permission } = useProjectPermission(projectId);
  const { data: roles = [], isPending } = access.useProjectRoles(projectId);
  const deleteRole = access.useDeleteProjectRole();
  const [sheet, setSheet] = useState<{ open: boolean; mode: RoleSheetMode; key: number }>({
    open: false,
    mode: { kind: "create" },
    key: 0
  });
  const [deleting, setDeleting] = useState<ProjectRoleRow>();
  const canCreate = permission.can(ProjectPermissionActions.Create, ProjectPermissionSub.Role);
  const canEdit = permission.can(ProjectPermissionActions.Edit, ProjectPermissionSub.Role);
  const canDelete = permission.can(ProjectPermissionActions.Delete, ProjectPermissionSub.Role);

  const openSheet = (mode: RoleSheetMode) =>
    setSheet((current) => ({ open: true, mode, key: current.key + 1 }));
  const openRole = (role: ProjectRoleRow) => go(accessLinks.projectRole(scope, role.slug));

  const list = usePagedList<ProjectRoleRow>({
    rows: roles,
    initialSort: { columnId: "source", direction: "asc" },
    matches: (role, needle) =>
      role.name.toLowerCase().includes(needle) || role.slug.toLowerCase().includes(needle),
    compare: (a, b, column) => {
      if (column === "source")
        return Number(isCustomProjectRole(a.slug)) - Number(isCustomProjectRole(b.slug));
      if (column === "slug") return a.slug.toLowerCase().localeCompare(b.slug.toLowerCase());
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    }
  });

  const remove = async (role: ProjectRoleRow) => {
    try {
      await deleteRole.mutateAsync({ projectId, id: role.id });
      saved(`Project role "${role.name}" deleted`);
    } catch (error) {
      failed("Failed to delete project role", error);
    }
  };

  const columns: DataTableColumn<ProjectRoleRow>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      grow: true,
      render: (role) => <span>{role.name}</span>
    },
    {
      id: "slug",
      header: "Slug",
      sortable: true,
      grow: true,
      render: (role) => <span>{role.slug}</span>
    },
    {
      id: "source",
      header: "Source",
      sortable: true,
      render: (role) =>
        isCustomProjectRole(role.slug) ? (
          <span className={styles.source}>
            <Icon icon={WrenchIcon} size={12} />
            Custom
          </span>
        ) : (
          <span className={styles.source}>
            <Icon icon={ServerIcon} size={12} />
            Platform
          </span>
        )
    }
  ];

  const rowActions: DataTableRowActions<ProjectRoleRow> = {
    inline: [
      {
        label: "Duplicate role",
        icon: "copy",
        disabledReason: () => (canCreate ? undefined : RESTRICTED),
        onSelect: (role) => openSheet({ kind: "duplicate", source: role })
      }
    ],
    renderMenu: (role) => {
      const custom = isCustomProjectRole(role.slug);
      return (
        <>
          <DropdownMenuItem disabled={!canEdit} onSelect={() => openRole(role)}>
            {custom ? <Icon icon={PencilIcon} /> : <Icon name="eye" />}
            {custom ? "Edit role" : "View role"}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={!custom || !canDelete}
            description={custom ? undefined : "Built-in roles cannot be deleted"}
            onSelect={() => setDeleting(role)}
          >
            <Icon name="trash" />
            Delete role
          </DropdownMenuItem>
        </>
      );
    }
  };

  return (
    <Stack gap={16}>
      <div className={shared.toolbar}>
        <div className={shared.grow}>
          <ListToolbar
            search={list.search}
            onSearch={list.setSearch}
            placeholder="Search project roles..."
          />
        </div>
        <Gate allowed={canCreate}>
          <Button
            variant="accent"
            icon="plus"
            disabled={!canCreate}
            onClick={() => openSheet({ kind: "create" })}
          >
            Add project role
          </Button>
        </Gate>
      </div>
      <Stack gap={8}>
        <DataTable
          label="Project roles"
          rows={list.pageRows}
          columns={columns}
          rowActions={rowActions}
          getRowId={(role) => role.id}
          rowLabel={(role) => role.name}
          loading={isPending}
          loadingRows={10}
          sort={list.sort}
          onSortChange={list.setSort}
          onRowActivate={openRole}
          empty={
            roles.length ? (
              <EmptyState
                size="sm"
                icon="search"
                title="No project roles match search"
                description="Adjust your search criteria."
              />
            ) : (
              <EmptyState
                size="sm"
                icon="lock"
                title="This project does not have any roles"
                description="Add a role to get started."
              />
            )
          }
        />
        {!isPending && list.pagination}
      </Stack>
      {sheet.key > 0 && (
        <RoleListRoleSheet
          key={sheet.key}
          projectId={projectId}
          roles={roles}
          open={sheet.open}
          mode={sheet.mode}
          onOpenChange={(open) => setSheet((current) => ({ ...current, open }))}
        />
      )}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText={deleting?.slug ?? ""}>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete "${deleting?.name ?? "project role"}"?`}</AlertDialogTitle>
            <AlertDialogDescription>
              This project role and its policies will be deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) remove(deleting);
                setDeleting(undefined);
              }}
            >
              Delete role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Stack>
  );
};
