import { useMemo, useState } from "react";

import { useV4Theme } from "@app/components/v4/scope";
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
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Media } from "@app/components/v4/ui/item";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { DataList, List, ListRow, ListSection } from "@app/components/v4/ui/list";
import { MultiStep } from "@app/components/v4/ui/multi-step";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Select } from "@app/components/v4/ui/select";
import { Tabs } from "@app/components/v4/ui/tabs";
import { Textarea } from "@app/components/v4/ui/textarea";

import { Shell, useCrumbs } from "./shared";

type AppId = "aws" | "github" | "vercel" | "gcp" | "azure-key-vault" | "databricks";
type Method = { value: string; label: string; fields: { label: string; secret?: boolean }[] };
const apps: Record<
  AppId,
  { name: string; image: string; onLight?: string; category: string; methods: Method[] }
> = {
  aws: {
    name: "AWS",
    image: "Amazon Web Services.png",
    onLight: "Amazon Web Services.on-light.png",
    category: "Cloud",
    methods: [
      { value: "assume-role", label: "Assume role", fields: [{ label: "Role ARN" }] },
      {
        value: "access-key",
        label: "Access key",
        fields: [{ label: "Access key ID" }, { label: "Secret access key", secret: true }]
      }
    ]
  },
  github: {
    name: "GitHub",
    image: "GitHub.png",
    onLight: "GitHub.on-light.png",
    category: "Source control",
    methods: [
      { value: "app", label: "GitHub App", fields: [{ label: "Installation ID" }] },
      { value: "oauth", label: "OAuth", fields: [] }
    ]
  },
  vercel: {
    name: "Vercel",
    image: "Vercel.png",
    category: "Hosting",
    methods: [
      { value: "api-token", label: "API token", fields: [{ label: "API token", secret: true }] }
    ]
  },
  gcp: {
    name: "GCP",
    image: "Google Cloud Platform.png",
    category: "Cloud",
    methods: [
      {
        value: "impersonation",
        label: "Service account impersonation",
        fields: [{ label: "Service account email" }]
      }
    ]
  },
  "azure-key-vault": {
    name: "Azure Key Vault",
    image: "Microsoft Azure.png",
    category: "Secret store",
    methods: [
      { value: "oauth", label: "OAuth", fields: [{ label: "Tenant ID" }] },
      {
        value: "client-secret",
        label: "Client secret",
        fields: [
          { label: "Tenant ID" },
          { label: "Client ID" },
          { label: "Client secret", secret: true }
        ]
      }
    ]
  },
  databricks: {
    name: "Databricks",
    image: "Databricks.png",
    category: "Data",
    methods: [
      {
        value: "service-principal",
        label: "Service principal",
        fields: [
          { label: "Workspace URL" },
          { label: "Client ID" },
          { label: "Client secret", secret: true }
        ]
      }
    ]
  }
};
const popular: AppId[] = ["aws", "github", "vercel", "gcp"];
const appIds = Object.keys(apps) as AppId[];

const AppLogo = ({ app, size = "sm" }: { app: AppId; size?: "sm" | "md" }) => {
  const theme = useV4Theme();
  const { image, onLight, name } = apps[app];
  return (
    <Media size={size}>
      <img
        src={`/images/integrations/${theme === "dark" ? image : (onLight ?? image)}`}
        alt={`${name} logo`}
        width={size === "sm" ? 16 : 20}
        height={size === "sm" ? 16 : 20}
      />
    </Media>
  );
};

type Status = { tone: "ok" | "warn" | "bad" | "info" | "soft"; label: string };
type Connection = {
  id: string;
  app: AppId;
  name: string;
  description?: string;
  method: string;
  project?: string;
  status: Status;
  rotation?: boolean;
};
const connected: Status = { tone: "ok", label: "Connected" };
const seed: Connection[] = [
  {
    id: "c1",
    app: "aws",
    name: "aws-production",
    description: "Production account 4417, used by secret syncs",
    method: "Assume role",
    status: connected
  },
  {
    id: "c2",
    app: "aws",
    name: "aws-staging-keys",
    method: "Access key",
    status: { tone: "soft", label: "Rotates in 27 days" },
    rotation: true
  },
  { id: "c3", app: "github", name: "github-acme", method: "GitHub App", status: connected },
  {
    id: "c4",
    app: "gcp",
    name: "gcp-platform-core",
    method: "Service account impersonation",
    status: connected
  },
  {
    id: "c5",
    app: "azure-key-vault",
    name: "azure-kv-eu-west",
    method: "Client secret",
    status: { tone: "bad", label: "Rotation failed" },
    rotation: true
  },
  {
    id: "c6",
    app: "databricks",
    name: "databricks-analytics",
    method: "Service principal",
    status: { tone: "warn", label: "Secret expires in 5 days" }
  },
  {
    id: "c7",
    app: "vercel",
    name: "vercel-web-dashboard",
    method: "API token",
    project: "web-dashboard",
    status: connected
  },
  {
    id: "c8",
    app: "github",
    name: "github-ci-readonly",
    method: "OAuth",
    project: "platform-core",
    status: connected
  },
  {
    id: "c9",
    app: "aws",
    name: "aws-route53-pki",
    description: "DNS validation for ACME issuance",
    method: "Assume role",
    project: "internal-pki",
    status: connected
  }
];

const RowActions = ({ row, onDelete }: { row: Connection; onDelete: () => void }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon-sm" icon="more" iconOnly>
        {`Actions for ${row.name}`}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onSelect={() => navigator.clipboard?.writeText(row.id)}>
        Copy connection ID
      </DropdownMenuItem>
      <DropdownMenuItem disabled={Boolean(row.project)}>Edit details</DropdownMenuItem>
      <DropdownMenuItem disabled={Boolean(row.project)}>Edit credentials</DropdownMenuItem>
      {row.rotation && <DropdownMenuItem>Rotate credentials</DropdownMenuItem>}
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" disabled={Boolean(row.project)} onSelect={onDelete}>
        Delete connection
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

const NewConnection = ({ onCreate }: { onCreate: (connection: Connection) => void }) => {
  const [app, setApp] = useState<AppId>();
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState("");
  const [nameError, setNameError] = useState<string>();
  const [appError, setAppError] = useState(false);
  const entry = app ? apps[app] : undefined;
  const chosen = entry?.methods.find((m) => m.value === method) ?? entry?.methods[0];
  const matches = appIds.filter((id) =>
    `${apps[id].name} ${apps[id].category}`.toLowerCase().includes(query.trim().toLowerCase())
  );
  const appRow = (id: AppId) => (
    <ListRow
      key={id}
      value={id}
      label={apps[id].name}
      title={apps[id].name}
      description={apps[id].category}
      media={<AppLogo app={id} />}
      current={app === id}
      onClick={() => {
        setApp(id);
        setAppError(false);
        setMethod(apps[id].methods[0].value);
        if (!name) setName(`${id}-connection`);
      }}
    />
  );
  const reset = () => {
    setApp(undefined);
    setQuery("");
    setName("");
    setDescription("");
    setMethod("");
    setNameError(undefined);
    setAppError(false);
  };
  return (
    <MultiStep
      variant="sheet"
      title="New connection"
      description="Connect a third-party app once and reuse it across your projects."
      trigger={
        <Button variant="primary" icon="plus">
          New connection
        </Button>
      }
      completeLabel={entry ? `Connect ${entry.name}` : "Connect"}
      onCancel={reset}
      onComplete={() => {
        if (!app || !chosen) return;
        onCreate({
          id: `c${Date.now()}`,
          app,
          name: name.trim(),
          description: description.trim() || undefined,
          method: chosen.label,
          status: connected
        });
        reset();
      }}
      steps={[
        {
          title: "App",
          heading: "Pick an app",
          description:
            "Infisical reads from or writes to this app with the credentials you add next.",
          summary: entry?.name,
          validate: () => {
            if (app) return true;
            setAppError(true);
            return "Pick an app to continue.";
          },
          content: (
            <Stack gap={12}>
              <Input
                icon="search"
                placeholder="Search apps, such as AWS or Vault"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-invalid={appError || undefined}
              />
              <List
                label="Apps"
                size="sm"
                empty={
                  <EmptyState
                    size="sm"
                    media="bare"
                    icon="search"
                    title={`No apps match “${query}”`}
                    actions={
                      <Button variant="link" onClick={() => setQuery("")}>
                        Clear search
                      </Button>
                    }
                  />
                }
              >
                {query.trim()
                  ? matches.map(appRow)
                  : [
                      <ListSection key="popular" label="Popular">
                        {popular.map(appRow)}
                      </ListSection>,
                      <ListSection key="all" label="All apps">
                        {appIds.filter((id) => !popular.includes(id)).map(appRow)}
                      </ListSection>
                    ]}
              </List>
            </Stack>
          )
        },
        {
          title: "Configure",
          heading: entry ? `Configure ${entry.name}` : "Configure",
          description: "Credentials are encrypted and never shown again after you connect.",
          summary: name || undefined,
          validate: () => {
            const value = name.trim();
            let error: string | undefined;
            if (!value) error = "Enter a name.";
            else if (!/^[a-z0-9-]+$/.test(value))
              error = "Use lowercase letters, numbers and dashes.";
            setNameError(error);
            return !error;
          },
          content: (
            <Stack gap={16}>
              <Field
                label="Name"
                description="Lowercase letters, numbers and dashes."
                error={nameError}
              >
                <Input mono value={name} onChange={(event) => setName(event.target.value)} />
              </Field>
              <Field label="Description" optional>
                <Textarea
                  rows={2}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
              {entry && (
                <Field label="Method">
                  <Select
                    aria-label="Method"
                    options={entry.methods.map(({ value, label }) => ({ value, label }))}
                    value={chosen?.value}
                    onChange={setMethod}
                  />
                </Field>
              )}
              {chosen?.fields.map((field) => (
                <Field key={`${chosen.value}-${field.label}`} label={field.label}>
                  <Input mono type={field.secret ? "password" : "text"} />
                </Field>
              ))}
            </Stack>
          )
        },
        {
          title: "Review",
          heading: "Review the connection",
          description: "Infisical checks the credentials before it saves the connection.",
          content: (
            <DataList
              variant="props"
              items={[
                ["App", entry?.name ?? ""],
                ["Name", <code key="name">{name}</code>],
                ["Method", chosen?.label ?? ""],
                ["Managed by", "Organization"]
              ]}
            />
          )
        }
      ]}
    />
  );
};

export default function Connections() {
  const { org } = useCrumbs();
  const [rows, setRows] = useState(seed);
  const [tab, setTab] = useState("connections");
  const [scope, setScope] = useState("org");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AppId[]>([]);
  const [banner, setBanner] = useState(true);
  const [sort, setSort] = useState<{ columnId: string; direction: "asc" | "desc" }>({
    columnId: "app",
    direction: "asc"
  });
  const orgRows = rows.filter((row) => !row.project);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const key = (row: Connection) =>
      ({ app: apps[row.app].name, name: row.name, method: row.method, managed: row.project ?? "" })[
        sort.columnId as "app"
      ] ?? row.name;
    return (scope === "org" ? orgRows : rows)
      .filter((row) => !filter.length || filter.includes(row.app))
      .filter((row) =>
        [apps[row.app].name, row.name, row.method].some((v) => v.toLowerCase().includes(needle))
      )
      .sort(
        (a, b) =>
          key(a).localeCompare(key(b)) * (sort.direction === "asc" ? 1 : -1) ||
          a.name.localeCompare(b.name)
      );
  }, [rows, orgRows, scope, query, filter, sort]);
  const columns: DataTableColumn<Connection>[] = [
    {
      id: "app",
      header: "App",
      sortable: true,
      width: 220,
      text: (r) => apps[r.app].name,
      render: (r) => (
        <Inline gap={8} align="center">
          <AppLogo app={r.app} />
          {apps[r.app].name}
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
      text: (r) => r.method,
      render: (r) => r.method
    },
    {
      id: "managed",
      header: "Managed by",
      sortable: true,
      width: 180,
      render: (r) =>
        r.project ? (
          <Button variant="link" asChild>
            <a href={`#compare-connections/${r.project}`} onClick={(e) => e.preventDefault()}>
              <code>{r.project}</code>
            </a>
          </Button>
        ) : (
          "Organization"
        )
    },
    {
      id: "status",
      header: "Status",
      width: 200,
      render: (r) => (
        <Badge tone={r.status.tone} dot={r.status.tone !== "soft"}>
          {r.status.label}
        </Badge>
      )
    },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      hideHeader: true,
      render: (r) => (
        <RowActions row={r} onDelete={() => setRows((all) => all.filter((x) => x.id !== r.id))} />
      )
    }
  ];
  const filtered = Boolean(query.trim() || filter.length);
  return (
    <Shell level="org" current="integrations" crumbs={[org, { label: "Integrations" }]}>
      <Stack gap={24}>
        <PageHeader
          title="Integrations"
          description="Connect Infisical to external services and manage organization-wide integrations."
          actions={<NewConnection onCreate={(c) => setRows((all) => [...all, c])} />}
          tabs={
            <Tabs
              label="Integration sections"
              value={tab}
              onChange={setTab}
              tabs={[
                {
                  value: "connections",
                  label: "App connections",
                  count: orgRows.length,
                  content: null
                },
                { value: "workflow", label: "Workflow integrations", content: null },
                { value: "migrations", label: "External migrations", content: null }
              ]}
            />
          }
        />
        {tab === "connections" && (
          <>
            {banner && (
              <Banner icon="info" onDismiss={() => setBanner(false)}>
                Projects can now create and manage their own app connections. Switch to All to see
                them here.
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
                  placeholder="Search by app, name or method"
                  kbd="/"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
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
                  {[...new Set(rows.map((r) => r.app))].sort().map((id) => (
                    <DropdownMenuCheckboxItem
                      key={id}
                      checked={filter.includes(id)}
                      onCheckedChange={(on) =>
                        setFilter((all) => (on ? [...all, id] : all.filter((x) => x !== id)))
                      }
                    >
                      {apps[id].name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </Inline>
            <DataTable
              label="App connections"
              rows={visible}
              columns={columns}
              getRowId={(r) => r.id}
              rowLabel={(r) => r.name}
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
              footer={`${visible.length} of ${scope === "org" ? orgRows.length : rows.length} connections`}
            />
          </>
        )}
        {tab === "workflow" && (
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
        )}
        {tab === "migrations" && (
          <List label="Migration sources" title="Import from another secret manager">
            {[
              [
                "vault",
                "HCP Vault",
                "Import key vaults or namespaces as projects and environments"
              ],
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
    </Shell>
  );
}
