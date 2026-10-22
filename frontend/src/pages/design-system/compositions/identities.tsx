import { useMemo, useState } from "react";

import { Avatar } from "@app/components/v4/ui/avatar";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Media } from "@app/components/v4/ui/item";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { DataList, List, ListRow } from "@app/components/v4/ui/list";
import { PageHeader } from "@app/components/v4/ui/page-header";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Snippet } from "@app/components/v4/ui/snippet";
import { Tabs } from "@app/components/v4/ui/tabs";

import { Shell, useCrumbs } from "./shared";

type AuthKind = "universal" | "kubernetes" | "oidc" | "token" | "aws";
const authNames: Record<AuthKind, string> = {
  universal: "Universal Auth",
  kubernetes: "Kubernetes Auth",
  oidc: "OIDC Auth",
  token: "Token Auth",
  aws: "AWS Auth"
};
type Membership = { project: string; role: string; added: string };
type Identity = {
  id: string;
  name: string;
  role: string;
  project?: string;
  auth: AuthKind[];
  lockedOut?: AuthKind;
  lastUsed: string;
  lastMethod?: AuthKind;
  created: string;
  metadata: [string, string][];
  projects: Membership[];
  deleteProtection?: boolean;
};
const identities: Identity[] = [
  {
    id: "4b1e8c2a-93f0-4d55-a1c6-0e7d2f9b3a11",
    name: "ci-deployer",
    role: "Member",
    auth: ["universal", "oidc"],
    lastUsed: "4 minutes ago",
    lastMethod: "oidc",
    created: "Mar 4, 2026",
    metadata: [
      ["team", "platform"],
      ["runner", "github-actions"]
    ],
    projects: [
      { project: "payments-api", role: "Developer", added: "Mar 4, 2026" },
      { project: "web-dashboard", role: "Developer", added: "Mar 4, 2026" },
      { project: "platform-core", role: "Viewer", added: "Apr 18, 2026" }
    ],
    deleteProtection: true
  },
  {
    id: "9d27a4f1-0c3b-4e8a-b5f2-6a1d7c4e2b90",
    name: "k8s-payments-api",
    role: "No access",
    auth: ["kubernetes", "universal"],
    lastUsed: "12 minutes ago",
    lastMethod: "kubernetes",
    created: "Jan 22, 2026",
    metadata: [
      ["team", "payments"],
      ["cluster", "prod-us-east-1"]
    ],
    projects: [
      { project: "payments-api", role: "Viewer", added: "Jan 22, 2026" },
      { project: "kms-keys", role: "Encrypt and decrypt", added: "Feb 9, 2026" }
    ],
    deleteProtection: true
  },
  {
    id: "1f6c3e9b-7a24-4d0e-8b51-c2e9a7d40f36",
    name: "terraform-runner",
    role: "Admin",
    auth: ["universal"],
    lockedOut: "universal",
    lastUsed: "2 hours ago",
    lastMethod: "universal",
    created: "Nov 30, 2025",
    metadata: [["team", "platform"]],
    projects: [{ project: "platform-core", role: "Admin", added: "Nov 30, 2025" }]
  },
  {
    id: "c83b5d07-2e91-4f6a-9c4d-8b0f1e7a5d22",
    name: "vercel-preview-sync",
    role: "Member",
    auth: ["token"],
    lastUsed: "3 days ago",
    lastMethod: "token",
    created: "May 12, 2026",
    metadata: [],
    projects: [{ project: "web-dashboard", role: "Viewer", added: "May 12, 2026" }]
  },
  {
    id: "e5a90f4c-6b17-4c3d-a2e8-3d9c0b6f1a74",
    name: "backup-signer",
    role: "Encrypt and decrypt",
    project: "kms-keys",
    auth: ["aws"],
    lastUsed: "1 day ago",
    lastMethod: "aws",
    created: "Jun 2, 2026",
    metadata: [["key", "backup-signing"]],
    projects: [{ project: "kms-keys", role: "Encrypt and decrypt", added: "Jun 2, 2026" }]
  },
  {
    id: "7b2d6e81-5f3a-4b9c-8e07-1a4c9d2f6b58",
    name: "cert-renewer",
    role: "Certificate requester",
    project: "internal-pki",
    auth: ["kubernetes"],
    lastUsed: "Never",
    created: "Oct 20, 2026",
    metadata: [],
    projects: [{ project: "internal-pki", role: "Certificate requester", added: "Oct 20, 2026" }]
  }
];

const authDetails = (identity: Identity, kind: AuthKind): [string, React.ReactNode][] => {
  const tokens: [string, React.ReactNode][] = [
    ["Access token TTL", "30 days"],
    ["Access token max TTL", "30 days"],
    ["Max number of uses", "Unlimited"],
    ["Access token trusted IPs", <code key="ips">0.0.0.0/0, ::/0</code>]
  ];
  const specific: Record<AuthKind, [string, React.ReactNode][]> = {
    universal: [
      ["Client secret trusted IPs", <code key="cips">10.20.0.0/16</code>],
      ["Lockout", identity.lockedOut === "universal" ? "Enabled, locked out" : "Enabled"]
    ],
    kubernetes: [
      ["Kubernetes host", <code key="host">https://10.0.0.1:443</code>],
      ["Token review mode", "Gateway"],
      ["Allowed namespaces", <code key="ns">payments, payments-canary</code>],
      ["Allowed service accounts", <code key="sa">payments-api, payments-worker</code>],
      ["Allowed audience", "Any"]
    ],
    oidc: [
      ["Discovery URL", <code key="disc">https://token.actions.githubusercontent.com</code>],
      ["Bound issuer", <code key="iss">https://token.actions.githubusercontent.com</code>],
      ["Bound subject", <code key="sub">repo:acme/*:ref:refs/heads/main</code>],
      ["Bound audiences", <code key="aud">https://github.com/acme</code>]
    ],
    token: [],
    aws: [
      ["Allowed principal ARNs", <code key="arn">arn:aws:iam::441700233914:role/backup</code>],
      ["Allowed account IDs", <code key="acct">441700233914</code>]
    ]
  };
  return [...specific[kind], ...tokens];
};

const AuthSheet = ({
  identity,
  kind,
  onOpenChange
}: {
  identity: Identity;
  kind?: AuthKind;
  onOpenChange: (open: boolean) => void;
}) => {
  const [secrets, setSecrets] = useState([
    {
      id: "s1",
      description: "GitHub Actions deploy",
      prefix: "9f3a",
      uses: "214 uses",
      expires: "never expires"
    },
    {
      id: "s2",
      description: "Local debugging",
      prefix: "c1e7",
      uses: "3 of 10 uses",
      expires: "expires Nov 2, 2026"
    }
  ]);
  const [tokens, setTokens] = useState([
    { id: "t1", name: "preview-builds", meta: "Expires in 21 days" },
    { id: "t2", name: "production-sync", meta: "Never expires" }
  ]);
  return (
    <Sheet open={Boolean(kind)} onOpenChange={onOpenChange}>
      <SheetContent>
        {kind && (
          <>
            <SheetHeader>
              <SheetTitle>{authNames[kind]}</SheetTitle>
              <SheetDescription>
                How <code>{identity.name}</code> signs in to get an access token.
              </SheetDescription>
            </SheetHeader>
            <SheetBody>
              <Stack gap={24}>
                {kind === "universal" && (
                  <Field label="Client ID">
                    <Snippet label="Client ID" value="b7f1d2c4-58e3-4a0f-9e6b-2c8d1a7f3e05" />
                  </Field>
                )}
                <DataList variant="props" items={authDetails(identity, kind)} />
                {kind === "universal" && (
                  <List
                    label="Client secrets"
                    title="Client secrets"
                    action={
                      <Button variant="outline" size="sm" icon="plus">
                        Create
                      </Button>
                    }
                    empty={
                      <EmptyState size="sm" media="bare" icon="key" title="No client secrets" />
                    }
                  >
                    {secrets.map((s) => (
                      <ListRow
                        key={s.id}
                        value={s.id}
                        label={s.description}
                        title={s.description}
                        description={
                          <>
                            Starts with <code>{s.prefix}</code>, {s.uses}, {s.expires}
                          </>
                        }
                        actions={
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSecrets((all) => all.filter((x) => x.id !== s.id))}
                          >
                            Revoke
                          </Button>
                        }
                      />
                    ))}
                  </List>
                )}
                {kind === "token" && (
                  <List
                    label="Access tokens"
                    title="Access tokens"
                    action={
                      <Button variant="outline" size="sm" icon="plus">
                        Create
                      </Button>
                    }
                    empty={
                      <EmptyState size="sm" media="bare" icon="key" title="No access tokens" />
                    }
                  >
                    {tokens.map((t) => (
                      <ListRow
                        key={t.id}
                        value={t.id}
                        label={t.name}
                        title={<code>{t.name}</code>}
                        description={t.meta}
                        actions={
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setTokens((all) => all.filter((x) => x.id !== t.id))}
                          >
                            Revoke
                          </Button>
                        }
                      />
                    ))}
                  </List>
                )}
              </Stack>
            </SheetBody>
            <SheetFooter>
              <Inline gap={8} justify="end">
                <Button variant="outline" icon="settings">
                  Edit {authNames[kind]}
                </Button>
                <SheetClose asChild>
                  <Button variant="primary">Done</Button>
                </SheetClose>
              </Inline>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

const ProjectLink = ({ project }: { project: string }) => (
  <Button variant="link" asChild>
    <a href={`#compare-identities/${project}`} onClick={(event) => event.preventDefault()}>
      <code>{project}</code>
    </a>
  </Button>
);

const Detail = ({ identity, onBack }: { identity: Identity; onBack: () => void }) => {
  const [authKind, setAuthKind] = useState<AuthKind>();
  const projectColumns: DataTableColumn<Membership>[] = [
    {
      id: "project",
      header: "Project",
      primary: true,
      grow: true,
      text: (r) => r.project,
      render: (r) => <ProjectLink project={r.project} />
    },
    { id: "role", header: "Role", width: 200, render: (r) => <Badge tone="soft">{r.role}</Badge> },
    { id: "added", header: "Added on", width: 140, render: (r) => r.added },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      hideHeader: true,
      render: (r) => (
        <Button variant="ghost" size="icon-sm" icon="more" iconOnly>
          {`Actions for ${r.project}`}
        </Button>
      )
    }
  ];
  return (
    <Stack gap={24}>
      <Stack gap={12}>
        <div>
          <Button variant="link" icon="chev-left" onClick={onBack}>
            Machine identities
          </Button>
        </div>
        <PageHeader
          title={identity.name}
          mono
          media={<Avatar size="lg" name={identity.name} kind="machine" />}
          badges={identity.project ? <Badge tone="soft">Project identity</Badge> : undefined}
          description="Configure and manage this machine identity and its organization access."
          actions={
            <>
              <Button
                variant="outline"
                icon="copy"
                onClick={() => navigator.clipboard?.writeText(identity.id)}
              >
                Copy ID
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" icon="more" iconOnly>
                    More actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>Edit machine identity</DropdownMenuItem>
                  <DropdownMenuItem>Set up alerts</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" disabled={identity.deleteProtection}>
                    {identity.deleteProtection
                      ? "Delete is blocked by delete protection"
                      : "Delete machine identity"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        />
      </Stack>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 3fr)",
          gap: "var(--v4-space-24)",
          alignItems: "start"
        }}
      >
        <Card title="Details">
          <DataList
            variant="props"
            items={[
              ["ID", <code key="id">{identity.id}</code>],
              [
                "Managed by",
                identity.project ? (
                  <ProjectLink key="p" project={identity.project} />
                ) : (
                  "Organization"
                )
              ],
              ["Organization role", identity.role],
              [
                "Metadata",
                identity.metadata.length ? (
                  <Inline key="meta" gap={8} wrap>
                    {identity.metadata.map(([k, v]) => (
                      <Badge key={k} tone="outline" mono>
                        {k}={v}
                      </Badge>
                    ))}
                  </Inline>
                ) : (
                  "None"
                )
              ],
              ["Created", identity.created],
              [
                "Last login",
                identity.lastMethod
                  ? `${identity.lastUsed} with ${authNames[identity.lastMethod]}`
                  : "Never"
              ],
              ["Delete protection", identity.deleteProtection ? "On" : "Off"]
            ]}
          />
        </Card>
        <Stack gap={24}>
          <List
            label="Auth methods"
            title="Authentication"
            action={
              <Button variant="outline" size="sm" icon="plus">
                Add auth method
              </Button>
            }
            empty={
              <EmptyState
                size="sm"
                icon="lock"
                title="No auth methods yet"
                description="Add an auth method so this machine identity can sign in."
              />
            }
          >
            {identity.auth.map((kind) => (
              <ListRow
                key={kind}
                value={kind}
                label={authNames[kind]}
                title={authNames[kind]}
                media={
                  <Media
                    icon={kind === "universal" || kind === "token" ? "key" : "lock"}
                    size="sm"
                  />
                }
                description={
                  kind === identity.lastMethod
                    ? `Last used ${identity.lastUsed}`
                    : "Not used in the last 30 days"
                }
                badge={
                  identity.lockedOut === kind ? (
                    <Badge tone="bad" dot>
                      Locked out
                    </Badge>
                  ) : undefined
                }
                onClick={() => setAuthKind(kind)}
              />
            ))}
          </List>
          <Card
            title="Projects"
            flush
            action={
              <Button variant="outline" size="sm" icon="plus">
                Add to project
              </Button>
            }
          >
            <DataTable
              label={`Projects ${identity.name} belongs to`}
              rows={identity.projects}
              columns={projectColumns}
              getRowId={(r) => r.project}
              rowLabel={(r) => r.project}
              empty={
                <EmptyState size="sm" media="bare" icon="folder" title="Not in any project yet" />
              }
            />
          </Card>
        </Stack>
      </div>
      <AuthSheet
        identity={identity}
        kind={authKind}
        onOpenChange={(open) => !open && setAuthKind(undefined)}
      />
    </Stack>
  );
};

export default function Identities() {
  const { org } = useCrumbs();
  const [openId, setOpenId] = useState<string>();
  const [scope, setScope] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ columnId: string; direction: "asc" | "desc" }>({
    columnId: "name",
    direction: "asc"
  });
  const open = identities.find((identity) => identity.id === openId);
  const counts = {
    org: identities.filter((i) => !i.project).length,
    project: identities.filter((i) => i.project).length
  };
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return identities
      .filter((i) => scope === "all" || (scope === "project") === Boolean(i.project))
      .filter((i) => [i.name, i.role].some((v) => v.toLowerCase().includes(needle)))
      .sort((a, b) => {
        const key = sort.columnId === "role" ? "role" : "name";
        return a[key].localeCompare(b[key]) * (sort.direction === "asc" ? 1 : -1);
      });
  }, [scope, query, sort]);
  const columns: DataTableColumn<Identity>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      sortable: true,
      grow: true,
      text: (r) => r.name,
      render: (r) => (
        <Inline gap={12} align="center">
          <Avatar size={24} name={r.name} kind="machine" />
          <Button variant="link" asChild>
            <a
              href={`#compare-identities/${r.name}`}
              onClick={(event) => {
                event.preventDefault();
                setOpenId(r.id);
              }}
            >
              {r.name}
            </a>
          </Button>
        </Inline>
      )
    },
    {
      id: "role",
      header: "Role",
      sortable: true,
      width: 220,
      render: (r) => <Badge tone={r.role === "No access" ? "outline" : "soft"}>{r.role}</Badge>
    },
    {
      id: "managed",
      header: "Managed by",
      width: 180,
      render: (r) => (r.project ? <ProjectLink project={r.project} /> : "Organization")
    },
    {
      id: "auth",
      header: "Auth methods",
      width: 280,
      text: (r) => r.auth.map((k) => authNames[k]).join(", "),
      render: (r) => (
        <Inline gap={8} align="center">
          {r.auth.map((k) => authNames[k]).join(", ")}
          {r.lockedOut && (
            <Badge tone="bad" dot>
              Locked out
            </Badge>
          )}
        </Inline>
      )
    },
    { id: "used", header: "Last used", width: 160, render: (r) => r.lastUsed },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      hideHeader: true,
      render: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" icon="more" iconOnly>
              {`Actions for ${r.name}`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setOpenId(r.id)}>
              {r.project ? "Open in project" : "View machine identity"}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={Boolean(r.project)}>Add auth method</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={Boolean(r.project || r.deleteProtection)}
            >
              Delete machine identity
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];
  return (
    <Shell
      level="org"
      current="access"
      crumbs={
        open
          ? [
              org,
              { label: "Access control" },
              { label: "Machine identities" },
              { label: open.name, mono: true }
            ]
          : [org, { label: "Access control" }]
      }
    >
      {open ? (
        <Detail key={open.id} identity={open} onBack={() => setOpenId(undefined)} />
      ) : (
        <Stack gap={24}>
          <PageHeader
            title="Access control"
            description="Manage fine-grained access for users, groups, roles, and machine identities within your organization."
            actions={
              <Button variant="primary" icon="plus">
                Create machine identity
              </Button>
            }
            tabs={
              <Tabs
                label="Access sections"
                defaultValue="identities"
                tabs={[
                  { value: "users", label: "Users", count: 7 },
                  { value: "identities", label: "Machine identities", count: identities.length },
                  { value: "groups", label: "Groups" },
                  { value: "roles", label: "Roles", count: 5 }
                ]}
              />
            }
          />
          <Inline gap={8} align="center">
            <Tabs
              variant="segmented"
              label="Machine identity scope"
              value={scope}
              onChange={setScope}
              tabs={[
                { value: "org", label: "Organization", count: counts.org },
                { value: "project", label: "Project", count: counts.project },
                { value: "all", label: "All", count: identities.length }
              ]}
            />
            <div style={{ flex: 1 }}>
              <Input
                icon="search"
                placeholder="Search machine identities by name or role"
                kbd="/"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Button variant="outline" icon="file">
              Auth templates
            </Button>
          </Inline>
          <DataTable
            label="Machine identities"
            rows={rows}
            columns={columns}
            getRowId={(r) => r.id}
            rowLabel={(r) => r.name}
            sort={sort}
            onSortChange={setSort}
            empty={
              query.trim() ? (
                <EmptyState
                  size="sm"
                  icon="search"
                  title={`No machine identities match “${query.trim()}”`}
                  actions={
                    <Button variant="link" onClick={() => setQuery("")}>
                      Clear search
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  size="sm"
                  icon="machine"
                  title="No machine identities yet"
                  description="Machine identities let CI jobs, workloads and scripts reach secrets without a person."
                />
              )
            }
            footer={`${rows.length} of ${identities.length} machine identities`}
          />
        </Stack>
      )}
    </Shell>
  );
}
