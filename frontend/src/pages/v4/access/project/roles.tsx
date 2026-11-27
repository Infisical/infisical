import { useEffect, useState } from "react";
import { FilterBar } from "@infisical/cipher/patterns/filter-bar";
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
import { RowLink } from "@infisical/cipher/ui/row-link";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { WrenchIcon } from "lucide-react";

import { CustomRolesUpgradeIntent } from "@app/components/license/UpgradeGate/capability-upgrade-intents";
import { FolderAccessControlsUpgradeIntent } from "@app/components/license/UpgradeGate/upgrade-intents";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { isCustomProjectRole } from "@app/helpers/roles";
import { ProjectType } from "@app/hooks/api/projects/types";
import type { TProjectRole } from "@app/hooks/api/roles/types";

import { useV4Adapter } from "../../data/adapters";
import { UpgradeGate } from "../../license";
import { useBillingSubscription } from "../../license/product-icon";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { useProjectPermission } from "../permissions";
import { failed, saved } from "../toast";
import { Gate, RESTRICTED, usePagedList } from "../ui";
import { accessLabel } from "./product";
import { RoleListRoleSheet, type RoleSheetMode } from "./role-list-role-sheet";
import { useProjectScope } from "./scope";

import styles from "./tokens-roles.module.css";

type ProjectRoleRow = Omit<TProjectRole, "permissions">;

export const ProjectRolesTab = () => {
  const scope = useProjectScope();
  const { projectId } = scope;
  const go = useGo();
  const access = useV4Adapter("access");
  const { permission } = useProjectPermission(projectId);
  const { data: roles = [], isPending } = access.useProjectRoles(projectId, scope.projectType);
  const deleteRole = access.useDeleteProjectRole();
  const [sheet, setSheet] = useState<{ open: boolean; mode: RoleSheetMode; key: number }>({
    open: false,
    mode: { kind: "create" },
    key: 0
  });
  const [deleting, setDeleting] = useState<ProjectRoleRow>();
  const [upgrade, setUpgrade] = useState<"rbac" | "folder-access">();
  const subscription = useBillingSubscription();
  const isCertManager = scope.projectType === ProjectType.CertificateManager;
  const canOfferFolderAccess =
    scope.projectType === ProjectType.SecretManager && !subscription?.secretsFolderRbac;
  const canCreate = permission.can(ProjectPermissionActions.Create, ProjectPermissionSub.Role);
  const canEdit = permission.can(ProjectPermissionActions.Edit, ProjectPermissionSub.Role);
  const canDelete = permission.can(ProjectPermissionActions.Delete, ProjectPermissionSub.Role);

  const openSheet = (mode: RoleSheetMode) => {
    if (subscription && !subscription.rbac) {
      setUpgrade("rbac");
      return;
    }
    setSheet((current) => ({ open: true, mode, key: current.key + 1 }));
  };
  const openRole = (role: ProjectRoleRow) => go(accessLinks.projectRole(scope, role.slug));

  const navigate = useNavigate();
  const createRequested = useSearch({
    strict: false,
    select: (search) => Boolean((search as { createRole?: boolean }).createRole)
  });
  const hasRbac = subscription?.rbac;
  const createReady = canCreate && !isCertManager && hasRbac !== undefined;
  useEffect(() => {
    if (!createRequested || !createReady) return;
    if (hasRbac)
      setSheet((current) => ({ open: true, mode: { kind: "create" }, key: current.key + 1 }));
    else setUpgrade("rbac");
    navigate({
      to: ".",
      search: ((prev: Record<string, unknown>) => ({ ...prev, createRole: false })) as never,
      replace: true
    });
  }, [createRequested, createReady, hasRbac, navigate]);

  const list = usePagedList<ProjectRoleRow>({
    table: "projectRolesTable",
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
      await deleteRole.mutateAsync({ projectId, projectType: scope.projectType, id: role.id });
      saved(`${accessLabel(scope.projectType, "role")} "${role.name}" deleted`);
    } catch (error) {
      failed(`Failed to delete ${accessLabel(scope.projectType, "role").toLowerCase()}`, error);
    }
  };

  const columns: DataTableColumn<ProjectRoleRow>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      grow: true,
      render: (role) => (
        <RowLink link={go.link(accessLinks.projectRole(scope, role.slug))} title={role.name}>
          {role.name}
        </RowLink>
      )
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
            <Icon icon={WrenchIcon} size="var(--cipher-size-icon-caption)" />
            Custom
          </span>
        ) : (
          <span className={styles.source}>
            <Icon name="server" size="var(--cipher-size-icon-caption)" />
            Platform
          </span>
        )
    }
  ];

  const rowActions: DataTableRowActions<ProjectRoleRow> = {
    inline: isCertManager
      ? []
      : [
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
          <DropdownMenuItem
            disabled={!canEdit}
            description={canEdit ? undefined : RESTRICTED}
            onSelect={() => openRole(role)}
          >
            {custom ? <Icon name="pencil" /> : <Icon name="eye" />}
            {custom ? "Edit role" : "View role"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={!custom || !canDelete}
            description={
              custom ? (!canDelete && RESTRICTED) || undefined : "Built-in roles cannot be deleted"
            }
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
    <Stack gap="toolbar">
      <FilterBar
        label={`${accessLabel(scope.projectType, "role")} filters`}
        fields={[]}
        value={[]}
        onChange={() => undefined}
        search={
          <Input
            icon="search"
            aria-label={`Search ${accessLabel(scope.projectType, "roles").toLowerCase()}...`}
            placeholder={`Search ${accessLabel(scope.projectType, "roles").toLowerCase()}...`}
            slashShortcut
            value={list.search}
            onChange={(event) => list.setSearch(event.target.value)}
          />
        }
        actions={
          !isCertManager && (
            <Gate allowed={canCreate}>
              <Button
                variant="accent"
                icon="plus"
                disabled={!canCreate}
                onClick={() => openSheet({ kind: "create" })}
              >
                {`Add ${accessLabel(scope.projectType, "role").toLowerCase()}`}
              </Button>
            </Gate>
          )
        }
      />
      <DataTable
        filtered={roles.length > 0}
        label={`${accessLabel(scope.projectType, "roles")}`}
        rows={list.pageRows}
        columns={columns}
        rowActions={rowActions}
        getRowId={(role) => role.id}
        rowLabel={(role) => role.name}
        loading={isPending}
        loadingRows={10}
        sort={list.sort}
        onSortChange={list.setSort}
        empty={
          roles.length ? (
            <EmptyState
              size="sm"
              icon="search"
              title={`No ${accessLabel(scope.projectType, "roles").toLowerCase()} match search`}
            />
          ) : (
            <EmptyState size="sm" icon="id-badge" title="This project does not have any roles" />
          )
        }
        pagination={isPending ? undefined : list.pagination}
      />
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
      <UpgradeGate
        paywallKey="project.role"
        isOpen={upgrade === "rbac"}
        onOpenChange={(open) => !open && setUpgrade(undefined)}
        intent={{ ...CustomRolesUpgradeIntent, isEnterpriseFeature: false }}
        alternative={
          canOfferFolderAccess
            ? {
                title: "Only need folder-level access?",
                description:
                  "Folder access controls grant users and machine identities access to specific environments and folders without a custom role. They're included with Secrets Management Pro.",
                actionLabel: "View Pro plan",
                onSelect: () => setUpgrade("folder-access")
              }
            : undefined
        }
      />
      <UpgradeGate
        paywallKey="project.role.folder-access"
        isOpen={upgrade === "folder-access"}
        onOpenChange={(open) => !open && setUpgrade(undefined)}
        intent={FolderAccessControlsUpgradeIntent}
      />
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText={deleting?.slug ?? ""}>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete "${deleting?.name ?? `${accessLabel(scope.projectType, "role").toLowerCase()}`}"?`}</AlertDialogTitle>
            <AlertDialogDescription>
              Deletes the role and its policies. This cannot be undone.
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
