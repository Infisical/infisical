import { useMemo, useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Inline, Stack } from "@app/components/v4/ui/layout";

import { useAccess } from "../context";
import { authMethodNames } from "../model";
import { Gate, ListToolbar, RoleBadges, useCan, usePagedList, RESTRICTED } from "../ui";
import { AddProjectIdentitySheet } from "./identity-add-sheet";
import { useAuthMethodFlows } from "./identity-auth";
import {
  ASSUME_HINT,
  AssumePrivilegesDialog,
  DELETE_PROTECTED,
  IdentityRemovalDialog,
  LockedBadge,
  lockedMethods,
  lockoutText,
  ManagedByBadge,
  type ProjectIdentityRow,
  projectIdentityRows
} from "./identity-common";

import accessStyles from "../access.module.css";

export { ProjectIdentityDetail } from "./identity-detail";

export const ProjectIdentitiesTab = () => {
  const { data, loading, navigate, startsWith } = useAccess();
  const can = useCan("project");
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [adding, setAdding] = useState(() => startsWith("add") || startsWith("add-create-new"));
  const [assuming, setAssuming] = useState(false);
  const [removing, setRemoving] = useState<ProjectIdentityRow>();
  const [authFor, setAuthFor] = useState<string>();
  const flows = useAuthMethodFlows(data.orgIdentities.find((identity) => identity.id === authFor));

  const allRows = useMemo(() => projectIdentityRows(data), [data]);
  const rows = useMemo(
    () =>
      allRows.filter(
        (row) =>
          !roleFilter.length ||
          row.membership.roles.some((grant) => roleFilter.includes(grant.role))
      ),
    [allRows, roleFilter]
  );
  const list = usePagedList({
    rows,
    initialSort: { columnId: "name", direction: "asc" },
    matches: (row, needle) => row.identity.name.toLowerCase().includes(needle),
    compare: (a, b) => a.identity.name.localeCompare(b.identity.name)
  });

  const openDetail = (row: ProjectIdentityRow) =>
    navigate({
      detail: {
        kind: "project-identity",
        id: row.identity.id,
        label: row.identity.name,
        mono: true
      }
    });

  const columns: DataTableColumn<ProjectIdentityRow>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      grow: true,
      render: (row) => {
        const lockout = lockoutText(row.identity);
        return (
          <Inline gap={8} wrap={false}>
            <span>{row.identity.name}</span>
            {lockout && <LockedBadge label={lockout} />}
          </Inline>
        );
      }
    },
    {
      id: "role",
      header: "Project role",
      grow: true,
      render: (row) => <RoleBadges roles={row.membership.roles} catalog={data.projectRoles} />
    },
    {
      id: "managed",
      header: "Managed by",
      render: (row) => <ManagedByBadge identity={row.identity} />
    }
  ];

  const rowActions: DataTableRowActions<ProjectIdentityRow> = {
    inline: [
      {
        label: (row) =>
          row.identity.managedByProject ? "Delete machine identity" : "Remove from project",
        icon: "trash",
        disabledReason: (row) => {
          if (row.identity.managedByProject && row.identity.hasDeleteProtection)
            return DELETE_PROTECTED;
          return can("identity", "delete") ? undefined : RESTRICTED;
        },
        onSelect: setRemoving
      }
    ],
    renderMenu: ({ identity }) => (
      <>
        {identity.managedByProject && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Icon name="key" />
              Manage auth methods
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {identity.authMethods.map((method) => (
                <DropdownMenuItem
                  key={method}
                  onSelect={() => {
                    setAuthFor(identity.id);
                    flows.view(method);
                  }}
                >
                  {lockedMethods(identity).includes(method) ? (
                    <Icon name="lock" />
                  ) : (
                    <Icon name="key" />
                  )}
                  {authMethodNames[method]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                disabled={!can("identity", "edit")}
                onSelect={() => {
                  setAuthFor(identity.id);
                  flows.add();
                }}
              >
                <Icon name="plus" />
                Add auth method
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuItem
          disabled={!can("identity", "edit")}
          description={ASSUME_HINT}
          onSelect={() => setAssuming(true)}
        >
          <Icon name="user" />
          Assume privileges
        </DropdownMenuItem>
      </>
    )
  };

  const searching = Boolean(list.search.trim() || roleFilter.length);

  return (
    <Stack gap={16}>
      <div className={accessStyles.toolbar}>
        <div className={accessStyles.grow}>
          <ListToolbar
            search={list.search}
            onSearch={list.setSearch}
            placeholder="Search project machine identities by name..."
            filter={{
              label: "Filter by project role",
              options: data.projectRoles.map((role) => ({ value: role.slug, label: role.name })),
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
        <Gate allowed={can("identity", "create")}>
          <Button
            variant="accent"
            icon="plus"
            disabled={!can("identity", "create")}
            onClick={() => setAdding(true)}
          >
            Add machine identity to project
          </Button>
        </Gate>
      </div>
      <Stack gap={8}>
        <DataTable
          label="Project machine identities"
          rows={list.pageRows}
          columns={columns}
          rowActions={rowActions}
          getRowId={(row) => row.identity.id}
          rowLabel={(row) => row.identity.name}
          loading={loading}
          loadingRows={10}
          sort={list.sort}
          onSortChange={list.setSort}
          onRowActivate={openDetail}
          empty={
            searching ? (
              <EmptyState
                size="sm"
                icon="search"
                title="No machine identities match search"
                description="Adjust your search or filter criteria."
              />
            ) : (
              <EmptyState
                size="sm"
                icon="machine"
                title="No machine identities have been added to this project"
                description="Add a machine identity to get started."
              />
            )
          }
        />
        {!loading && list.pagination}
      </Stack>
      <AddProjectIdentitySheet
        open={adding}
        initialMode={startsWith("add-create-new") ? "create" : undefined}
        onOpenChange={setAdding}
      />
      <AssumePrivilegesDialog open={assuming} onOpenChange={setAssuming} />
      <IdentityRemovalDialog
        row={removing}
        from="list"
        onOpenChange={(open) => !open && setRemoving(undefined)}
      />
      {flows.overlays}
    </Stack>
  );
};
