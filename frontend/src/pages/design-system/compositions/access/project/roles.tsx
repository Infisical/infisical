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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Stack } from "@app/components/v4/ui/layout";

import { useAccess } from "../context";
import type { Role } from "../model";
import { type AccessColumn, AccessTable } from "../table";
import { Gate, ListToolbar, useCan, usePagedList } from "../ui";
import { RoleListRoleSheet, type RoleSheetMode } from "./role-list-role-sheet";

import shared from "../access.module.css";
import styles from "./tokens-roles.module.css";

export const ProjectRolesTab = () => {
  const { data, update, saved, loading, navigate, startsWith } = useAccess();
  const can = useCan("project");
  const [sheet, setSheet] = useState<{ open: boolean; mode: RoleSheetMode; key: number }>(() => ({
    open: startsWith("create"),
    mode: {
      kind: "create",
      prefill: startsWith("create")
        ? { name: "Release approver", description: "Approves production secret changes" }
        : undefined
    },
    key: 0
  }));
  const [deleting, setDeleting] = useState<Role>();

  const openSheet = (mode: RoleSheetMode) =>
    setSheet((current) => ({ open: true, mode, key: current.key + 1 }));
  const openRole = (role: Role) =>
    navigate({ detail: { kind: "project-role", id: role.id, label: role.name } });

  const list = usePagedList({
    rows: data.projectRoles,
    initialSort: { columnId: "source", direction: "asc" },
    matches: (role, needle) =>
      role.name.toLowerCase().includes(needle) || role.slug.toLowerCase().includes(needle),
    compare: (a, b, column) => {
      if (column === "source") return Number(!a.builtIn) - Number(!b.builtIn);
      if (column === "slug") return a.slug.toLowerCase().localeCompare(b.slug.toLowerCase());
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    }
  });

  const columns: AccessColumn<Role>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      width: "33%",
      render: (role) => <span>{role.name}</span>
    },
    {
      id: "slug",
      header: "Slug",
      sortable: true,
      width: "33%",
      render: (role) => <span>{role.slug}</span>
    },
    {
      id: "source",
      header: "Source",
      sortable: true,
      render: (role) =>
        role.builtIn ? (
          <span className={styles.source}>
            <Icon icon={ServerIcon} size={12} />
            Platform
          </span>
        ) : (
          <span className={styles.source}>
            <Icon icon={WrenchIcon} size={12} />
            Custom
          </span>
        )
    },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      render: (role) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-row" icon="more" iconOnly>
              {`Open actions for ${role.name}`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!can("role", "edit")} onSelect={() => openRole(role)}>
              {role.builtIn ? <Icon name="eye" /> : <Icon icon={PencilIcon} />}
              {role.builtIn ? "View role" : "Edit role"}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!can("role", "create")}
              onSelect={() => openSheet({ kind: "duplicate", source: role })}
            >
              <Icon name="copy" />
              Duplicate role
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={role.builtIn || !can("role", "delete")}
              description={role.builtIn ? "Built-in roles cannot be deleted" : undefined}
              onSelect={() => setDeleting(role)}
            >
              <Icon name="trash" />
              Delete role
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

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
        <Gate allowed={can("role", "create")}>
          <Button
            variant="primary"
            icon="plus"
            disabled={!can("role", "create")}
            onClick={() => openSheet({ kind: "create" })}
          >
            Add project role
          </Button>
        </Gate>
      </div>
      <Stack gap={8}>
        <AccessTable
          label="Project roles"
          rows={list.pageRows}
          columns={columns}
          getRowId={(role) => role.id}
          rowLabel={(role) => role.name}
          loading={loading ? 10 : undefined}
          sort={list.sort}
          onSortChange={list.setSort}
          onRowClick={openRole}
          empty={
            data.projectRoles.length ? (
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
        {!loading && list.pagination}
      </Stack>
      <RoleListRoleSheet
        key={sheet.key}
        open={sheet.open}
        mode={sheet.mode}
        onOpenChange={(open) => setSheet((current) => ({ ...current, open }))}
      />
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
                if (deleting) {
                  update((current) => ({
                    ...current,
                    projectRoles: current.projectRoles.filter((r) => r.id !== deleting.id)
                  }));
                  saved(`Project role "${deleting.name}" deleted`);
                }
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
