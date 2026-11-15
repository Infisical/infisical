import { useEffect, useMemo, useState } from "react";
import { subject } from "@casl/ability";
import { FilterBar, type FilterBarFilter } from "@infisical/cipher/patterns/filter-bar";
import { Banner } from "@infisical/cipher/ui/alert";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { PencilIcon } from "lucide-react";

import {
  OrgPermissionAppConnectionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import {
  ProjectPermissionAppConnectionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { buildGitHubAppUrl } from "@app/helpers/appConnections";
import { getProjectDisplayName } from "@app/helpers/project";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection } from "@app/hooks/api/appConnections/types";
import { GitHubConnectionMethod } from "@app/hooks/api/appConnections/types/github-connection";
import { ProjectType } from "@app/hooks/api/projects/types";

import { useOrgId, useOrgPermission, useProjectPermission } from "../access/permissions";
import { failed, saved } from "../access/toast";
import { AccessRestricted, RESTRICTED, type Sort } from "../access/ui";
import { GhostEmpty } from "../components/ghost-empty";
import { useV4Adapter } from "../data/adapters";
import { orgHref } from "../links";
import { AppLogo } from "../organization/IntegrationsPage/AppLogo";
import { projectBase } from "../shell/navigation";
import {
  AddConnectionSheet,
  ConnectionCredentialsSheet,
  DeleteConnectionDialog,
  EditConnectionDetailsDialog,
  RotationBadge
} from "./app-connection-dialogs";
import { appName, credentialsBlock, methodName } from "./app-connection-model";

export type AppConnectionsScope =
  | { kind: "org" }
  | { kind: "project"; projectId: string; projectType: ProjectType };

const VIEW_STORAGE_KEY = "app-connection-view";
const BANNER_STORAGE_KEY =
  "infisical:dismissed-alert:app_connections_project_scope_banner_dismissed";
const NO_ROTATION = "This method doesn't rotate credentials";

type View = "scope" | "all";

const readView = (): View => (localStorage.getItem(VIEW_STORAGE_KEY) === "all" ? "all" : "scope");

const sortKey = (row: TAppConnection, columnId: string) => {
  if (columnId === "name") return row.name;
  if (columnId === "method") return methodName(row);
  if (columnId === "managed") return row.project?.name ?? "";
  return appName(row.app);
};

const compareRows = (sort: Sort) => (a: TAppConnection, b: TAppConnection) => {
  if (sort.columnId === "managed" && Boolean(a.project) !== Boolean(b.project))
    return a.project ? -1 : 1;
  return (
    sortKey(a, sort.columnId).toLowerCase().localeCompare(sortKey(b, sort.columnId).toLowerCase()) *
    (sort.direction === "asc" ? 1 : -1)
  );
};

const isGitHubApp = (row: TAppConnection) =>
  row.app === AppConnection.GitHub && row.method === GitHubConnectionMethod.App;

type GitHubAppCredentials = {
  gitHubAppId?: string | null;
  host?: string;
  instanceType?: "cloud" | "server";
};

type DialogKind = "details" | "credentials" | "delete";

type Dialog = { kind: DialogKind; connection: TAppConnection } | undefined;

const useScopePermission = (scope: AppConnectionsScope) => {
  const org = useOrgPermission();
  const project = useProjectPermission(scope.kind === "project" ? scope.projectId : "");
  if (scope.kind === "org") {
    const can = (action: OrgPermissionAppConnectionActions, connectionId?: string) =>
      org.permission.can(
        action,
        connectionId
          ? subject(OrgPermissionSubjects.AppConnections, { connectionId })
          : OrgPermissionSubjects.AppConnections
      );
    return {
      isPending: org.isPending,
      canRead: can(OrgPermissionAppConnectionActions.Read),
      canCreate: can(OrgPermissionAppConnectionActions.Create),
      canEdit: (id: string) => can(OrgPermissionAppConnectionActions.Edit, id),
      canDelete: (id: string) => can(OrgPermissionAppConnectionActions.Delete, id)
    };
  }
  const can = (action: ProjectPermissionAppConnectionActions, connectionId?: string) =>
    project.permission.can(
      action,
      connectionId
        ? subject(ProjectPermissionSub.AppConnections, { connectionId })
        : ProjectPermissionSub.AppConnections
    );
  return {
    isPending: project.isPending,
    canRead: can(ProjectPermissionAppConnectionActions.Read),
    canCreate: can(ProjectPermissionAppConnectionActions.Create),
    canEdit: (id: string) => can(ProjectPermissionAppConnectionActions.Edit, id),
    canDelete: (id: string) => can(ProjectPermissionAppConnectionActions.Delete, id)
  };
};

type GitHubAppLink = { slug: string; href: string };

const useGitHubAppLinks = (connections: TAppConnection[], projectId?: string) => {
  const orgId = useOrgId();
  const { data: gitHubApps = [] } = useV4Adapter("integrations").useGitHubApps(
    connections.some(isGitHubApp) ? orgId : undefined,
    projectId ?? null
  );
  return (row: TAppConnection): GitHubAppLink | undefined => {
    if (!isGitHubApp(row)) return undefined;
    const credentials = row.credentials as GitHubAppCredentials | undefined;
    const linked = gitHubApps.find((entry) => entry.id === (credentials?.gitHubAppId ?? null));
    return linked
      ? {
          slug: linked.slug,
          href: buildGitHubAppUrl(linked.slug, credentials?.host, credentials?.instanceType)
        }
      : undefined;
  };
};

const useConnectionColumns = (connections: TAppConnection[], scope: AppConnectionsScope) => {
  const orgId = useOrgId();
  const isProject = scope.kind === "project";
  const gitHubLink = useGitHubAppLinks(connections, isProject ? scope.projectId : undefined);
  const { data: certInstance } = useV4Adapter("certificates").useInstanceState(orgId);
  const projectName = (row: TAppConnection) =>
    row.project
      ? getProjectDisplayName(row.project, Boolean(certInstance?.isMultiInstance))
      : "Organization";
  const projectHref = (project: NonNullable<TAppConnection["project"]>) =>
    orgHref(
      orgId,
      `${projectBase(project.type, project.id)}/${project.type === ProjectType.AgentVault ? "settings" : "app-connections"}`
    );
  const managedColumn: DataTableColumn<TAppConnection> = {
    id: "managed",
    header: "Managed by",
    sortable: true,
    width: 200,
    text: projectName,
    render: (row) =>
      row.project ? (
        <Button variant="link" asChild>
          <a href={projectHref(row.project)}>
            <span className="truncate">{projectName(row)}</span>
          </a>
        </Button>
      ) : (
        "Organization"
      )
  };
  const columns: DataTableColumn<TAppConnection>[] = [
    {
      id: "app",
      header: "App",
      sortable: true,
      width: 220,
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
              <Icon name="info" size={14} aria-label="Description" className="shrink-0" />
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
      render: (row) => {
        const link = gitHubLink(row);
        if (!link) return methodName(row);
        return (
          <Tooltip content={link.slug}>
            <Button variant="link" asChild>
              <a href={link.href} target="_blank" rel="noopener noreferrer">
                {methodName(row)}
              </a>
            </Button>
          </Tooltip>
        );
      }
    },
    ...(isProject ? [] : [managedColumn]),
    {
      id: "status",
      header: "Status",
      width: 240,
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
  return columns;
};

const ConnectionMenu = ({
  row,
  editBlock,
  deleteBlock,
  busy,
  onOpen,
  onRotate,
  onToggleAutoRotation
}: {
  row: TAppConnection;
  editBlock?: string;
  deleteBlock?: string;
  busy: boolean;
  onOpen: (kind: DialogKind) => void;
  onRotate: () => void;
  onToggleAutoRotation: () => void;
}) => {
  let rotationBlock = editBlock;
  if (!rotationBlock && busy) rotationBlock = "Saving";
  if (!rotationBlock && !row.rotation) rotationBlock = NO_ROTATION;
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
        disabledReason={editBlock ?? credentialsBlock(row)}
        onSelect={() => onOpen("credentials")}
      >
        <Icon name="key" />
        {row.isPlatformManagedCredentials ? "View credentials" : "Edit credentials"}
      </DropdownMenuItem>
      <DropdownMenuItem disabledReason={rotationBlock} onSelect={onRotate}>
        <Icon name="sync" />
        Rotate credentials
      </DropdownMenuItem>
      <DropdownMenuItem disabledReason={rotationBlock} onSelect={onToggleAutoRotation}>
        <Icon name="clock" />
        {row.isAutoRotationEnabled ? "Disable auto-rotation" : "Enable auto-rotation"}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        disabledReason={deleteBlock}
        onSelect={() => onOpen("delete")}
      >
        <Icon name="trash" />
        Delete connection
      </DropdownMenuItem>
    </>
  );
};

const ConnectionDialog = ({
  dialog,
  scope,
  returnTo,
  onClose
}: {
  dialog: Dialog;
  scope: AppConnectionsScope;
  returnTo: string;
  onClose: () => void;
}) => {
  if (!dialog) return null;
  const { connection } = dialog;
  if (dialog.kind === "details")
    return (
      <EditConnectionDetailsDialog key={connection.id} connection={connection} onClose={onClose} />
    );
  if (dialog.kind === "delete")
    return <DeleteConnectionDialog key={connection.id} connection={connection} onClose={onClose} />;
  return (
    <ConnectionCredentialsSheet
      key={connection.id}
      connection={connection}
      returnTo={returnTo}
      projectId={scope.kind === "project" ? scope.projectId : undefined}
      projectType={scope.kind === "project" ? scope.projectType : undefined}
      onClose={onClose}
    />
  );
};

const EmptyConnections = ({
  isProject,
  error,
  filtered,
  createBlock,
  onAdd,
  onClear
}: {
  isProject: boolean;
  error: unknown;
  filtered: boolean;
  createBlock?: string;
  onAdd: () => void;
  onClear: () => void;
}) => {
  if (error)
    return (
      <EmptyState
        size="sm"
        media="bare"
        icon="alert-c"
        title="Couldn't load app connections"
        description={error instanceof Error ? error.message : undefined}
      />
    );
  if (filtered)
    return (
      <EmptyState
        size="sm"
        media="bare"
        icon="search"
        title="No connections match your filters"
        actions={
          <Button variant="outline" onClick={onClear}>
            Clear filters
          </Button>
        }
      />
    );
  if (!isProject) return <GhostEmpty layout="rows" icon="apps" title="No app connections yet" />;
  return (
    <EmptyState
      size="sm"
      media="bare"
      icon="apps"
      title="No app connections yet"
      actions={
        <Button variant="outline" icon="plus" disabledReason={createBlock} onClick={onAdd}>
          Add connection
        </Button>
      }
    />
  );
};

const ProjectScopeBanner = () => {
  const [open, setOpen] = useState(() => localStorage.getItem(BANNER_STORAGE_KEY) !== "true");
  if (!open) return null;
  return (
    <Banner
      icon="info"
      onDismiss={() => {
        localStorage.setItem(BANNER_STORAGE_KEY, "true");
        setOpen(false);
      }}
    >
      App connections can also be created and managed in projects now.
    </Banner>
  );
};

/** The app a connection flow asked to reopen the add sheet with; the params are cleared after. */
const useReturnedConnectionFlow = () => {
  const navigate = useNavigate();
  const { addConnectionApp, connectionId } = useSearch({ strict: false }) as {
    addConnectionApp?: AppConnection;
    connectionId?: string;
  };
  useEffect(() => {
    if (!addConnectionApp && !connectionId) return;
    navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        addConnectionApp: undefined,
        connectionId: undefined,
        connectionName: undefined
      }),
      replace: true
    });
  }, [addConnectionApp, connectionId, navigate]);
  return addConnectionApp;
};

const useVisibleConnections = (
  connections: TAppConnection[],
  {
    isProject,
    view,
    filters,
    query,
    sort
  }: { isProject: boolean; view: View; filters: FilterBarFilter[]; query: string; sort: Sort }
) => {
  const scoped = useMemo(
    () => (isProject || view === "all" ? connections : connections.filter((row) => !row.projectId)),
    [connections, isProject, view]
  );
  const visible = useMemo(() => {
    const apps = new Set(filters.find((entry) => entry.field === "app")?.values ?? []);
    const needle = query.trim().toLowerCase();
    return scoped
      .filter((row) => !apps.size || apps.has(row.app))
      .filter((row) =>
        [appName(row.app), methodName(row), row.name].some((value) =>
          value.toLowerCase().includes(needle)
        )
      )
      .sort(compareRows(sort));
  }, [scoped, filters, query, sort]);
  return { scoped, visible };
};

/**
 * Main's AppConnectionsTable, for the org Integrations page and every project's App connections
 * page. returnTo is where a redirect method (OAuth, GitHub App install) comes back to.
 */
export const AppConnectionsTable = ({
  scope,
  returnTo
}: {
  scope: AppConnectionsScope;
  returnTo: string;
}) => {
  const isProject = scope.kind === "project";
  const projectId = isProject ? scope.projectId : undefined;
  const integrations = useV4Adapter("integrations");
  const access = useScopePermission(scope);
  const { data: connections = [], isPending, error } = integrations.useConnections(projectId);
  const columns = useConnectionColumns(connections, scope);
  const rotateCredentials = integrations.useRotateCredentials();
  const updateConnection = integrations.useUpdateConnection();
  const [view, setView] = useState<View>(readView);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [sort, setSort] = useState<Sort>({ columnId: "app", direction: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() =>
    getUserTablePreference("appConnectionsTable", PreferenceKey.PerPage, 20)
  );
  const returnedApp = useReturnedConnectionFlow();
  const [adding, setAdding] = useState<{ app?: AppConnection } | undefined>(() =>
    returnedApp ? { app: returnedApp } : undefined
  );
  const [dialog, setDialog] = useState<Dialog>();
  const [busy, setBusy] = useState<string>();
  const { scoped, visible } = useVisibleConnections(connections, {
    isProject,
    view,
    filters,
    query,
    sort
  });

  if (!access.isPending && !access.canRead)
    return <AccessRestricted requirement="read app connections" />;

  const current = Math.min(page, Math.max(1, Math.ceil(visible.length / pageSize)));
  const createBlock = access.canCreate ? undefined : RESTRICTED;
  const managedBlock = (row: TAppConnection) =>
    !isProject && row.project ? `Managed in ${row.project.name}` : undefined;
  const editBlock = (row: TAppConnection) =>
    managedBlock(row) ?? (access.canEdit(row.id) ? undefined : RESTRICTED);
  const deleteBlock = (row: TAppConnection) =>
    managedBlock(row) ?? (access.canDelete(row.id) ? undefined : RESTRICTED);
  const track = (row: TAppConnection, work: Promise<unknown>) => {
    setBusy(row.id);
    work.finally(() => setBusy(undefined));
  };
  const rotate = (row: TAppConnection) =>
    track(
      row,
      rotateCredentials
        .mutateAsync({ connectionId: row.id, app: row.app, projectId })
        .then(() => saved("Credential rotation started"))
        .catch((cause) => failed("Couldn't start credential rotation", cause))
    );
  const toggleAutoRotation = (row: TAppConnection) => {
    const enabling = !row.isAutoRotationEnabled;
    track(
      row,
      updateConnection
        .mutateAsync({ connectionId: row.id, app: row.app, isAutoRotationEnabled: enabling })
        .then(() => saved(enabling ? "Auto-rotation enabled" : "Auto-rotation disabled"))
        .catch((cause) =>
          failed(
            enabling ? "Couldn't enable auto-rotation" : "Couldn't disable auto-rotation",
            cause
          )
        )
    );
  };
  const clearFilters = () => {
    setQuery("");
    setFilters([]);
    setPage(1);
  };

  return (
    <Stack gap={16}>
      {!isProject && <ProjectScopeBanner />}
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
          <>
            {!isProject && (
              <Tabs
                variant="segmented"
                label="Connection scope"
                value={view}
                onChange={(next) => {
                  setView(next as View);
                  localStorage.setItem(VIEW_STORAGE_KEY, next);
                  setPage(1);
                }}
                tabs={[
                  { value: "scope", label: "Organization" },
                  { value: "all", label: "All" }
                ]}
              />
            )}
            <Button
              variant="accent"
              icon="plus"
              disabledReason={createBlock}
              onClick={() => setAdding({})}
            >
              Add connection
            </Button>
          </>
        }
      />
      <DataTable
        label="App connections"
        rows={visible.slice((current - 1) * pageSize, current * pageSize)}
        columns={columns}
        loading={(isPending || access.isPending) && !error}
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
          renderMenu: (row) => (
            <ConnectionMenu
              row={row}
              editBlock={editBlock(row)}
              deleteBlock={deleteBlock(row)}
              busy={busy === row.id}
              onOpen={(kind) => setDialog({ kind, connection: row })}
              onRotate={() => rotate(row)}
              onToggleAutoRotation={() => toggleAutoRotation(row)}
            />
          )
        }}
        empty={
          <EmptyConnections
            isProject={isProject}
            error={error}
            filtered={scoped.length > 0}
            createBlock={createBlock}
            onAdd={() => setAdding({})}
            onClear={clearFilters}
          />
        }
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
        key={adding?.app ?? "picker"}
        open={Boolean(adding)}
        onOpenChange={(open) => setAdding(open ? (adding ?? {}) : undefined)}
        returnTo={returnTo}
        projectId={projectId}
        projectType={isProject ? scope.projectType : undefined}
        app={adding?.app}
      />
      <ConnectionDialog
        dialog={dialog}
        scope={scope}
        returnTo={returnTo}
        onClose={() => setDialog(undefined)}
      />
    </Stack>
  );
};
