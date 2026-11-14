import { useMemo, useState } from "react";
import { FilterBar, type FilterBarFilter } from "@infisical/cipher/patterns/filter-bar";
import { Banner } from "@infisical/cipher/ui/alert";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { List, ListRow } from "@infisical/cipher/ui/list";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";

import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import type { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection } from "@app/hooks/api/appConnections/types";
import { AppConnectionCredentialRotationStatus } from "@app/hooks/api/appConnections/types/root-connection-enums";
import { IntegrationsListPageTabs } from "@app/types/integrations";

import { failed } from "../../access/toast";
import { GhostEmpty } from "../../components/ghost-empty";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, v4Path } from "../../links";
import { projectBase } from "../../shell/navigation";
import { AppLogo } from "./AppLogo";
import { NewConnection } from "./NewConnection";

const route = v4Path("/organizations/$orgId/integrations");
const workflowTab = "workflow-integrations";
const migrationsTab = "external-migrations";
const sections = [IntegrationsListPageTabs.AppConnections, workflowTab, migrationsTab] as string[];

const methodName = (row: TAppConnection) => getAppConnectionMethodDetails(row.method).name;

const rotationBadge = (row: TAppConnection) => {
  if (!row.rotation) return null;
  if (!row.isAutoRotationEnabled) return <Badge tone="soft">Auto-rotation off</Badge>;
  if (row.rotation.rotationStatus === AppConnectionCredentialRotationStatus.Failed)
    return (
      <Badge tone="bad" dot>
        Rotation failed
      </Badge>
    );
  return (
    <Badge tone="soft">
      Rotates in {formatDistanceToNowStrict(new Date(row.rotation.nextRotationAt))}
    </Badge>
  );
};

const ConnectionMenu = ({
  row,
  onRotate,
  onDelete
}: {
  row: TAppConnection;
  onRotate: () => void;
  onDelete: () => void;
}) => {
  const managed = row.project ? `Managed in ${row.project.name}` : undefined;
  const rotateBlock = managed ?? (row.rotation ? undefined : "Credential rotation is off");
  return (
    <>
      <DropdownMenuItem onSelect={() => navigator.clipboard?.writeText(row.id)}>
        Copy connection ID
      </DropdownMenuItem>
      <DropdownMenuItem disabled={Boolean(managed)} description={managed}>
        Edit details
      </DropdownMenuItem>
      <DropdownMenuItem disabled={Boolean(managed)} description={managed}>
        Edit credentials
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={Boolean(rotateBlock)}
        description={rotateBlock}
        onSelect={onRotate}
      >
        Rotate credentials
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        disabled={Boolean(managed)}
        description={managed}
        onSelect={onDelete}
      >
        Delete connection
      </DropdownMenuItem>
    </>
  );
};

const AppConnectionsTab = ({ rows, isPending }: { rows: TAppConnection[]; isPending: boolean }) => {
  const { orgId } = useParams({ from: route });
  const integrations = useV4Adapter("integrations");
  const rotateCredentials = integrations.useRotateCredentials();
  const deleteConnection = integrations.useDeleteConnection();
  const [scope, setScope] = useState("org");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const filter = (filters.find((entry) => entry.field === "app")?.values ?? []) as AppConnection[];
  const [banner, setBanner] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState<{ columnId: string; direction: "asc" | "desc" }>({
    columnId: "app",
    direction: "asc"
  });
  const orgRows = rows.filter((row) => !row.projectId);
  const scoped = scope === "org" ? orgRows : rows;
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const key = (row: TAppConnection) =>
      ({
        app: APP_CONNECTION_MAP[row.app].name,
        name: row.name,
        method: methodName(row),
        managed: row.project?.name ?? ""
      })[sort.columnId as "app"] ?? row.name;
    return scoped
      .filter((row) => !filter.length || filter.includes(row.app))
      .filter((row) =>
        [APP_CONNECTION_MAP[row.app].name, row.name, methodName(row)].some((value) =>
          value.toLowerCase().includes(needle)
        )
      )
      .sort(
        (a, b) =>
          key(a).localeCompare(key(b)) * (sort.direction === "asc" ? 1 : -1) ||
          a.name.localeCompare(b.name)
      );
  }, [scoped, query, filter, sort]);
  const current = Math.min(page, Math.max(1, Math.ceil(visible.length / pageSize)));
  const columns: DataTableColumn<TAppConnection>[] = [
    {
      id: "app",
      header: "App",
      sortable: true,
      width: 220,
      text: (r) => APP_CONNECTION_MAP[r.app].name,
      render: (r) => (
        <Inline gap={8} align="center">
          <AppLogo app={r.app} />
          {APP_CONNECTION_MAP[r.app].name}
        </Inline>
      )
    },
    {
      id: "name",
      header: "Name",
      primary: true,
      sortable: true,
      grow: true,
      text: (r) => (r.description ? `${r.name}: ${r.description}` : r.name),
      render: (r) => r.name
    },
    {
      id: "method",
      header: "Method",
      sortable: true,
      width: 260,
      text: methodName,
      render: methodName
    },
    {
      id: "managed",
      header: "Managed by",
      sortable: true,
      width: 180,
      render: (r) =>
        r.project ? (
          <Button variant="link" asChild>
            <a
              href={orgHref(orgId, `${projectBase(r.project.type, r.project.id)}/app-connections`)}
            >
              <code>{r.project.name}</code>
            </a>
          </Button>
        ) : (
          "Organization"
        )
    },
    { id: "rotation", header: "Rotation", width: 200, render: rotationBadge }
  ];
  const filtered = Boolean(query.trim() || filter.length);
  return (
    <>
      {banner && (
        <Banner icon="info" onDismiss={() => setBanner(false)}>
          Projects can now create and manage their own app connections. Switch to All to see them
          here.
        </Banner>
      )}
      <FilterBar
        label="App connection filters"
        fields={[
          {
            key: "app",
            label: "App",
            type: "multi-select",
            options: [...new Set(rows.map((r) => r.app))]
              .sort((a, b) => APP_CONNECTION_MAP[a].name.localeCompare(APP_CONNECTION_MAP[b].name))
              .map((id) => ({ value: id, label: APP_CONNECTION_MAP[id].name }))
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
            <Tabs
              variant="segmented"
              label="Connection scope"
              value={scope}
              onChange={setScope}
              tabs={[
                {
                  value: "org",
                  label: "Organization",
                  count: rows.length ? orgRows.length : undefined
                },
                { value: "all", label: "All", count: rows.length || undefined }
              ]}
            />
            <NewConnection />
          </>
        }
      />
      <DataTable
        label="App connections"
        rows={visible.slice((current - 1) * pageSize, current * pageSize)}
        loading={isPending}
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
              onPageSizeChange={setPageSize}
            />
          ) : undefined
        }
        columns={columns}
        getRowId={(r) => r.id}
        rowLabel={(r) => r.name}
        rowActions={{
          renderMenu: (r) => (
            <ConnectionMenu
              row={r}
              onRotate={() =>
                rotateCredentials
                  .mutateAsync({ app: r.app, connectionId: r.id })
                  .catch((error) => failed("Failed to rotate credentials", error))
              }
              onDelete={() =>
                deleteConnection
                  .mutateAsync({ app: r.app, connectionId: r.id })
                  .catch((error) => failed("Failed to delete connection", error))
              }
            />
          )
        }}
        sort={sort}
        onSortChange={setSort}
        empty={
          filtered ? (
            <EmptyState
              size="sm"
              icon="search"
              title="No connections match your search"
              actions={
                <Button
                  variant="link"
                  onClick={() => {
                    setQuery("");
                    setFilters([]);
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <GhostEmpty layout="rows" icon="apps" title="No app connections yet" />
          )
        }
        persistentStatus={`${visible.length} of ${scoped.length} connections`}
      />
    </>
  );
};

const WorkflowIntegrationsTab = () => {
  const { orgId } = useParams({ from: route });
  const { data: workflowIntegrations = [], isPending } =
    useV4Adapter("integrations").useWorkflowIntegrations(orgId);
  if (isPending || workflowIntegrations.length)
    return (
      <List label="Workflow integrations" title="Workflow integrations">
        {workflowIntegrations.map((entry) => (
          <ListRow
            key={entry.id}
            value={entry.id}
            label={entry.slug}
            title={entry.slug}
            description={entry.description}
          />
        ))}
      </List>
    );
  return (
    <EmptyState
      icon="bell"
      title="No workflow integrations yet"
      description="Send access requests and approval notifications to Slack or Microsoft Teams."
      actions={
        <>
          <Button variant="primary" icon="plus">
            Add Slack
          </Button>
          <Button variant="outline" icon="plus">
            Add Microsoft Teams
          </Button>
        </>
      }
    />
  );
};

export const IntegrationsPage = () => {
  const navigate = useNavigate({ from: route });
  const { selectedTab } = useSearch({ from: route });
  const tab = sections.includes(selectedTab)
    ? selectedTab
    : IntegrationsListPageTabs.AppConnections;
  const { data: rows = [], isPending } = useV4Adapter("integrations").useConnections();
  return (
    <Stack gap={24}>
      <PageHeader
        title="Integrations"
        description="Connect external services once and use them across this organization."
        tabs={
          <Tabs
            label="Integration sections"
            value={tab}
            onChange={(value) => navigate({ search: (prev) => ({ ...prev, selectedTab: value }) })}
            tabs={[
              {
                value: IntegrationsListPageTabs.AppConnections,
                label: "App connections",
                content: null
              },
              { value: workflowTab, label: "Workflow integrations", content: null },
              { value: migrationsTab, label: "External migrations", content: null }
            ]}
          />
        }
      />
      {tab === IntegrationsListPageTabs.AppConnections && (
        <AppConnectionsTab rows={rows} isPending={isPending} />
      )}
      {tab === workflowTab && <WorkflowIntegrationsTab />}
      {tab === migrationsTab && (
        <List label="Migration sources" title="Import from another secret manager">
          {[
            ["vault", "HCP Vault", "Import key vaults or namespaces as projects and environments"],
            ["env-key", "EnvKey", "Import apps, environments and secrets from an export"]
          ].map(([id, title, description]) => (
            <ListRow
              key={id}
              value={id}
              label={title}
              title={title}
              description={description}
              actions={<Button variant="outline">Import</Button>}
            />
          ))}
        </List>
      )}
    </Stack>
  );
};
