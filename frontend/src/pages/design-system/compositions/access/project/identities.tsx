import { useMemo, useState } from "react";
import { UserRoundXIcon } from "lucide-react";

import { Button } from "@app/components/v4/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Stack } from "@app/components/v4/ui/layout";

import { useAccess } from "../context";
import { authMethodNames } from "../model";
import { type AccessColumn, AccessTable } from "../table";
import { Gate, ListToolbar, RoleBadges, useCan, usePagedList } from "../ui";
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
  const [menuFor, setMenuFor] = useState<string | undefined>(() =>
    startsWith("row-menu")
      ? data.orgIdentities.find((i) => i.name === "ci-deployer")?.id
      : undefined
  );
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

  const columns: AccessColumn<ProjectIdentityRow>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      width: "25%",
      render: (row) => <span>{row.identity.name}</span>
    },
    {
      id: "role",
      header: "Project role",
      width: "25%",
      render: (row) => <RoleBadges roles={row.membership.roles} catalog={data.projectRoles} />
    },
    {
      id: "managed",
      header: "Managed by",
      render: (row) => <ManagedByBadge identity={row.identity} />
    },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      render: (row) => {
        const { identity } = row;
        const isProjectIdentity = Boolean(identity.managedByProject);
        const locked = lockedMethods(identity);
        const lockout = lockoutText(identity);
        const deleteBlocked = isProjectIdentity && identity.hasDeleteProtection;
        return (
          <>
            {lockout && <LockedBadge label={lockout} />}
            <DropdownMenu
              open={menuFor === identity.id}
              onOpenChange={(open) => setMenuFor(open ? identity.id : undefined)}
            >
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-row" icon="more" iconOnly>
                  {`Open actions for ${identity.name}`}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isProjectIdentity && (
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
                          {locked.includes(method) ? <Icon name="lock" /> : <Icon name="key" />}
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
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!can("identity", "delete") || deleteBlocked}
                  description={deleteBlocked ? DELETE_PROTECTED : undefined}
                  onSelect={() => setRemoving(row)}
                >
                  {isProjectIdentity ? <Icon name="trash" /> : <Icon icon={UserRoundXIcon} />}
                  {isProjectIdentity ? "Delete machine identity" : "Remove from project"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        );
      }
    }
  ];

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
            variant="primary"
            icon="plus"
            disabled={!can("identity", "create")}
            onClick={() => setAdding(true)}
          >
            Add machine identity to project
          </Button>
        </Gate>
      </div>
      <Stack gap={8}>
        <AccessTable
          label="Project machine identities"
          rows={list.pageRows}
          columns={columns}
          getRowId={(row) => row.identity.id}
          rowLabel={(row) => row.identity.name}
          loading={loading ? 10 : undefined}
          sort={list.sort}
          onSortChange={list.setSort}
          onRowClick={openDetail}
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
