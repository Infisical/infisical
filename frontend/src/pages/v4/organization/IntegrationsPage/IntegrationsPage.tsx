import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";

import { Banner } from "@app/components/v4/ui/alert";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { List, ListRow } from "@app/components/v4/ui/list";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Pagination } from "@app/components/v4/ui/pagination";
import { Tabs } from "@app/components/v4/ui/tabs";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import type { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection } from "@app/hooks/api/appConnections/types";
import { AppConnectionCredentialRotationStatus } from "@app/hooks/api/appConnections/types/root-connection-enums";
import { IntegrationsListPageTabs } from "@app/types/integrations";

import { useV4Adapter } from "../../data/adapters";
import { projectBase } from "../../shell/navigation";
import { AppLogo } from "./AppLogo";
import { NewConnection } from "./NewConnection";

const route = "/v4/organizations/$orgId/integrations";
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
  const [filter, setFilter] = useState<AppConnection[]>([]);
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
              href={`/v4/organizations/${orgId}${projectBase(r.project.type, r.project.id)}/app-connections`}
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
      <Inline gap={8} align="center">
        <Tabs
          variant="segmented"
          label="Connection scope"
          value={scope}
          onChange={setScope}
          tabs={[
            { value: "org", label: "Organization", count: orgRows.length },
            { value: "all", label: "All", count: rows.length }
          ]}
        />
        <div style={{ flex: 1 }}>
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
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" icon="apps">
              {filter.length ? `Apps (${filter.length})` : "Apps"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Filter by app</DropdownMenuLabel>
            {[...new Set(rows.map((r) => r.app))]
              .sort((a, b) => APP_CONNECTION_MAP[a].name.localeCompare(APP_CONNECTION_MAP[b].name))
              .map((id) => (
                <DropdownMenuCheckboxItem
                  key={id}
                  checked={filter.includes(id)}
                  onCheckedChange={(on) => {
                    setFilter((all) => (on ? [...all, id] : all.filter((x) => x !== id)));
                    setPage(1);
                  }}
                >
                  {APP_CONNECTION_MAP[id].name}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </Inline>
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
              onRotate={() => rotateCredentials.mutateAsync({ app: r.app, connectionId: r.id })}
              onDelete={() => deleteConnection.mutateAsync({ app: r.app, connectionId: r.id })}
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
              description="Try another app, name or method."
              actions={
                <Button
                  variant="link"
                  onClick={() => {
                    setQuery("");
                    setFilter([]);
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              size="sm"
              icon="apps"
              title="No app connections yet"
              description="Connect a third-party app to sync secrets, rotate credentials and issue certificates."
            />
          )
        }
        footer={`${visible.length} of ${scoped.length} connections`}
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
        description="Connect Infisical to external services and manage organization-wide integrations."
        actions={<NewConnection />}
        tabs={
          <Tabs
            label="Integration sections"
            value={tab}
            onChange={(value) => navigate({ search: (prev) => ({ ...prev, selectedTab: value }) })}
            tabs={[
              {
                value: IntegrationsListPageTabs.AppConnections,
                label: "App connections",
                count: rows.filter((row) => !row.projectId).length,
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
