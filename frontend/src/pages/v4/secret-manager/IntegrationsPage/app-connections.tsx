import { useEffect, useMemo, useState } from "react";
import { subject } from "@casl/ability";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { PencilIcon } from "lucide-react";

import { FilterBar, type FilterBarFilter } from "@app/components/v4/patterns/filter-bar";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Pagination } from "@app/components/v4/ui/pagination";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import {
  ProjectPermissionAppConnectionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import type { TAppConnection } from "@app/hooks/api/appConnections/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { useProjectPermission } from "../../access/permissions";
import { failed, saved } from "../../access/toast";
import { AccessRestricted, RESTRICTED, type Sort } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import {
  AddConnectionSheet,
  appName,
  ConnectionCredentialsSheet,
  credentialsBlock,
  DeleteConnectionDialog,
  EditConnectionDetailsDialog,
  methodName,
  RotationBadge
} from "../../integrations/app-connection-dialogs";
import { orgHref, v4Path } from "../../links";
import { AppLogo } from "../../organization/IntegrationsPage/AppLogo";

const route = v4Path("/organizations/$orgId/projects/secret-management/$projectId/integrations/");
const path = v4Path("/organizations/$orgId/projects/secret-management/$projectId/integrations");

export const APP_CONNECTIONS_TAB = "app-connections";

const NO_ROTATION = "This method doesn't rotate credentials";

const sortKey = (row: TAppConnection, columnId: string) => {
  if (columnId === "name") return row.name;
  if (columnId === "method") return methodName(row);
  return appName(row.app);
};

type Dialog =
  | { kind: "details" | "credentials" | "delete"; connection: TAppConnection }
  | undefined;

export const AppConnectionsTab = ({ orgId, projectId }: { orgId: string; projectId: string }) => {
  const integrations = useV4Adapter("integrations");
  const navigate = useNavigate();
  const { addConnectionApp, connectionId } = useSearch({ from: route });
  const { permission, isPending: permissionPending } = useProjectPermission(projectId);
  const { data: connections = [], isPending, error } = integrations.useConnections(projectId);
  const rotateCredentials = integrations.useRotateCredentials();
  const updateConnection = integrations.useUpdateConnection();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [sort, setSort] = useState<Sort>({ columnId: "app", direction: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() =>
    getUserTablePreference("appConnectionsTable", PreferenceKey.PerPage, 20)
  );
  const [adding, setAdding] = useState(false);
  const [presetApp, setPresetApp] = useState(addConnectionApp);
  const [dialog, setDialog] = useState<Dialog>();

  useEffect(() => {
    if (!addConnectionApp && !connectionId) return;
    if (addConnectionApp) {
      setPresetApp(addConnectionApp);
      setAdding(true);
    }
    navigate({
      to: path,
      params: { orgId, projectId },
      search: { selectedTab: APP_CONNECTIONS_TAB },
      replace: true
    });
  }, [addConnectionApp, connectionId]);

  const apps = filters.find((entry) => entry.field === "app")?.values ?? [];
  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      connections
        .filter((row) => !apps.length || apps.includes(row.app))
        .filter((row) =>
          [appName(row.app), methodName(row), row.name].some((value) =>
            value.toLowerCase().includes(needle)
          )
        )
        .sort(
          (a, b) =>
            sortKey(a, sort.columnId)
              .toLowerCase()
              .localeCompare(sortKey(b, sort.columnId).toLowerCase()) *
            (sort.direction === "asc" ? 1 : -1)
        ),
    [connections, apps, needle, sort]
  );

  if (
    !permissionPending &&
    !permission.can(ProjectPermissionAppConnectionActions.Read, ProjectPermissionSub.AppConnections)
  )
    return <AccessRestricted requirement="read app connections" />;

  const canCreate = permission.can(
    ProjectPermissionAppConnectionActions.Create,
    ProjectPermissionSub.AppConnections
  );
  const blockedBy = (action: ProjectPermissionAppConnectionActions, row: TAppConnection) =>
    permission.can(action, subject(ProjectPermissionSub.AppConnections, { connectionId: row.id }))
      ? undefined
      : RESTRICTED;
  const editBlock = (row: TAppConnection) =>
    blockedBy(ProjectPermissionAppConnectionActions.Edit, row);
  const current = Math.min(page, Math.max(1, Math.ceil(visible.length / pageSize)));
  const isFiltered = Boolean(needle) || apps.length > 0;

  const rotate = (row: TAppConnection) =>
    rotateCredentials
      .mutateAsync({ connectionId: row.id, app: row.app, projectId })
      .then(() => saved("Credential rotation started"))
      .catch((cause) => failed("Couldn't start credential rotation", cause));
  const toggleAutoRotation = (row: TAppConnection) => {
    const enabling = !row.isAutoRotationEnabled;
    return updateConnection
      .mutateAsync({ connectionId: row.id, app: row.app, isAutoRotationEnabled: enabling })
      .then(() => saved(enabling ? "Auto-rotation enabled" : "Auto-rotation disabled"))
      .catch((cause) =>
        failed(enabling ? "Couldn't enable auto-rotation" : "Couldn't disable auto-rotation", cause)
      );
  };

  const columns: DataTableColumn<TAppConnection>[] = [
    {
      id: "app",
      header: "App",
      sortable: true,
      width: 240,
      text: (row) => appName(row.app),
      render: (row) => (
        <Inline gap={8} align="center" wrap={false}>
          <AppLogo app={row.app} />
          <span className="truncate">{appName(row.app)}</span>
        </Inline>
      )
    },
    {
      id: "name",
      header: "Name",
      primary: true,
      sortable: true,
      grow: true,
      text: (row) => (row.description ? `${row.name}: ${row.description}` : row.name),
      render: (row) => (
        <Inline gap={4} align="center" wrap={false}>
          <span className="truncate">{row.name}</span>
          {row.description && (
            <Tooltip content={row.description}>
              <Icon name="info" size={14} aria-label="Description" />
            </Tooltip>
          )}
        </Inline>
      )
    },
    {
      id: "method",
      header: "Method",
      sortable: true,
      width: 220,
      text: methodName,
      render: methodName
    },
    {
      id: "status",
      header: "Status",
      width: 260,
      render: (row) => (
        <Inline gap={4} align="center" wrap={false}>
          {row.isPlatformManagedCredentials && (
            <Tooltip content="Infisical manages this connection's credentials.">
              <Badge tone="info">Platform managed</Badge>
            </Tooltip>
          )}
          <RotationBadge row={row} />
        </Inline>
      )
    }
  ];

  let empty = (
    <EmptyState
      size="sm"
      media="bare"
      icon="apps"
      title="This project has no app connections"
      actions={
        <Button
          variant="outline"
          icon="plus"
          disabledReason={canCreate ? undefined : RESTRICTED}
          onClick={() => setAdding(true)}
        >
          Add connection
        </Button>
      }
    />
  );
  if (error)
    empty = (
      <EmptyState
        size="sm"
        media="bare"
        icon="alert-c"
        title="Couldn't load app connections"
        description={error instanceof Error ? error.message : undefined}
      />
    );
  else if (isFiltered && connections.length)
    empty = (
      <EmptyState
        size="sm"
        media="bare"
        icon="search"
        title="No connections match your filters"
        actions={
          <Button
            variant="outline"
            onClick={() => {
              setQuery("");
              setFilters([]);
              setPage(1);
            }}
          >
            Clear filters
          </Button>
        }
      />
    );

  return (
    <Stack gap={16}>
      <FilterBar
        label="App connection filters"
        fields={[
          {
            key: "app",
            label: "App",
            type: "multi-select",
            options: [...new Set(connections.map((row) => row.app))]
              .sort((a, b) => appName(a).localeCompare(appName(b)))
              .map((app) => ({ value: app, label: appName(app) }))
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
            aria-label="Search app connections"
            placeholder="Search by app, name or method"
            kbd="/"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        }
        actions={
          <Button
            variant="accent"
            icon="plus"
            disabledReason={canCreate ? undefined : RESTRICTED}
            onClick={() => setAdding(true)}
          >
            Add connection
          </Button>
        }
      />
      <DataTable
        label="App connections"
        rows={visible.slice((current - 1) * pageSize, current * pageSize)}
        columns={columns}
        loading={(isPending || permissionPending) && !error}
        loadingRows={3}
        getRowId={(row) => row.id}
        rowLabel={(row) => row.name}
        sort={sort}
        onSortChange={(next) => {
          setSort(next);
          setPage(1);
        }}
        rowActions={{
          inline: [
            {
              label: "Edit details",
              icon: PencilIcon,
              disabledReason: editBlock,
              onSelect: (row) => setDialog({ kind: "details", connection: row })
            }
          ],
          menuLabel: "Connection options",
          renderMenu: (row) => {
            const blocked = editBlock(row);
            const rotationBlock = blocked ?? (row.rotation ? undefined : NO_ROTATION);
            return (
              <>
                <DropdownMenuItem
                  onSelect={() =>
                    navigator.clipboard
                      .writeText(row.id)
                      .then(() => saved("Connection ID copied"))
                      .catch((cause) => failed("Couldn't copy the connection ID", cause))
                  }
                >
                  <Icon name="copy" />
                  Copy connection ID
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabledReason={blocked ?? credentialsBlock(row)}
                  onSelect={() => setDialog({ kind: "credentials", connection: row })}
                >
                  <Icon name="key" />
                  {row.isPlatformManagedCredentials ? "View credentials" : "Edit credentials"}
                </DropdownMenuItem>
                <DropdownMenuItem disabledReason={rotationBlock} onSelect={() => rotate(row)}>
                  <Icon name="sync" />
                  Rotate credentials
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabledReason={rotationBlock}
                  onSelect={() => toggleAutoRotation(row)}
                >
                  <Icon name="clock" />
                  {row.isAutoRotationEnabled ? "Disable auto-rotation" : "Enable auto-rotation"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabledReason={blockedBy(ProjectPermissionAppConnectionActions.Delete, row)}
                  onSelect={() => setDialog({ kind: "delete", connection: row })}
                >
                  <Icon name="trash" />
                  Delete connection
                </DropdownMenuItem>
              </>
            );
          }
        }}
        empty={empty}
        pagination={
          visible.length > 0 ? (
            <Pagination
              label="App connection pages"
              variant="compact"
              page={current}
              onPageChange={setPage}
              total={visible.length}
              pageSize={pageSize}
              pageSizeOptions={[10, 20, 50, 100]}
              onPageSizeChange={(next) => {
                setPageSize(next);
                setUserTablePreference("appConnectionsTable", PreferenceKey.PerPage, next);
                setPage(1);
              }}
            />
          ) : undefined
        }
      />
      <AddConnectionSheet
        open={adding}
        onOpenChange={(open) => {
          setAdding(open);
          if (!open) setPresetApp(undefined);
        }}
        returnTo={orgHref(
          orgId,
          `/projects/secret-management/${projectId}/integrations?selectedTab=${APP_CONNECTIONS_TAB}`
        )}
        projectId={projectId}
        projectType={ProjectType.SecretManager}
        app={presetApp}
      />
      {dialog?.kind === "details" && (
        <EditConnectionDetailsDialog
          key={dialog.connection.id}
          connection={dialog.connection}
          onClose={() => setDialog(undefined)}
        />
      )}
      {dialog?.kind === "credentials" && (
        <ConnectionCredentialsSheet
          key={dialog.connection.id}
          connection={dialog.connection}
          onClose={() => setDialog(undefined)}
        />
      )}
      {dialog?.kind === "delete" && (
        <DeleteConnectionDialog
          key={dialog.connection.id}
          connection={dialog.connection}
          onClose={() => setDialog(undefined)}
        />
      )}
    </Stack>
  );
};
