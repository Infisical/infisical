import { useEffect, useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Pagination } from "@app/components/v4/ui/pagination";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { ProjectIdentityOrderBy } from "@app/hooks/api/projects/types";

import { useV4Adapter } from "../../data/adapters";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { useProjectPermission } from "../permissions";
import { Gate, ListToolbar, RESTRICTED, RoleBadges, type Sort } from "../ui";
import { AddProjectIdentitySheet } from "./identity-add-sheet";
import { useAuthMethodFlows } from "./identity-auth";
import {
  AssumePrivilegesDialog,
  authMethodName,
  DELETE_PROTECTED,
  IdentityRemovalDialog,
  identitySubject,
  isProjectManaged,
  LockedBadge,
  lockoutText,
  ManagedByBadge,
  type ProjectIdentityMembership
} from "./identity-common";
import { useProjectScope } from "./scope";

import accessStyles from "../access.module.css";

const useDebounced = <T,>(value: T, delay = 300) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
};

export const ProjectIdentitiesTab = () => {
  const scope = useProjectScope();
  const { orgId, projectId } = scope;
  const access = useV4Adapter("access");
  const go = useGo();
  const { permission } = useProjectPermission(projectId);
  const { data: projectRoles = [] } = access.useProjectRoles(projectId);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search);
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>({ columnId: "name", direction: "asc" });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const { data, isPending } = access.useProjectIdentities({
    projectId,
    offset: (page - 1) * perPage,
    limit: perPage,
    orderBy: ProjectIdentityOrderBy.Name,
    orderDirection: sort.direction === "asc" ? OrderByDirection.ASC : OrderByDirection.DESC,
    search: debouncedSearch,
    roles: roleFilter
  });
  const rows = data?.identityMemberships ?? [];
  const totalCount = data?.totalCount ?? 0;

  useEffect(() => {
    if (!isPending && page > 1 && (page - 1) * perPage >= totalCount)
      setPage(Math.max(1, Math.ceil(totalCount / perPage)));
  }, [isPending, page, perPage, totalCount]);

  const [adding, setAdding] = useState(false);
  const [assuming, setAssuming] = useState<string>();
  const [removing, setRemoving] = useState<ProjectIdentityMembership>();
  const [authFor, setAuthFor] = useState<string>();
  const flows = useAuthMethodFlows(
    projectId,
    rows.find((row) => row.identity.id === authFor)?.identity
  );

  const canCreate = permission.can(
    ProjectPermissionIdentityActions.Create,
    ProjectPermissionSub.Identity
  );
  const can = (action: ProjectPermissionIdentityActions, identityId: string) =>
    permission.can(action, identitySubject(identityId));

  const columns: DataTableColumn<ProjectIdentityMembership>[] = [
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
      render: (row) => <RoleBadges roles={row.roles} />
    },
    {
      id: "managed",
      header: "Managed by",
      render: (row) => <ManagedByBadge identity={row.identity} />
    }
  ];

  const rowActions: DataTableRowActions<ProjectIdentityMembership> = {
    renderMenu: (row) => {
      const { identity } = row;
      let removeReason: string | undefined;
      if (!can(ProjectPermissionIdentityActions.Delete, identity.id)) removeReason = RESTRICTED;
      else if (isProjectManaged(identity) && identity.hasDeleteProtection)
        removeReason = DELETE_PROTECTED;
      return (
        <>
          {isProjectManaged(identity) && (
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
                    {identity.activeLockoutAuthMethods.includes(method) ? (
                      <Icon name="lock" />
                    ) : (
                      <Icon name="key" />
                    )}
                    {authMethodName(method)}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                  disabled={!can(ProjectPermissionIdentityActions.EditAuth, identity.id)}
                  description={
                    can(ProjectPermissionIdentityActions.EditAuth, identity.id)
                      ? undefined
                      : RESTRICTED
                  }
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
            disabled={!can(ProjectPermissionIdentityActions.AssumePrivileges, identity.id)}
            description={
              can(ProjectPermissionIdentityActions.AssumePrivileges, identity.id)
                ? undefined
                : RESTRICTED
            }
            onSelect={() => setAssuming(identity.id)}
          >
            <Icon name="user" />
            Assume privileges
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={Boolean(removeReason)}
            description={removeReason}
            onSelect={() => setRemoving(row)}
          >
            <Icon name="trash" />
            {isProjectManaged(identity) ? "Delete machine identity" : "Remove from project"}
          </DropdownMenuItem>
        </>
      );
    }
  };

  const searching = Boolean(debouncedSearch.trim() || roleFilter.length);

  return (
    <Stack gap={16}>
      <div className={accessStyles.toolbar}>
        <div className={accessStyles.grow}>
          <ListToolbar
            search={search}
            onSearch={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search project machine identities by name..."
            filter={{
              label: "Filter by project role",
              options: projectRoles.map((role) => ({ value: role.slug, label: role.name })),
              selected: roleFilter,
              onToggle: (slug) => {
                setRoleFilter((current) =>
                  current.includes(slug) ? current.filter((r) => r !== slug) : [...current, slug]
                );
                setPage(1);
              }
            }}
          />
        </div>
        <Gate allowed={canCreate}>
          <Button
            variant="accent"
            icon="plus"
            disabled={!canCreate}
            onClick={() => setAdding(true)}
          >
            Add machine identity to project
          </Button>
        </Gate>
      </div>
      <Stack gap={8}>
        <DataTable
          label="Project machine identities"
          rows={rows}
          columns={columns}
          rowActions={rowActions}
          getRowId={(row) => row.identity.id}
          rowLabel={(row) => row.identity.name}
          loading={isPending}
          loadingRows={10}
          sort={sort}
          onSortChange={(next) => {
            setSort(next);
            setPage(1);
          }}
          onRowActivate={(row) => go(accessLinks.projectIdentity(scope, row.identity.id))}
          empty={
            searching ? (
              <EmptyState size="sm" icon="search" title="No machine identities match search" />
            ) : (
              <EmptyState
                size="sm"
                icon="machine"
                title="No machine identities have been added to this project"
              />
            )
          }
        />
        {!isPending && totalCount > 0 && (
          <Pagination
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
        )}
      </Stack>
      <AddProjectIdentitySheet
        orgId={orgId}
        projectId={projectId}
        open={adding}
        onOpenChange={setAdding}
      />
      <AssumePrivilegesDialog
        orgId={orgId}
        projectId={projectId}
        identityId={assuming}
        onOpenChange={(open) => !open && setAssuming(undefined)}
      />
      <IdentityRemovalDialog
        projectId={projectId}
        identity={removing?.identity}
        from="list"
        onOpenChange={(open) => !open && setRemoving(undefined)}
      />
      {flows.overlays}
    </Stack>
  );
};
